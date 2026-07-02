import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'node:fs';
import { ImportJob, ImportSourceType, ImportEntityType } from '../schemas/import-job.schema';
import { IImportStrategy, ProgressCallback } from './i-import.strategy';
import { Product } from '../../products/schemas/product.schema';
import { Organization } from '../../organizations/schemas/organization.schema';
import { User } from '../../users/schemas/user.schema';

/**
 * JsonImportStrategy — reads a JSON array from ImportJob.sourceFile.
 *
 * JSON format (array of objects):
 * ```json
 * [
 *   { "name": "Товар 1", "sku": "T1", "price": 100, ... },
 *   { "name": "Товар 2", "sku": "T2", "price": 200, ... }
 * ]
 * ```
 *
 * Columns follow the same mapping as ExcelImportStrategy.upsertRecord().
 */
@Injectable()
export class JsonImportStrategy implements IImportStrategy {
  private readonly log = new Logger(JsonImportStrategy.name);
  readonly sourceType = ImportSourceType.JSON;

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async execute(
    job: ImportJob,
    onProgress: ProgressCallback,
    signal: AbortSignal,
  ): Promise<void> {
    let records: Record<string, any>[];

    if (job.sourceFile) {
      // Read from file
      if (!fs.existsSync(job.sourceFile)) {
        throw new Error(`File not found: ${job.sourceFile}`);
      }
      const raw = fs.readFileSync(job.sourceFile, 'utf-8');
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } else if (job.sourceOptions?.data) {
      // Inline data from sourceOptions (set by controller for programmatic imports)
      records = Array.isArray(job.sourceOptions.data) ? job.sourceOptions.data : [job.sourceOptions.data];
    } else {
      throw new Error('sourceFile or sourceOptions.data is required for JSON import');
    }

    if (records.length === 0) {
      await onProgress(0, 0, 0, []);
      return;
    }

    this.log.log(`Processing ${records.length} JSON records for ${job.entityType}`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    const errors: Array<{ rowIndex: number; errorMessage: string; rawData?: Record<string, any> }> = [];
    const batchSize = 50;

    for (let i = 0; i < records.length; i += batchSize) {
      if (signal.aborted) {
        this.log.warn(`Import ${job._id} aborted at row ${i}`);
        return;
      }

      const batch = records.slice(i, i + batchSize);

      for (const record of batch) {
        try {
          await this.upsertRecord(job.entityType, record);
          success++;
        } catch (err: any) {
          failed++;
          errors.push({
            rowIndex: i + batch.indexOf(record),
            errorMessage: err.message ?? String(err),
            rawData: record,
          });
        }
        processed++;
      }

      await onProgress(processed, success, failed, errors);
    }

    this.log.log(`JSON import ${job._id} completed: ${success} success, ${failed} failed`);
  }

  private async upsertRecord(entityType: ImportEntityType, row: Record<string, any>): Promise<void> {
    switch (entityType) {
      case ImportEntityType.PRODUCTS:
        await this.upsertProduct(row);
        break;
      case ImportEntityType.ORGANIZATIONS:
        await this.upsertOrganization(row);
        break;
      case ImportEntityType.USERS:
        await this.upsertUser(row);
        break;
    }
  }

  private async upsertProduct(row: Record<string, any>): Promise<void> {
    const sku = String(row.sku ?? '').trim().toUpperCase();
    if (!sku) throw new Error('sku is required');
    const name = String(row.name ?? '').trim();
    if (!name) throw new Error('name is required');

    await this.productModel.findOneAndUpdate(
      { sku },
      {
        $set: {
          name, sku,
          price: Number(row.price ?? 0),
          cost: Number(row.cost ?? 0),
          unit: row.unit ? String(row.unit).trim() : undefined,
          category: row.category ? String(row.category).trim() : undefined,
          description: row.description ? String(row.description).trim() : undefined,
          deletedAt: null,
        },
        $setOnInsert: { photoIds: [] },
      },
      { upsert: true, new: true },
    );
  }

  private async upsertOrganization(row: Record<string, any>): Promise<void> {
    const name = String(row.name ?? '').trim();
    if (!name) throw new Error('name is required');
    const partyTypes = Array.isArray(row.partyTypes)
      ? row.partyTypes
      : ['BUYER'];

    await this.orgModel.findOneAndUpdate(
      { name },
      {
        $set: {
          name,
          legalType: row.legalType ?? 'ООО',
          inn: row.inn ? String(row.inn).trim() : undefined,
          kpp: row.kpp ? String(row.kpp).trim() : undefined,
          ogrn: row.ogrn ? String(row.ogrn).trim() : undefined,
          directorName: row.directorName ? String(row.directorName).trim() : undefined,
          partyTypes,
          deletedAt: null,
        },
        $setOnInsert: { contacts: [] },
      },
      { upsert: true, new: true },
    );
  }

  private async upsertUser(row: Record<string, any>): Promise<void> {
    const username = String(row.username ?? '').trim().toLowerCase();
    if (!username) throw new Error('username is required');

    await this.userModel.findOneAndUpdate(
      { username },
      {
        $set: {
          username,
          fullName: row.fullName ? String(row.fullName).trim() : undefined,
          phone: row.phone ? String(row.phone).trim() : undefined,
          deletedAt: null,
        },
      },
      { upsert: true, new: true },
    );
  }
}
