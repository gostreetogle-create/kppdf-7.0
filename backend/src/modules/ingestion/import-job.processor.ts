import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ImportStatus } from './schemas/import-job.schema';
import { IngestionService } from './ingestion.service';

/**
 * ImportJobProcessor — BullMQ worker that executes import strategies.
 *
 * Flow:
 * 1. BullMQ delivers job → Processor fetches ImportJob from DB
 * 2. Resolves strategy by sourceType (Excel/JSON/API)
 * 3. Executes strategy with progress callback
 * 4. On completion: marks job COMPLETED
 * 5. On error: marks job FAILED with error message
 *
 * BR-IMP-2: progress callback updates after each batch
 * BR-IMP-4: status transitions enforced
 *
 * Note: @Process() decorator is NOT available in @nestjs/bullmq v11.
 * Instead, WorkerHost.process() handles ALL jobs from the queue.
 * Job name is dispached via job.name ('EXCEL', 'JSON', 'API').
 */
@Processor('imports')
export class ImportJobProcessor extends WorkerHost {
  private readonly log = new Logger(ImportJobProcessor.name);

  constructor(private readonly ingestionService: IngestionService) {
    super();
  }

  async process(bullJob: Job<{ importJobId: string }>): Promise<void> {
    const { importJobId } = bullJob.data;

    try {
      // Load job from DB
      const importJob = await this.ingestionService.findById(importJobId);

      if (importJob.status === ImportStatus.CANCELLED) {
        this.log.warn(`Job ${importJobId} was cancelled, skipping`);
        return;
      }

      // Mark as PROCESSING
      importJob.status = ImportStatus.PROCESSING;
      importJob.startedAt = new Date();
      await importJob.save();

      // Resolve and execute strategy
      const strategy = this.ingestionService.getStrategy(importJob.sourceType);

      // AbortSignal for cancellation support
      const abortController = new AbortController();

      // Periodically check if job was cancelled
      const cancelCheck = setInterval(async () => {
        try {
          const current = await this.ingestionService.findById(importJobId);
          if (current.status === ImportStatus.CANCELLED) {
            abortController.abort();
          }
        } catch {
          // Job might be deleted — abort
          abortController.abort();
        }
      }, 5000);

      try {
        await strategy.execute(
          importJob,
          async (processed, success, failed, errors) => {
            await this.ingestionService.updateProgress(importJobId, {
              processed,
              success,
              failed,
              errors,
            });
          },
          abortController.signal,
        );

        await this.ingestionService.completeJob(importJobId);
      } finally {
        clearInterval(cancelCheck);
      }
    } catch (err: any) {
      this.log.error(`Import job ${importJobId} failed: ${err.message}`);
      await this.ingestionService.failJob(importJobId, err.message ?? String(err));
    }
  }
}
