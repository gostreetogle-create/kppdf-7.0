import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export enum ProductStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  IN_PRODUCTION = 'IN_PRODUCTION',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

@Schema({ collection: 'products', timestamps: true })
export class Product extends Document {
  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  sku!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String })
  category?: string;

  @Prop({ type: String })
  unit?: string;

  @Prop({ default: 0, min: 0, type: Number })
  price!: number;

  @Prop({ default: 0, min: 0, type: Number })
  cost!: number;

  // === Фото (ОБЯЗАТЕЛЬНО ≥ 1) ===
  @Prop({
    required: true,
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
  })
  photoIds!: mongoose.Types.ObjectId[];

  // === Audit trail для COPY ===
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
  })
  copiedFromProductId!: mongoose.Types.ObjectId | null;

  // === Product lifecycle status (PSL-012) ===
  // DRAFT → READY → IN_PRODUCTION → COMPLETED → ARCHIVED
  // UI changes this via status badge / dropdown.
  @Prop({
    type: String,
    enum: Object.values(ProductStatus),
    default: ProductStatus.DRAFT,
  })
  status!: ProductStatus;

  // === BOM modules (PSL-012) ===
  // Товар состоит из модулей. Цена = Σ(modules.computeCost) + наценка.
  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BomModule' }],
    default: [],
  })
  productModuleIds!: mongoose.Types.ObjectId[];

  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ name: 1, sku: 1 }, { unique: true });
ProductSchema.index({ category: 1 });
