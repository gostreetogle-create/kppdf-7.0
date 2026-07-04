import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'employees', timestamps: true })
export class Employee extends Document {
  // BR-EMP-1: name уникален (login-style).
  @Prop({ required: true, type: String, unique: true })
  name!: string;

  @Prop({ required: true, type: String })
  fullName!: string;

  // BR-EMP-2: phone обязателен.
  @Prop({ required: true, type: String })
  phone!: string;

  // BR-EMP-3: email опционален, валидация формата — DTO.
  @Prop({ type: String })
  email?: string;

  // Свободный текст — 'Сварщик' | 'Маляр' | etc. (для будущего распределения).
  @Prop({ type: String })
  position?: string;

  // BR-EMP-4: active: false для уволенных (soft).
  @Prop({ default: true, type: Boolean })
  active!: boolean;

  // BR-EMP-4: soft-delete.
  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

EmployeeSchema.index({ name: 1 }, { unique: true });
EmployeeSchema.index({ active: 1, deletedAt: 1 });
