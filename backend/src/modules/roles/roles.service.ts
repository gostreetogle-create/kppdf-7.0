import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from './schemas/role.schema';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { type PermissionKey } from '../../common/types/permission-keys';

/**
 * RolesService — CRUD для ролей с проверками:
 *   - R1 (Ownership Rule): нельзя дать permissions больше, чем у присваивающего
 *   - R2 (Admin Lock): isSystemRole нельзя удалить/переименовать
 *   - R4 (Active Filter): назначить можно только ACTIVE роль
 *   - BR-USR-6: status machine DRAFT → ACTIVE → ARCHIVED
 *   - BR-USR-7: WRITE grants imply READ
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleModel.find({ deletedAt: null }).exec();
  }

  async findById(id: string): Promise<Role> {
    const role = await this.roleModel.findOne({
      _id: id,
      deletedAt: null,
    }).exec();
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  /**
   * Create a new role.
   *
   * @param dto - creation data
   * @param effectivePermissions - permissions of the requesting user (R1 check)
   */
  async create(
    dto: CreateRoleDto,
    effectivePermissions?: PermissionKey[],
  ): Promise<Role> {
    // Check duplicate name
    const existing = await this.roleModel
      .findOne({ name: dto.name, deletedAt: null })
      .exec();
    if (existing) throw new ConflictException('Role with this name already exists');

    const requestedPermissions = dto.permissions ?? [];

    // R1 Ownership Rule: requesting user must have all permissions they're assigning
    this.validateOwnershipRule(requestedPermissions, effectivePermissions);

    // Validate WRITE implies READ (BR-USR-7)
    this.validateWriteImpliesRead(requestedPermissions);

    const role = new this.roleModel({
      name: dto.name,
      status: dto.status ?? 'ACTIVE',
      permissions: requestedPermissions,
      description: dto.description,
      isSystemRole: false, // never set via API
    });
    return role.save();
  }

  /**
   * Update an existing role.
   *
   * @param id - role ID
   * @param dto - update data
   * @param effectivePermissions - permissions of the requesting user (R1 check)
   */
  async update(
    id: string,
    dto: UpdateRoleDto,
    effectivePermissions?: PermissionKey[],
  ): Promise<Role> {
    const role = await this.roleModel.findById(id).exec();
    if (!role || role.deletedAt) throw new NotFoundException('Role not found');

    // R2: system roles cannot be renamed or have permissions changed
    if (role.isSystemRole) {
      if (dto.name || dto.permissions) {
        throw new ForbiddenException(
          'System roles cannot be renamed or have their permissions changed (R2)',
        );
      }
    }

    // R1 Ownership Rule: validate when permissions are being changed
    if (dto.permissions) {
      this.validateOwnershipRule(dto.permissions, effectivePermissions);
      // Validate WRITE implies READ (BR-USR-7)
      this.validateWriteImpliesRead(dto.permissions);
    }

    // Check for duplicate name if renaming
    if (dto.name && dto.name !== role.name) {
      const existing = await this.roleModel
        .findOne({ name: dto.name, deletedAt: null, _id: { $ne: id } })
        .exec();
      if (existing) throw new ConflictException('Role with this name already exists');
    }

    Object.assign(role, dto);
    return role.save();
  }

  /**
   * Soft-delete role (R2: system roles cannot be deleted).
   */
  async remove(id: string): Promise<void> {
    const role = await this.roleModel.findById(id).exec();
    if (!role || role.deletedAt) throw new NotFoundException('Role not found');

    if (role.isSystemRole) {
      throw new ForbiddenException('System roles cannot be deleted (R2)');
    }

    role.deletedAt = new Date();
    await role.save();
  }

  /**
   * R1 (Ownership Rule): custom role cannot have permissions outside
   * the effective permissions of the assigning user.
   *
   * If effectivePermissions is not provided (legacy call), the check is skipped.
   * If effectivePermissions equals ALL_PERMISSION_KEYS (admin), any assignment is allowed.
   */
  private validateOwnershipRule(
    requestedPermissions: string[],
    effectivePermissions?: PermissionKey[],
  ): void {
    if (!effectivePermissions) return; // legacy call — skip
    if (requestedPermissions.length === 0) return; // nothing to check

    const missing = requestedPermissions.filter(
      (p) => !effectivePermissions.includes(p as PermissionKey),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Cannot assign permissions you don't have: ${missing.join(', ')} (R1)`,
      );
    }
  }

  /**
   * Validate BR-USR-7: WRITE grants require READ grant for the same section.
   */
  private validateWriteImpliesRead(permissions: string[]): void {
    const writeKeys = permissions.filter((k) => k.endsWith('_WRITE'));
    for (const writeKey of writeKeys) {
      const section = writeKey.replace('_WRITE', '');
      const readKey = `${section}_READ`;
      if (!permissions.includes(readKey)) {
        throw new BadRequestException(
          `Permission '${writeKey}' requires '${readKey}' (BR-USR-7)`,
        );
      }
    }
  }
}
