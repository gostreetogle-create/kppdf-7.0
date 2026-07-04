import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type MaterialUnit = 'mm' | 'cm' | 'm' | 'kg' | 'g' | 'pcs';

export const MATERIAL_UNITS: readonly MaterialUnit[] = [
  'mm',
  'cm',
  'm',
  'kg',
  'g',
  'pcs',
] as const;

@Schema({ collection: 'materials', timestamps: true })
export class Material extends Document {
  @Prop({ required: true, type: String })
  name!: string;

  // sku: regex ^MAT-[A-Z0-9-]+$, 8–50 chars (BR-MAT-3). Validated DTO-side.
  @Prop({ required: true, type: String, unique: true })
  sku!: string;

  // BR-MAT-1: supplierId is required.
  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
  })
  supplierId!: mongoose.Types.ObjectId;

  @Prop({ type: String })
  category?: string;

  // BR-MAT-2: unit is required — единица продажи материала.
  @Prop({
    required: true,
    type: String,
    enum: MATERIAL_UNITS,
  })
  unit!: MaterialUnit;

  @Prop({ required: true, type: Number, min: 0 })
  pricePerUnit!: number;

  @Prop({ default: 'RUB', type: String })
  priceCurrency!: string;

  // Габариты в «фабричной» форме (как продаётся). Любое подмножество полей.
  @Prop({
    type: {
      length: { type: Number, required: false },
      width: { type: Number, required: false },
      height: { type: Number, required: false },
      diameter: { type: Number, required: false },
      thickness: { type: Number, required: false },
    },
    _id: false,
  })
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
    thickness?: number;
  };

  // BR-MAT-4: fixedDimensions.{x} true → dimensions.{x} обязан быть задан.
  // Проверяется в service-layer при save.
  @Prop({
    type: {
      length: { type: Boolean, default: false },
      width: { type: Boolean, default: false },
      height: { type: Boolean, default: false },
      diameter: { type: Boolean, default: false },
      thickness: { type: Boolean, default: false },
    },
    _id: false,
    default: () => ({
      length: false,
      width: false,
      height: false,
      diameter: false,
      thickness: false,
    }),
  })
  fixedDimensions!: {
    length: boolean;
    width: boolean;
    height: boolean;
    diameter: boolean;
    thickness: boolean;
  };

  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
    default: [],
  })
  photoIds!: mongoose.Types.ObjectId[];

  @Prop({ type: String })
  notes?: string;

  // BR-MAT-5: soft-delete.
  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);

MaterialSchema.index({ name: 1 });
MaterialSchema.index({ sku: 1 }, { unique: true });
MaterialSchema.index({ supplierId: 1, deletedAt: 1 });
MaterialSchema.index({ category: 1 });
