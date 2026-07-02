import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import { ImportJob, ImportSourceType, ImportEntityType } from '../schemas/import-job.schema';
import { IImportStrategy, ProgressCallback } from './i-import.strategy';
import { Product } from '../../products/schemas/product.schema';
import { Organization } from '../../organizations/schemas/organization.schema';
import { User } from '../../users/schemas/user.schema';

interface ExcelRow {
  [key: string]: any;
}

/**
 * ExcelImportStrategy — reads .xlsx from ImportJob.sourceFile, upserts records.
 *
 * Column mapping (first row = header) for each entity type:
 * - PRODUCTS:  name, sku, price, cost, unit, category, description
 * - ORGANIZATIONS: name, legalType, inn, kpp, ogrn, directorName, partyTypes (comma-sep)
 * - USERS:  username, password (hashed), fullName, phone, roleName
 */
@Injectable()
export class ExcelImportStrategy implements IImportStrategy {
  private readonly log = new Logger(ExcelImportStrategy.name);
  readonly sourceType = ImportSourceType.EXCEL;

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
    if (!job.sourceFile) {
      throw new Error('sourceFile is required for EXCEL import');
    }

    const filePath = job.sourceFile;
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('Excel file has no sheets');
    }

    const rows: ExcelRow[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rows.length === 0) {
      await onProgress(0, 0, 0, []);
      return;
    }

    this.log.log(`Parsed ${rows.length} rows from ${filePath} (sheet: ${sheetName})`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    const errors: Array<{ rowIndex: number; errorMessage: string; rawData?: Record<string, any> }> = [];
    const batchSize = 50;

    for (let i = 0; i < rows.length; i += batchSize) {
      if (signal.aborted) {
        this.log.warn(`Import ${job._id} aborted at row ${i}`);
        return;
      }

      const batch = rows.slice(i, i + batchSize);

      for (const row of batch) {
        try {
          await this.upsertRecord(job.entityType, row);
          success++;
        } catch (err: any) {
          failed++;
          errors.push({
            rowIndex: i + batch.indexOf(row),
            errorMessage: err.message ?? String(err),
            rawData: row as Record<string, any>,
          });
        }
        processed++;
      }

      // Report progress after each batch
      await onProgress(processed, success, failed, errors);
    }

    this.log.log(`Import ${job._id} completed: ${success} success, ${failed} failed`);
  }

  private async upsertRecord(entityType: ImportEntityType, row: ExcelRow): Promise<void> {
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

  private async upsertProduct(row: ExcelRow): Promise<void> {
    const sku = String(row.sku ?? '').trim().toUpperCase();
    if (!sku) throw new Error('sku is required');

    const name = String(row.name ?? '').trim();
    if (!name) throw new Error('name is required');

    await this.productModel.findOneAndUpdate(
      { sku },
      {
        $set: {
          name,
          sku,
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

  private async upsertOrganization(row: ExcelRow): Promise<void> {
    const name = String(row.name ?? '').trim();
    if (!name) throw new Error('name is required');

    const partyTypes = row.partyTypes
      ? String(row.partyTypes).split(',').map((s: string) => s.trim()).filter(Boolean)
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

  private async upsertUser(row: ExcelRow): Promise<void> {
    const username = String(row.username ?? '').trim().toLowerCase();
    if (!username) throw new Error('username is required');

    // Users import just pre-fills the user record — password must be set via UI
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
