import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization } from './schemas/organization.schema';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

/**
 * OrganizationsService — CRUD для организаций.
 *
 * - BR-ORG-1: name required (schema-level)
 * - BR-ORG-2: legalType определяет видимый набор полей (UI-layer)
 * - BR-ORG-3: inn формат (service-level, deferred to Stage 4.D Storage?)
 * - BR-ORG-4: partyTypes минимум 1 (schema-level + DTO)
 * - BR-ORG-5: partyTypes можно менять позже (PATCH)
 * - BR-ORG-6: photoIds опциональны (0+)
 * - BR-ORG-7: COPY запрещена — endpoint не существует
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
  ) {}

  async findAll(): Promise<Organization[]> {
    return this.orgModel.find({ deletedAt: null }).exec();
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    // Check duplicate name (optional — not a unique index, but useful UX)
    const existing = await this.orgModel
      .findOne({ name: dto.name, deletedAt: null })
      .exec();
    if (existing) {
      throw new ConflictException(
        'Organization with this name already exists',
      );
    }

    const org = new this.orgModel({
      ...dto,
      contacts: dto.contacts ?? [],
    });

    try {
      return await org.save();
    } catch (err: any) {
      // Unique index violation (race condition) → 409
      if (err?.code === 11000) {
        throw new ConflictException(
          'Organization with this name already exists',
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const org = await this.orgModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!org) throw new NotFoundException('Organization not found');

    // Check duplicate name if renaming
    if (dto.name && dto.name !== org.name) {
      const existing = await this.orgModel
        .findOne({ name: dto.name, deletedAt: null, _id: { $ne: id } })
        .exec();
      if (existing) {
        throw new ConflictException(
          'Organization with this name already exists',
        );
      }
    }

    Object.assign(org, dto);
    return org.save();
  }

  /**
   * Soft-delete organization (BR-ORG-*: same pattern as other entities).
   */
  async remove(id: string): Promise<void> {
    const org = await this.orgModel.findById(id).exec();
    if (!org || org.deletedAt) throw new NotFoundException('Organization not found');

    org.deletedAt = new Date();
    await org.save();
  }
}
