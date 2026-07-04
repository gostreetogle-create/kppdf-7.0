import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'workTypes', timestamps: true })
export class WorkType extends Document {
  @Prop({ required: true, type: String, unique: true })
  name!: string;

  // BR-WT-1: hourlyRate ≥ 0 (может быть 0 для учебных работ).
  @Prop({ required: true, type: Number, min: 0 })
  hourlyRate!: number;

  @Prop({ type: String })
  description?: string;

  // BR-WT-2: soft-delete + service-level защита от удаления, если есть ссылки.
  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const WorkTypeSchema = SchemaFactory.createForClass(WorkType);

WorkTypeSchema.index({ name: 1 }, { unique: true });
