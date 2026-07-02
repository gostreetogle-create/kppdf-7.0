import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ConfigService } from '@nestjs/config';
import {
  ImportJob,
  ImportStatus,
  ImportSourceType,
  ImportEntityType,
} from './schemas/import-job.schema';
import { IImportStrategy } from './strategies/i-import.strategy';

const IMPORT_STRATEGIES = 'IMPORT_STRATEGIES';

/**
 * IngestionService — manages ImportJob lifecycle and enqueues async work.
 *
 * Responsibilities:
 * - CRUD for ImportJob documents (BR-IMP-5: not cascade-deleted with User)
 * - Enqueue jobs to BullMQ 'imports' queue
 * - Cancel pending jobs
 * - Orchestrate strategy resolution
 */
@Injectable()
export class IngestionService {
  private readonly log = new Logger(IngestionService.name);
  private readonly importsDir: string;

  constructor(
    @InjectModel(ImportJob.name) private readonly importJobModel: Model<ImportJob>,
    @InjectQueue('imports') private readonly importsQueue: Queue,
    @Inject(IMPORT_STRATEGIES) private readonly strategies: IImportStrategy[],
    private readonly config: ConfigService,
  ) {
    this.importsDir = path.join(
      this.config.get<string>('app.uploadsDir') ?? './uploads',
      'imports',
    );
    this.ensureImportDir();
  }

  // ──────────────── CRUD ────────────────

  async create(data: {
    sourceType: ImportSourceType;
    entityType: ImportEntityType;
    sourceFile?: string;
    sourceUrl?: string;
    sourceOptions?: Record<string, any>;
    createdByUserId: string;
  }): Promise<ImportJob> {
    const job = await this.importJobModel.create({
      sourceType: data.sourceType,
      entityType: data.entityType,
      sourceFile: data.sourceFile,
      sourceUrl: data.sourceUrl,
      sourceOptions: data.sourceOptions ?? {},
      status: ImportStatus.PENDING,
      progressPercent: 0,
      totalRecords: 0,
      processedRecords: 0,
      successRecords: 0,
      failedRecords: 0,
      errorLog: [],
      createdByUserId: new Types.ObjectId(data.createdByUserId),
    });

    return job;
  }

  async findById(id: string): Promise<ImportJob> {
    const job = await this.importJobModel.findById(id).exec();
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  async findAll(query: {
    status?: ImportStatus;
    entityType?: ImportEntityType;
    createdByUserId?: string;
    limit?: number;
    skip?: number;
  } = {}): Promise<{ jobs: ImportJob[]; total: number }> {
    const filter: Record<string, any> = { deletedAt: null };

    if (query.status) filter.status = query.status;
    if (query.entityType) filter.entityType = query.entityType;
    if (query.createdByUserId) filter.createdByUserId = new Types.ObjectId(query.createdByUserId);

    const [jobs, total] = await Promise.all([
      this.importJobModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(query.skip ?? 0)
        .limit(query.limit ?? 20)
        .exec(),
      this.importJobModel.countDocuments(filter).exec(),
    ]);

    return { jobs, total };
  }

  async cancel(id: string): Promise<ImportJob> {
    const job = await this.findById(id);

    if (job.status === ImportStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed import');
    }
    if (job.status === ImportStatus.CANCELLED) {
      throw new BadRequestException('Import is already cancelled');
    }

    job.status = ImportStatus.CANCELLED;
    job.completedAt = new Date();
    await job.save();

    // Remove from queue if still pending
    try {
      await this.importsQueue.remove(String(job._id));
    } catch {
      // Job might already be processing — ignore
    }

    this.log.log(`Import ${id} cancelled`);
    return job;
  }

  async remove(id: string): Promise<void> {
    const job = await this.findById(id);
    job.deletedAt = new Date();
    await job.save();
  }

  // ──────────────── ENQUEUE ────────────────

  async enqueueJob(job: ImportJob): Promise<void> {
    await this.importsQueue.add(
      job.sourceType,
      { importJobId: String(job._id) },
      {
        jobId: String(job._id),
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    this.log.log(`Job ${job._id} enqueued (type: ${job.sourceType})`);
  }

  // ──────────────── PROGRESS (called by processor) ────────────────

  async updateProgress(
    jobId: string,
    data: {
      processed: number;
      success: number;
      failed: number;
      errors: Array<{ rowIndex: number; errorMessage: string; rawData?: Record<string, any> }>;
    },
  ): Promise<void> {
    const job = await this.importJobModel.findById(jobId).exec();
    if (!job || job.status === ImportStatus.CANCELLED) return;

    job.processedRecords = data.processed;
    job.successRecords = data.success;
    job.failedRecords = data.failed;

    // Append errors up to 1000 (BR-IMP-3)
    if (data.errors.length > 0) {
      const existing = job.errorLog ?? [];
      job.errorLog = [...existing, ...data.errors].slice(0, 1000);
      job.status = data.failed > 0 ? ImportStatus.FAILED : ImportStatus.PROCESSING;
    }

    // Estimate total (if not set) from processed count
    if (job.totalRecords === 0 && data.processed > 0) {
      job.totalRecords = data.processed;
    }

    // Calculate progress percent
    if (job.totalRecords > 0) {
      job.progressPercent = Math.min(
        100,
        Math.round((data.processed / job.totalRecords) * 100),
      );
    }

    await job.save();
  }

  async completeJob(jobId: string): Promise<void> {
    const job = await this.importJobModel.findById(jobId).exec();
    if (!job || job.status === ImportStatus.CANCELLED) return;

    job.status = job.failedRecords > 0
      ? ImportStatus.COMPLETED  // partial success
      : ImportStatus.COMPLETED;
    job.progressPercent = 100;
    job.completedAt = new Date();
    job.startedAt ??= new Date();
    await job.save();

    this.log.log(`Job ${jobId} completed (${job.successRecords} success, ${job.failedRecords} failed)`);
  }

  async failJob(jobId: string, errorMessage: string): Promise<void> {
    const job = await this.importJobModel.findById(jobId).exec();
    if (!job || job.status === ImportStatus.CANCELLED) return;

    job.status = ImportStatus.FAILED;
    job.completedAt = new Date();
    job.startedAt ??= new Date();

    // Append to errorLog
    const errors = job.errorLog ?? [];
    job.errorLog = [
      ...errors,
      {
        rowIndex: -1,
        errorMessage,
        rawData: undefined,
      },
    ].slice(0, 1000);

    await job.save();
    this.log.error(`Job ${jobId} failed: ${errorMessage}`);
  }

  // ──────────────── STRATEGY RESOLUTION ────────────────

  getStrategy(sourceType: ImportSourceType): IImportStrategy {
    for (const s of this.strategies) {
      if (s.sourceType === sourceType) return s;
    }
    throw new Error(`No strategy registered for source type: ${sourceType}`);
  }

  // ──────────────── FILE HELPERS ────────────────

  getImportsDir(): string {
    return this.importsDir;
  }

  saveUploadedFile(buffer: Buffer, originalName: string): string {
    this.ensureImportDir();
    const ext = path.extname(originalName) || '.bin';
    const filename = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}${ext}`;
    const filePath = path.join(this.importsDir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  private ensureImportDir(): void {
    if (!fs.existsSync(this.importsDir)) {
      fs.mkdirSync(this.importsDir, { recursive: true });
    }
  }
}
