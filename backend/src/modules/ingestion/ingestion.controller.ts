import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { IngestionService } from './ingestion.service';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';
import {
  ImportEntityType,
  ImportSourceType,
  ImportStatus,
} from './schemas/import-job.schema';
import { CreateImportJobDto } from './dto/import-job.dto';

/**
 * IngestionController — REST endpoints for import management.
 *
 * Endpoints:
 *   POST   /api/imports/excel    — Upload Excel file → create import job
 *   POST   /api/imports/json     — Submit JSON data → create import job
 *   POST   /api/imports/api      — Submit API URL → create import job
 *   GET    /api/imports          — List import jobs
 *   GET    /api/imports/:id      — Get job details
 *   POST   /api/imports/:id/cancel — Cancel a pending/processing job
 *   DELETE /api/imports/:id      — Soft-delete job
 */
@Controller('imports')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * POST /api/imports/excel — Upload an Excel file for import.
   *
   * Body: multipart/form-data with field "file" (required) and optional form fields:
   *   - entityType: PRODUCTS | ORGANIZATIONS | USERS
   *   - sourceOptions: JSON string (optional)
   */
  @Post('excel')
  @Permissions(PERMISSION_KEYS.IMPORTS_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    }),
  )
  async importExcel(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('entityType') entityType?: ImportEntityType,
    @Body('sourceOptions') sourceOptions?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }

    const type = this.parseEntityType(entityType);
    const opts = sourceOptions ? this.parseJsonSafe(sourceOptions) : {};

    // Save uploaded file to disk for async worker
    const filePath = this.ingestionService.saveUploadedFile(file.buffer, file.originalname);

    const job = await this.ingestionService.create({
      sourceType: ImportSourceType.EXCEL,
      entityType: type,
      sourceFile: filePath,
      sourceOptions: opts,
      createdByUserId: (req.user as any)?._id ?? (req.user as any)?.userId ?? 'unknown',
    });

    // Enqueue for background processing
    await this.ingestionService.enqueueJob(job);

    return {
      message: 'Excel import job created',
      jobId: job._id,
      status: job.status,
    };
  }

  /**
   * POST /api/imports/json — Submit JSON data for import.
   *
   * Body: JSON with:
   *   - entityType: PRODUCTS | ORGANIZATIONS | USERS
   *   - data: array of objects
   *   - sourceOptions: optional extra config
   */
  @Post('json')
  @Permissions(PERMISSION_KEYS.IMPORTS_WRITE)
  async importJson(
    @Body() body: { entityType: ImportEntityType; data: Record<string, any>[]; sourceOptions?: Record<string, any> },
    @Req() req: Request,
  ) {
    if (!body.data || !Array.isArray(body.data) || body.data.length === 0) {
      throw new BadRequestException('data must be a non-empty array');
    }

    const job = await this.ingestionService.create({
      sourceType: ImportSourceType.JSON,
      entityType: this.parseEntityType(body.entityType),
      sourceOptions: { ...(body.sourceOptions ?? {}), data: body.data },
      createdByUserId: (req.user as any)?._id ?? (req.user as any)?.userId ?? 'unknown',
    });

    await this.ingestionService.enqueueJob(job);

    return {
      message: 'JSON import job created',
      jobId: job._id,
      status: job.status,
      recordsCount: body.data.length,
    };
  }

  /**
   * POST /api/imports/api — Import data from a remote API.
   *
   * Body: JSON with:
   *   - entityType: PRODUCTS | ORGANIZATIONS | USERS
   *   - sourceUrl: URL to fetch data from
   *   - sourceOptions: optional (headers, timeout, pagination config)
   */
  @Post('api')
  @Permissions(PERMISSION_KEYS.IMPORTS_WRITE)
  async importApi(
    @Body() body: { entityType: ImportEntityType; sourceUrl: string; sourceOptions?: Record<string, any> },
    @Req() req: Request,
  ) {
    if (!body.sourceUrl) {
      throw new BadRequestException('sourceUrl is required');
    }

    // Validate URL format
    try {
      new URL(body.sourceUrl);
    } catch {
      throw new BadRequestException('Invalid sourceUrl format');
    }

    const job = await this.ingestionService.create({
      sourceType: ImportSourceType.API,
      entityType: this.parseEntityType(body.entityType),
      sourceUrl: body.sourceUrl,
      sourceOptions: body.sourceOptions ?? {},
      createdByUserId: (req.user as any)?._id ?? (req.user as any)?.userId ?? 'unknown',
    });

    await this.ingestionService.enqueueJob(job);

    return {
      message: 'API import job created',
      jobId: job._id,
      status: job.status,
    };
  }

  /**
   * GET /api/imports — List import jobs with optional filters.
   */
  @Get()
  @Permissions(PERMISSION_KEYS.IMPORTS_READ)
  async findAll(
    @Query('status') status?: ImportStatus,
    @Query('entityType') entityType?: ImportEntityType,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.ingestionService.findAll({
      status,
      entityType,
      limit: limit ? Number(limit) : 20,
      skip: skip ? Number(skip) : 0,
    });
  }

  /**
   * GET /api/imports/:id — Get import job details.
   */
  @Get(':id')
  @Permissions(PERMISSION_KEYS.IMPORTS_READ)
  async findOne(@Param('id') id: string) {
    return this.ingestionService.findById(id);
  }

  /**
   * POST /api/imports/:id/cancel — Cancel a pending/processing import.
   */
  @Post(':id/cancel')
  @Permissions(PERMISSION_KEYS.IMPORTS_WRITE)
  async cancel(@Param('id') id: string) {
    const job = await this.ingestionService.cancel(id);
    return { message: 'Import job cancelled', jobId: job._id, status: job.status };
  }

  /**
   * DELETE /api/imports/:id — Soft-delete an import job.
   */
  @Delete(':id')
  @Permissions(PERMISSION_KEYS.IMPORTS_DELETE)
  async remove(@Param('id') id: string) {
    await this.ingestionService.remove(id);
    return { message: 'Import job deleted' };
  }

  // ──────────────── HELPERS ────────────────

  private parseEntityType(val: any): ImportEntityType {
    if (Object.values(ImportEntityType).includes(val)) return val as ImportEntityType;
    throw new BadRequestException(
      `Invalid entityType. Allowed: ${Object.values(ImportEntityType).join(', ')}`,
    );
  }

  private parseJsonSafe(val: string): Record<string, any> {
    try {
      return JSON.parse(val);
    } catch {
      return {};
    }
  }
}
