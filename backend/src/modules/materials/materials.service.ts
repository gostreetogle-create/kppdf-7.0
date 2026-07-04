import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Material } from './schemas/material.schema';
import { CreateMaterialDto, MaterialDimensionsDto, MaterialFixedDimensionsDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { Organization } from '../organizations/schemas/organization.schema';

/**
 * MaterialsService — CRUD для каталога материалов.
 *
 * BR-MAT-1: supplierId required + должен ссылаться на существующую Organization.
 * BR-MAT-2: unit required.
 * BR-MAT-3: sku regex (DTO-side). 11000 duplicate → 409.
 * BR-MAT-4: fixedDimensions.{x} === true → dimensions.{x} required (cross-field).
 * BR-MAT-5: soft-delete через deletedAt.
 */
@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name)
    private readonly materialModel: Model<Material>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
  ) {}

  async findAll(): Promise<Material[]> {
    return this.materialModel.find({ deletedAt: null }).exec();
  }

  async findById(id: string): Promise<Material> {
    const material = await this.materialModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  async create(dto: CreateMaterialDto): Promise<Material> {
    // BR-MAT-1: supplierId должен существовать (soft-check через Organization).
    const supplier = await this.orgModel
      .findOne({ _id: dto.supplierId, deletedAt: null })
      .exec();
    if (!supplier) {
      throw new BadRequestException(
        `supplierId=${dto.supplierId} not found (BR-MAT-1)`,
      );
    }
    this.validateFixedDimensions(dto.dimensions, dto.fixedDimensions);

    try {
      const material = new this.materialModel({
        name: dto.name,
        sku: dto.sku,
        supplierId: new Types.ObjectId(dto.supplierId),
        category: dto.category,
        unit: dto.unit,
        pricePerUnit: dto.pricePerUnit,
        priceCurrency: dto.priceCurrency ?? 'RUB',
        dimensions: dto.dimensions,
        fixedDimensions: dto.fixedDimensions ?? {
          length: false,
          width: false,
          height: false,
          diameter: false,
          thickness: false,
        },
        photoIds: (dto.photoIds ?? []).map((id) => new Types.ObjectId(id)),
        notes: dto.notes,
      });
      return await material.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          `Material with sku="${dto.sku}" already exists (BR-MAT-3)`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateMaterialDto): Promise<Material> {
    const material = await this.materialModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!material) throw new NotFoundException('Material not found');

    if (dto.supplierId) {
      const supplier = await this.orgModel
        .findOne({ _id: dto.supplierId, deletedAt: null })
        .exec();
      if (!supplier) {
        throw new BadRequestException(
          `supplierId=${dto.supplierId} not found (BR-MAT-1)`,
        );
      }
    }
    if (dto.dimensions || dto.fixedDimensions) {
      this.validateFixedDimensions(
        dto.dimensions ?? material.dimensions,
        dto.fixedDimensions ?? material.fixedDimensions,
      );
    }

    const updates: Record<string, any> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.sku !== undefined) updates.sku = dto.sku;
    if (dto.supplierId !== undefined)
      updates.supplierId = new Types.ObjectId(dto.supplierId);
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.unit !== undefined) updates.unit = dto.unit;
    if (dto.pricePerUnit !== undefined) updates.pricePerUnit = dto.pricePerUnit;
    if (dto.priceCurrency !== undefined)
      updates.priceCurrency = dto.priceCurrency;
    if (dto.dimensions !== undefined) updates.dimensions = dto.dimensions;
    if (dto.fixedDimensions !== undefined)
      updates.fixedDimensions = dto.fixedDimensions;
    if (dto.photoIds !== undefined)
      updates.photoIds = dto.photoIds.map((pid) => new Types.ObjectId(pid));
    if (dto.notes !== undefined) updates.notes = dto.notes;

    try {
      Object.assign(material, updates);
      return await material.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          `Material with sku="${dto.sku}" already exists (BR-MAT-3)`,
        );
      }
      throw err;
    }
  }

  /** BR-MAT-4: fixedDimensions.{x} === true → dimensions.{x} required. */
  private validateFixedDimensions(
    dimensions?: MaterialDimensionsDto,
    fixed?: MaterialFixedDimensionsDto,
  ): void {
    if (!fixed) return;
    for (const key of Object.keys(fixed)) {
      const v = (dimensions as Record<string, number | undefined> | undefined)?.[key];
      if (v === undefined || v === null) {
        throw new BadRequestException(
          `BR-MAT-4: fixedDimensions.${key} is true but dimensions.${key} is missing`,
        );
      }
    }
  }

  async remove(id: string): Promise<void> {
    const material = await this.materialModel.findById(id).exec();
    if (!material || material.deletedAt) {
      throw new NotFoundException('Material not found');
    }
    material.deletedAt = new Date();
    await material.save();
  }
}
