import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

/**
 * BOM-узел. Класс назван `BomModule` (а не `Module`) во избежание коллизии
 * с `Module` из `@nestjs/common` (NestJS декоратор) — оба класса
 * импортируются в `modules.module.ts`. Имя коллекции в MongoDB остаётся
 * `modules` (см. @Schema({ collection: 'modules' })).
 */
@Schema({ collection: 'modules', timestamps: true })
export class BomModule extends Document {
  @Prop({ required: true, type: String })
  name!: string;

  // BR-MOD-3: sku regex ^[A-Z0-9-]+$, 3–32 chars.
  @Prop({ required: true, type: String, unique: true })
  sku!: string;

  @Prop({ type: String })
  category?: string;

  @Prop({ type: String })
  notes?: string;

  // Габариты модуля (overall, для UI).
  @Prop({
    type: {
      length: { type: Number, required: false },
      width: { type: Number, required: false },
      height: { type: Number, required: false },
    },
    _id: false,
  })
  dimensions?: { length?: number; width?: number; height?: number };

  // BR-MOD-2: вложенность модулей (теоретически неограниченная).
  // BR-MOD-6: защита от циклов — self-check в service (глубокие циклы deferred).
  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BomModule' }],
    default: [],
  })
  childModuleIds!: mongoose.Types.ObjectId[];

  // BR-MOD-4: moduleMaterials[].qty > 0; materialId → Material (проверяется service).
  @Prop({
    type: [
      {
        materialId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Material',
          required: true,
        },
        qty: { type: Number, required: true, min: 0.0001 },
        unit: { type: String, required: false },
        usedDimensions: {
          type: {
            length: { type: Number, required: false },
            width: { type: Number, required: false },
            height: { type: Number, required: false },
            diameter: { type: Number, required: false },
            thickness: { type: Number, required: false },
          },
          default: {},
          _id: false,
        },
        order: { type: Number, default: 0 },
        _id: false,
      },
    ],
    default: [],
  })
  moduleMaterials!: Array<{
    materialId: mongoose.Types.ObjectId;
    qty: number;
    unit?: string;
    usedDimensions: {
      length?: number;
      width?: number;
      height?: number;
      diameter?: number;
      thickness?: number;
    };
    order: number;
  }>;

  // BR-MOD-5: moduleWorks[].hours > 0; workTypeId → WorkType.
  // overrideRate опционален — если задан, используется вместо WorkType.hourlyRate.
  @Prop({
    type: [
      {
        workTypeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'WorkType',
          required: true,
        },
        hours: { type: Number, required: true, min: 0.01 },
        overrideRate: { type: Number, required: false, min: 0 },
        order: { type: Number, default: 0 },
        _id: false,
      },
    ],
    default: [],
  })
  moduleWorks!: Array<{
    workTypeId: mongoose.Types.ObjectId;
    hours: number;
    overrideRate?: number;
    order: number;
  }>;

  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
    default: [],
  })
  photoIds!: mongoose.Types.ObjectId[];

  // BR-MOD-7: soft-delete.
  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const BomModuleSchema = SchemaFactory.createForClass(BomModule);

BomModuleSchema.index({ sku: 1 }, { unique: true });
BomModuleSchema.index({ name: 1, deletedAt: 1 });
BomModuleSchema.index({ category: 1 });
