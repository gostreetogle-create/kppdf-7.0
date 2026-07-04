import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BomModule } from './schemas/module.schema';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { Material } from '../materials/schemas/material.schema';
import { WorkType } from '../work-types/schemas/work-type.schema';

/**
 * ModulesService — CRUD + computeCost для BOM-узлов.
 *
 * BR-MOD-1: standalone-модуль (пустые массивы) — OK.
 * BR-MOD-2: вложенность не ограничена (теоретически).
 * BR-MOD-3: sku regex (DTO-side).
 * BR-MOD-4: moduleMaterials[].qty > 0, materialId → существующий Material.
 * BR-MOD-5: moduleWorks[].hours > 0, workTypeId → существующий WorkType.
 * BR-MOD-6: self-cycle check (глубокие циклы deferred).
 * BR-MOD-7: soft-delete.
 * BR-MOD-8: computeCost(id) → { materialsCost, worksCost, childModulesCost, totalCost, breakdown[] }.
 */
@Injectable()
export class ModulesService {
  constructor(
    @InjectModel(BomModule.name)
    private readonly moduleModel: Model<BomModule>,
    @InjectModel(Material.name)
    private readonly materialModel: Model<Material>,
    @InjectModel(WorkType.name)
    private readonly workTypeModel: Model<WorkType>,
  ) {}

  async findAll(): Promise<BomModule[]> {
    return this.moduleModel.find({ deletedAt: null }).exec();
  }

