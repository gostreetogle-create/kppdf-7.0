import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductStatus } from './schemas/product.schema';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CopyProductDto } from './dto/copy-product.dto';
import { BomModule } from '../modules/schemas/module.schema';
import { ModulesService } from '../modules/modules.service';

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
 * - BR-PRD-9: productModuleIds[] — массив операционных модулей из BOM-каталога
 */
@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(BomModule.name)
    private readonly moduleModel: Model<BomModule>,
    private readonly modulesService: ModulesService,
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
    if (dto.productModuleIds && dto.productModuleIds.length > 0) {
      await this.validateModulesExist(dto.productModuleIds);
    }
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
        status: dto.status ?? ProductStatus.DRAFT,
        productModuleIds: (dto.productModuleIds ?? []).map(
          (id) => new Types.ObjectId(id),
        ),
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
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.productModuleIds !== undefined) {
      await this.validateModulesExist(dto.productModuleIds);
      updates.productModuleIds = dto.productModuleIds.map(
        (id) => new Types.ObjectId(id),
      );
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

  // === BOM (PSL-012) =================================================

  /**
   * Добавить модуль к товару. Append в конец productModuleIds (если ещё нет).
   */
  async addModule(productId: string, moduleId: string): Promise<Product> {
    const product = await this.productModel
      .findOne({ _id: productId, deletedAt: null })
      .exec();
    if (!product) throw new NotFoundException('Product not found');
    await this.validateModulesExist([moduleId]);

    const objectId = new Types.ObjectId(moduleId);
    const exists = product.productModuleIds.some(
      (m) => m.toString() === moduleId,
    );
    if (!exists) product.productModuleIds.push(objectId);
    return product.save();
  }

  /**
   * Удалить модуль из товара.
   */
  async removeModule(productId: string, moduleId: string): Promise<Product> {
    const product = await this.productModel
      .findOne({ _id: productId, deletedAt: null })
      .exec();
    if (!product) throw new NotFoundException('Product not found');

    const before = product.productModuleIds.length;
    product.productModuleIds = product.productModuleIds.filter(
      (m) => m.toString() !== moduleId,
    );
    if (product.productModuleIds.length === before) {
      // no-op: moduleId wasn't in the list
    }
    return product.save();
  }

  /**
   * Reorder модулей в товаре (drag-drop в UI). moduleIds должен быть
   * полным новым порядком; дубликаты/несуществующие отвергаются.
   */
  async reorderModules(
    productId: string,
    moduleIds: string[],
  ): Promise<Product> {
    const product = await this.productModel
      .findOne({ _id: productId, deletedAt: null })
      .exec();
    if (!product) throw new NotFoundException('Product not found');

    // Проверяем, что новый набор — это та же мультимножество, что и текущий.
    const currentSet = new Set(
      product.productModuleIds.map((m) => m.toString()),
    );
    const newSet = new Set(moduleIds);
    if (currentSet.size !== newSet.size) {
      throw new BadRequestException(
        'reorderModules: new list size must match current',
      );
    }
    for (const id of newSet) {
      if (!currentSet.has(id)) {
        throw new BadRequestException(
          `reorderModules: moduleId ${id} is not part of this product`,
        );
      }
    }

    product.productModuleIds = moduleIds.map((id) => new Types.ObjectId(id));
    return product.save();
  }

  private async validateModulesExist(moduleIds: string[]): Promise<void> {
    const ids = moduleIds.map((id) => new Types.ObjectId(id));
    const found = await this.moduleModel
      .countDocuments({ _id: { $in: ids }, deletedAt: null })
      .exec();
    if (found !== moduleIds.length) {
      throw new BadRequestException(
        'One or more productModuleIds do not exist (or are deleted)',
      );
    }
  }

  /**
   * BR-PRD-10: computeProductCost — Σ(active module totalCost)
   * через делегацию в ModulesService.computeCost().
   *
   * Soft-deleted модули → не учитываются (BR-MOD-7).
   * Модули без ссылок → cost=0; errors в цикле → 0 для этого модуля.
   *
   * Returns `{ totalCost, modules: [{ moduleId, name, cost }] }`.
   */
  async computeProductCost(productId: string): Promise<{
    totalCost: number;
    modules: Array<{ moduleId: string; name: string; cost: number }>;
  }> {
    const product = await this.productModel
      .findOne({ _id: productId, deletedAt: null })
      .exec();
    if (!product) throw new NotFoundException('Product not found');

    const moduleIds = product.productModuleIds ?? [];
    const ids = moduleIds.map((id) => id.toString());

    // Pre-fetch names in one query (BR-MOD-7: filter deletedAt:null)
    const modules = await this.moduleModel
      .find({ _id: { $in: moduleIds }, deletedAt: null })
      .exec();
    const moduleById = new Map(
      modules.map((m) => [m._id.toString(), m]),
    );

    const result: Array<{ moduleId: string; name: string; cost: number }> = [];
    let totalCost = 0;

    for (const id of ids) {
      const mod = moduleById.get(id);
      if (!mod) continue; // soft-deleted or missing — skip
      try {
        const computed = await this.modulesService.computeCost(id);
        result.push({
          moduleId: id,
          name: mod.name,
          cost: computed.totalCost,
        });
        totalCost += computed.totalCost;
      } catch {
        // cycle defense, missing material — count as 0 and continue
        result.push({ moduleId: id, name: mod.name, cost: 0 });
      }
    }

    return { totalCost: round(totalCost), modules: result };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
