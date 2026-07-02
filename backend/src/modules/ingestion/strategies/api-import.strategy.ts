import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { ImportJob, ImportSourceType, ImportEntityType } from '../schemas/import-job.schema';
import { IImportStrategy, ProgressCallback } from './i-import.strategy';
import { Product } from '../../products/schemas/product.schema';
import { Organization } from '../../organizations/schemas/organization.schema';
import { User } from '../../users/schemas/user.schema';

/**
 * ApiImportStrategy — fetches records from ImportJob.sourceUrl and upserts.
 *
 * Expects the API to return a JSON array of objects, or an object with a `data`
 * key containing the array.
 *
 * Supports optional HTTP headers via sourceOptions.headers.
 * Supports pagination via sourceOptions.pagination (offset/limit pattern).
 */
@Injectable()
export class ApiImportStrategy implements IImportStrategy {
  private readonly log = new Logger(ApiImportStrategy.name);
  readonly sourceType = ImportSourceType.API;

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
    if (!job.sourceUrl) {
      throw new Error('sourceUrl is required for API import');
    }

    const headers = (job.sourceOptions?.headers as Record<string, string>) ?? {};
    const timeout = (job.sourceOptions?.timeout as number) ?? 30000;

    this.log.log(`Fetching data from ${job.sourceUrl}`);

    let allRecords: Record<string, any>[] = [];
    const pagination = job.sourceOptions?.pagination as
      | { enabled: true; limit?: number; offset?: number; totalField?: string }
      | undefined;

    if (pagination?.enabled) {
      // Paginated fetch
      const pageSize = pagination.limit ?? 100;
      let offset = pagination.offset ?? 0;
      let hasMore = true;

      while (hasMore) {
        if (signal.aborted) {
          this.log.warn(`Import ${job._id} aborted during pagination`);
          return;
        }

        const url = new URL(job.sourceUrl);
        url.searchParams.set('limit', String(pageSize));
        url.searchParams.set('offset', String(offset));

        const response = await axios.get(url.toString(), { headers, timeout });
        const body = response.data;

        const records = Array.isArray(body) ? body : (body.data ?? []);
        if (!Array.isArray(records) || records.length === 0) {
          hasMore = false;
          break;
        }

        allRecords.push(...records);
        offset += records.length;

        // Check if we've reached the total
        if (pagination.totalField) {
          const total = this.getNestedValue(body, pagination.totalField) as number | undefined;
          if (typeof total === 'number' && allRecords.length >= total) {
            hasMore = false;
          }
        }

        // Safety limit — 10k records max per import
        if (allRecords.length >= 10000) {
          this.log.warn(`Reached 10k record limit for API import ${job._id}`);
          break;
        }
      }
    } else {
      // Single fetch
      const response = await axios.get(job.sourceUrl, { headers, timeout });
      const body = response.data;
      allRecords = Array.isArray(body) ? body : (body.data ?? []);
    }

    if (!Array.isArray(allRecords) || allRecords.length === 0) {
      await onProgress(0, 0, 0, []);
      return;
    }

    this.log.log(`Fetched ${allRecords.length} records from API for ${job.entityType}`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    const errors: Array<{ rowIndex: number; errorMessage: string; rawData?: Record<string, any> }> = [];
    const batchSize = 50;

    for (let i = 0; i < allRecords.length; i += batchSize) {
      if (signal.aborted) {
        this.log.warn(`Import ${job._id} aborted at row ${i}`);
        return;
      }

      const batch = allRecords.slice(i, i + batchSize);

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

    this.log.log(`API import ${job._id} completed: ${success} success, ${failed} failed`);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
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
    const sku = String(row.sku ?? row.code ?? row.article ?? '').trim().toUpperCase();
    if (!sku) throw new Error('sku/code/article is required');
    const name = String(row.name ?? row.title ?? row.nomenclature ?? '').trim();
    if (!name) throw new Error('name is required');

    await this.productModel.findOneAndUpdate(
      { sku },
      {
        $set: {
          name, sku,
          price: Number(row.price ?? row.costPrice ?? 0),
          cost: Number(row.cost ?? row.purchasePrice ?? 0),
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
    const name = String(row.name ?? row.fullName ?? '').trim();
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
    const username = String(row.username ?? row.login ?? row.email ?? '').trim().toLowerCase();
    if (!username) throw new Error('username/login is required');

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