  async findById(id: string): Promise<BomModule> {
    const mod = await this.moduleModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!mod) throw new NotFoundException('Module not found');
    return mod;
  }

  async create(dto: CreateModuleDto): Promise<BomModule> {
    await this.validateReferences(dto.moduleMaterials, dto.moduleWorks, dto.childModuleIds);

    try {
      const mod = new this.moduleModel({
        name: dto.name,
        sku: dto.sku,
        category: dto.category,
        notes: dto.notes,
        dimensions: dto.dimensions,
        childModuleIds: (dto.childModuleIds ?? []).map((id) => new Types.ObjectId(id)),
        moduleMaterials: (dto.moduleMaterials ?? []).map((m) => ({
          materialId: new Types.ObjectId(m.materialId),
          qty: m.qty,
          unit: m.unit,
          usedDimensions: m.usedDimensions,
          order: m.order ?? 0,
        })),
        moduleWorks: (dto.moduleWorks ?? []).map((w) => ({
          workTypeId: new Types.ObjectId(w.workTypeId),
          hours: w.hours,
          overrideRate: w.overrideRate,
          order: w.order ?? 0,
        })),
        photoIds: (dto.photoIds ?? []).map((id) => new Types.ObjectId(id)),
      });
      return await mod.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          `Module with sku="${dto.sku}" already exists (BR-MOD-3)`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateModuleDto): Promise<BomModule> {
    const mod = await this.moduleModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!mod) throw new NotFoundException('Module not found');

    if (dto.childModuleIds?.some((cid) => cid === id)) {
      throw new BadRequestException(
        'BR-MOD-6: childModuleIds cannot contain self (cycle)',
      );
    }
    await this.validateReferences(
      dto.moduleMaterials,
      dto.moduleWorks,
      dto.childModuleIds,
    );

    const updates: Record<string, any> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.sku !== undefined) updates.sku = dto.sku;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.notes !== undefined) updates.notes = dto.notes;
    if (dto.dimensions !== undefined) updates.dimensions = dto.dimensions;
    if (dto.childModuleIds !== undefined) {
      updates.childModuleIds = dto.childModuleIds.map(
        (cid) => new Types.ObjectId(cid),
      );
    }
    if (dto.moduleMaterials !== undefined) {
      updates.moduleMaterials = dto.moduleMaterials.map((m) => ({
        materialId: new Types.ObjectId(m.materialId),
        qty: m.qty,
        unit: m.unit,
        usedDimensions: m.usedDimensions,
        order: m.order ?? 0,
      }));
    }
    if (dto.moduleWorks !== undefined) {
      updates.moduleWorks = dto.moduleWorks.map((w) => ({
        workTypeId: new Types.ObjectId(w.workTypeId),
        hours: w.hours,
        overrideRate: w.overrideRate,
        order: w.order ?? 0,
      }));
    }
    if (dto.photoIds !== undefined) {
      updates.photoIds = dto.photoIds.map((pid) => new Types.ObjectId(pid));
    }

    try {
      Object.assign(mod, updates);
      return await mod.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(
          `Module with sku="${dto.sku}" already exists (BR-MOD-3)`,
        );
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const mod = await this.moduleModel.findById(id).exec();
    if (!mod || mod.deletedAt) {
      throw new NotFoundException('Module not found');
    }
    mod.deletedAt = new Date();
    await mod.save();
  }

  /**
   * BR-MOD-8: computeCost — live, не кэшируется.
   *
   * Возвращает:
   *   materialsCost    — Σ(material.pricePerUnit × ratio × qty)
   *   worksCost        — Σ(hours × (overrideRate ?? workType.hourlyRate))
   *   childModulesCost — Σ(childModule.totalCost) (рекурсивно)
   *   totalCost        — materialsCost + worksCost + childModulesCost
   *   breakdown        — плоский список material/work/module с деталями
   */
  async computeCost(id: string): Promise<{
    materialsCost: number;
    worksCost: number;
    childModulesCost: number;
    totalCost: number;
    breakdown: Array<{
      type: 'material' | 'work' | 'module';
      refId: string;
      name: string;
      qty?: number;
      hours?: number;
      unitCost?: number;
      totalCost: number;
    }>;
  }> {
    const mod = await this.findById(id);
    const visited = new Set<string>([mod._id.toString()]);
    return this.computeCostRecursive(mod, visited, new Map());
  }

  /**
   * Внутренний рекурсивный compute. visited защищает от зацикливания.
   * costCache — мемоизация результатов по moduleId (избегаем повторов
   * при diamond-графах вложенности).
   */
  private async computeCostRecursive(
    mod: BomModule,
    visited: Set<string>,
    costCache: Map<string, number>,
  ): Promise<{
    materialsCost: number;
    worksCost: number;
    childModulesCost: number;
    totalCost: number;
    breakdown: Array<{
      type: 'material' | 'work' | 'module';
      refId: string;
      name: string;
      qty?: number;
      hours?: number;
      unitCost?: number;
      totalCost: number;
    }>;
  }> {
    // ── Materials ───────────────────────────────────────
    const materialIds = (mod.moduleMaterials ?? []).map((m) => m.materialId);
    const materials =
      materialIds.length > 0
        ? await this.materialModel
            .find({ _id: { $in: materialIds }, deletedAt: null })
            .exec()
        : [];
    const materialById = new Map(materials.map((m) => [m._id.toString(), m]));

    let materialsCost = 0;
    const breakdown: Array<any> = [];
    for (const mm of mod.moduleMaterials ?? []) {
      const material = materialById.get(mm.materialId.toString());
      if (!material) continue; // missing/deleted material — skip (no cost)
      const ratio = this.computeRatio(mm.usedDimensions, material.dimensions);
      const unitCost = material.pricePerUnit * ratio;
      const totalCost = unitCost * mm.qty;
      materialsCost += totalCost;
      breakdown.push({
        type: 'material',
        refId: mm.materialId.toString(),
        name: material.name,
        qty: mm.qty,
        unitCost,
        totalCost,
      });
    }

    // ── Works ───────────────────────────────────────────
    const workTypeIds = (mod.moduleWorks ?? []).map((w) => w.workTypeId);
    const workTypes =
      workTypeIds.length > 0
        ? await this.workTypeModel
            .find({ _id: { $in: workTypeIds }, deletedAt: null })
            .exec()
        : [];
    const workTypeById = new Map(workTypes.map((w) => [w._id.toString(), w]));

    let worksCost = 0;
    for (const mw of mod.moduleWorks ?? []) {
      const workType = workTypeById.get(mw.workTypeId.toString());
      if (!workType) continue; // missing/deleted workType — skip
      const rate = mw.overrideRate ?? workType.hourlyRate;
      const totalCost = rate * mw.hours;
      worksCost += totalCost;
      breakdown.push({
        type: 'work',
        refId: mw.workTypeId.toString(),
        name: workType.name,
        hours: mw.hours,
        unitCost: rate,
        totalCost,
      });
    }

    // ── Child modules (recursive) ───────────────────────
    let childModulesCost = 0;
    for (const childId of mod.childModuleIds ?? []) {
      const childIdStr = childId.toString();
      if (visited.has(childIdStr)) continue; // cycle defense
      if (costCache.has(childIdStr)) {
        childModulesCost += costCache.get(childIdStr)!;
        continue;
      }
      const child = await this.moduleModel
        .findOne({ _id: childId, deletedAt: null })
        .exec();
      if (!child) continue;
      visited.add(childIdStr);
      const childResult = await this.computeCostRecursive(
        child,
        visited,
        costCache,
      );
      childModulesCost += childResult.totalCost;
      costCache.set(childIdStr, childResult.totalCost);
      breakdown.push({
        type: 'module',
        refId: childIdStr,
        name: child.name,
        totalCost: childResult.totalCost,
      });
    }

    return {
      materialsCost: round(materialsCost),
      worksCost: round(worksCost),
      childModulesCost: round(childModulesCost),
      totalCost: round(materialsCost + worksCost + childModulesCost),
      breakdown,
    };
  }

  /**
   * ratio = usedVolume / sourceVolume (3D) или usedLength / sourceLength (1D) или 1.0.
   * Если dimensions (source) отсутствуют — ratio = 1.0 (цена за единицу без корректировки).
   */
  private computeRatio(
    used: { [k: string]: number | undefined } | undefined,
    source: { [k: string]: number | undefined } | undefined,
  ): number {
    if (!source) return 1.0;
    const hasLength = used?.length && source.length;
    if (hasLength) {
      // 3D if all 3 of length/width/height present in both used and source.
      const uLen = used?.length;
      const sLen = source.length;
      if (
        uLen !== undefined &&
        used?.width !== undefined &&
        used?.height !== undefined &&
        sLen !== undefined &&
        source.width !== undefined &&
        source.height !== undefined
      ) {
        const usedV = uLen * used.width * used.height;
        const srcV = sLen * source.width * source.height;
        if (srcV > 0) return usedV / srcV;
      }
      // 1D — только length (труба, пруток).
      const srcLen = source.length;
      const usedLen = used!.length!;
      if (srcLen !== undefined && srcLen > 0) {
        return usedLen / srcLen;
      }
    }
    return 1.0;
  }

  /**
   * BR-MOD-4/5/6: validate that referenced Material / WorkType / Module
   * documents exist (and not soft-deleted). Self-cycle check (BR-MOD-6).
   */
  private async validateReferences(
    moduleMaterials?: Array<{ materialId: string }>,
    moduleWorks?: Array<{ workTypeId: string }>,
    childModuleIds?: string[],
  ): Promise<void> {
    if (moduleMaterials && moduleMaterials.length > 0) {
      const ids = moduleMaterials.map((m) => new Types.ObjectId(m.materialId));
      const found = await this.materialModel
        .countDocuments({ _id: { $in: ids }, deletedAt: null })
        .exec();
      if (found !== moduleMaterials.length) {
        throw new BadRequestException(
          'BR-MOD-4: one or more materialIds do not exist (or are deleted)',
        );
      }
    }
    if (moduleWorks && moduleWorks.length > 0) {
      const ids = moduleWorks.map((w) => new Types.ObjectId(w.workTypeId));
      const found = await this.workTypeModel
        .countDocuments({ _id: { $in: ids }, deletedAt: null })
        .exec();
      if (found !== moduleWorks.length) {
        throw new BadRequestException(
          'BR-MOD-5: one or more workTypeIds do not exist (or are deleted)',
        );
      }
    }
    if (childModuleIds && childModuleIds.length > 0) {
      const ids = childModuleIds.map((c) => new Types.ObjectId(c));
      const found = await this.moduleModel
        .countDocuments({ _id: { $in: ids }, deletedAt: null })
        .exec();
      if (found !== childModuleIds.length) {
        throw new BadRequestException(
          'BR-MOD-2: one or more childModuleIds do not exist (or are deleted)',
        );
      }
    }
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
