import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ImportEntityType,
  ImportSourceType,
  ImportStatus,
} from '../schemas/import-job.schema';

export class CreateImportJobDto {
  @IsEnum(ImportSourceType)
  sourceType!: ImportSourceType;

  @IsEnum(ImportEntityType)
  entityType!: ImportEntityType;

  @IsOptional()
  @IsString()
  sourceFile?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsObject()
  sourceOptions?: Record<string, any>;
}

export class UpdateImportJobDto {
  @IsOptional()
  @IsEnum(ImportStatus)
  status?: ImportStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalRecords?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  processedRecords?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  successRecords?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  failedRecords?: number;
}
