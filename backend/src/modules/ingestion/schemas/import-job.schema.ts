import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export enum ImportSourceType {
  EXCEL = 'EXCEL',
  JSON = 'JSON',
  API = 'API',
}

export enum ImportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ImportEntityType {
  PRODUCTS = 'PRODUCTS',
  ORGANIZATIONS = 'ORGANIZATIONS',
  USERS = 'USERS',
}

@Schema({ collection: 'importJobs', timestamps: true })
export class ImportJob extends Document {
  @Prop({ required: true, type: String, enum: Object.values(ImportSourceType) })
  sourceType!: ImportSourceType;

  @Prop({ required: true, type: String, enum: Object.values(ImportEntityType) })
  entityType!: ImportEntityType;

  // Входные параметры
  @Prop({ type: String })
  sourceFile?: string;

  @Prop({ type: String })
  sourceUrl?: string;

  @Prop({ type: Object })
  sourceOptions?: Record<string, any>;

  // Прогресс
  @Prop({
    required: true,
    type: String,
    enum: Object.values(ImportStatus),
    default: ImportStatus.PENDING,
  })
  status!: ImportStatus;

  @Prop({ default: 0, min: 0, max: 100, type: Number })
  progressPercent!: number;

  @Prop({ default: 0, type: Number })
  totalRecords!: number;

  @Prop({ default: 0, type: Number })
  processedRecords!: number;

  @Prop({ default: 0, type: Number })
  successRecords!: number;

  @Prop({ default: 0, type: Number })
  failedRecords!: number;

  // Ошибки (capped 1000 entries per BR-IMP-3)
  @Prop({
    type: [
      {
        rowIndex: { type: Number },
        errorMessage: { type: String },
        rawData: { type: Object },
      },
    ],
    default: [],
    validate: {
      validator: (v: any[]) => Array.isArray(v) && v.length <= 1000,
      message: 'errorLog capped at 1000 entries (BR-IMP-3)',
    },
  })
  errorLog!: Array<{
    rowIndex: number;
    errorMessage: string;
    rawData?: Record<string, any>;
  }>;

  // Audit
  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  })
  createdByUserId!: mongoose.Types.ObjectId;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  // Soft-delete (BR-IMP-5)
  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const ImportJobSchema = SchemaFactory.createForClass(ImportJob);

ImportJobSchema.index({ status: 1, createdAt: -1 });
ImportJobSchema.index({ createdByUserId: 1, createdAt: -1 });
