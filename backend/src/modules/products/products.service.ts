import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product } from './schemas/product.schema';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CopyProductDto } from './dto/copy-product.dto';

/**
 * ProductsService — CRUD + COPY для товаров.
 *
 * - BR-PRD-1: (name, sku) unique compound (Mongoose index → 409)
 * - BR-PRD-2: name required (schema-level)
 * - BR-PRD-3: sku required + uppercase alphanumeric format (DTO-level)
 * - BR-PRD-4: photoIds ≥ 1 (schema-level + DTO)
 * - BR-PRD-5: price ≥ 0, cost ≥ 0 (schema-level)
 * - BR-PRD-6: COPY → auto-sku suffix `-COPY-{base36}`, new document
 * - BR-PRD-7: COPY reuses photoIds refs (no file duplication)
 * - BR-PRD-8: Soft-delete через deletedAt
 */
@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  async findAll(): Promise<Product[]> {
    return this.productModel.find({ deletedAt: null }).exec();
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    try {
      const product = new this.productModel({
        name: dto.name,
        sku: dto.sku,
        description: dto.description,
        category: dto.category,
        unit: dto.unit,
        price: dto.price ?? 0,
        cost: dto.cost ?? 0,
        photoIds: dto.photoIds.map((id) => new Types.ObjectId(id)),
      });
      return await product.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          'Product with this name and sku already exists (BR-PRD-1)',
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.productModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!product) throw new NotFoundException('Product not found');

    const updates: Record<string, any> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.sku !== undefined) updates.sku = dto.sku;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.unit !== undefined) updates.unit = dto.unit;
    if (dto.price !== undefined) updates.price = dto.price;
    if (dto.cost !== undefined) updates.cost = dto.cost;
    if (dto.photoIds !== undefined) {
      updates.photoIds = dto.photoIds.map((id) => new Types.ObjectId(id));
    }

    try {
      Object.assign(product, updates);
      return await product.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          'Product with this name and sku already exists (BR-PRD-1)',
        );
      }
      throw err;
    }
  }

  /**
   * COPY endpoint per BR-PRD-6 + BR-PRD-7.
   * Creates a new document with auto-generated sku and shared photo refs.
   */
  async copy(id: string, dto?: CopyProductDto): Promise<Product> {
    const original = await this.productModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!original) throw new NotFoundException('Product not found');

    const newSku =
      dto?.sku ?? `${original.sku}-COPY-${Date.now().toString(36).toUpperCase()}`;
    const newName = dto?.name ?? `${original.name} (копия)`;

    try {
      const copy = new this.productModel({
        name: newName,
        sku: newSku,
        description: original.description,
        category: original.category,
        unit: original.unit,
        price: original.price,
        cost: original.cost,
        photoIds: original.photoIds, // shared refs per BR-PRD-7
        copiedFromProductId: original._id,
      });
      return await copy.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          'Copy would create duplicate (name, sku). Provide unique sku.',
        );
      }
      throw err;
    }
  }

  /**
   * Soft-delete product (BR-PRD-8).
   */
  async remove(id: string): Promise<void> {
    const product = await this.productModel.findById(id).exec();
    if (!product || product.deletedAt)
      throw new NotFoundException('Product not found');

    product.deletedAt = new Date();
    await product.save();
  }
}
