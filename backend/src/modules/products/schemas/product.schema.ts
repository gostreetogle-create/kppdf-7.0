import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

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

  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ name: 1, sku: 1 }, { unique: true });
ProductSchema.index({ category: 1 });
