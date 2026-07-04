import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkType } from './schemas/work-type.schema';
import { CreateWorkTypeDto } from './dto/create-work-type.dto';
import { UpdateWorkTypeDto } from './dto/update-work-type.dto';
import { BomModule } from '../modules/schemas/module.schema';

/**
 * WorkTypesService — CRUD для справочника видов работ.
 *
 * BR-WT-1: hourlyRate ≥ 0 (schema-level).
 * BR-WT-2: soft-delete; нельзя удалить, если есть ссылки в BomModule.moduleWorks.
 */
@Injectable()
export class WorkTypesService {
  constructor(
    @InjectModel(WorkType.name)
    private readonly workTypeModel: Model<WorkType>,
    @InjectModel(BomModule.name)
    private readonly moduleModel: Model<BomModule>,
  ) {}

  async findAll(): Promise<WorkType[]> {
    return this.workTypeModel.find({ deletedAt: null }).exec();
  }

  async findById(id: string): Promise<WorkType> {
    const workType = await this.workTypeModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!workType) throw new NotFoundException('WorkType not found');
    return workType;
  }

  async create(dto: CreateWorkTypeDto): Promise<WorkType> {
    const exists = await this.workTypeModel
      .findOne({ name: dto.name, deletedAt: null })
      .exec();
    if (exists) {
      throw new ConflictException(
        `WorkType with name="${dto.name}" already exists`,
      );
    }
    const workType = new this.workTypeModel({
      name: dto.name,
      hourlyRate: dto.hourlyRate,
      description: dto.description,
    });
    return workType.save();
  }

  async update(id: string, dto: UpdateWorkTypeDto): Promise<WorkType> {
    const workType = await this.workTypeModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!workType) throw new NotFoundException('WorkType not found');

    if (dto.name && dto.name !== workType.name) {
      const exists = await this.workTypeModel
        .findOne({ name: dto.name, deletedAt: null, _id: { $ne: id } })
        .exec();
      if (exists) {
        throw new ConflictException(
          `WorkType with name="${dto.name}" already exists`,
        );
      }
    }

    Object.assign(workType, dto);
    return workType.save();
  }

  /**
   * BR-WT-2: нельзя удалить, если WorkType используется в каком-либо активном
   * модуле (BomModule.moduleWorks). Защита от cascade-разрушения BOM.
   */
  async remove(id: string): Promise<void> {
    const workType = await this.workTypeModel.findById(id).exec();
    if (!workType || workType.deletedAt) {
      throw new NotFoundException('WorkType not found');
    }

    const usageCount = await this.moduleModel
      .countDocuments({
        'moduleWorks.workTypeId': workType._id,
        deletedAt: null,
      })
      .exec();
    if (usageCount > 0) {
      throw new ConflictException(
        `WorkType used in ${usageCount} module(s), cannot delete (BR-WT-2)`,
      );
    }

    workType.deletedAt = new Date();
    await workType.save();
  }
}
