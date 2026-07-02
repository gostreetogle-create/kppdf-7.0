import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { Role } from '../roles/schemas/role.schema';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

/**
 * UsersService — CRUD пользователей.
 *
 * - BR-USR-1: username ≥3 символов, unique
 * - BR-USR-2: пароль → bcrypt 12 rounds, plain не хранится
 * - BR-USR-3: пароль min 8 символов
 * - BR-USR-4: soft-deleted user не может залогиниться (проверка в JwtStrategy)
 * - R4: назначить можно только ACTIVE роль
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userModel
      .find({ deletedAt: null })
      .populate('roleId', 'name status')
      .exec();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel
      .findOne({ _id: id, deletedAt: null })
      .populate('roleId', 'name status permissions')
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    // Check duplicate username
    const existing = await this.userModel
      .findOne({ username: dto.username, deletedAt: null })
      .exec();
    if (existing) {
      throw new ConflictException('Username already exists (BR-USR-1)');
    }

    // R4: role must be ACTIVE
    const role = await this.roleModel.findById(dto.roleId).exec();
    if (!role || role.deletedAt) {
      throw new NotFoundException('Role not found');
    }
    if (role.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot assign a non-ACTIVE role to a user (R4)',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = new this.userModel({
      username: dto.username,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
      roleId: role._id,
    });
    return user.save();
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.userModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!user) throw new NotFoundException('User not found');

    // If changing role, check R4: role must be ACTIVE
    if (dto.roleId) {
      const role = await this.roleModel.findById(dto.roleId).exec();
      if (!role || role.deletedAt) {
        throw new NotFoundException('Role not found');
      }
      if (role.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Cannot assign a non-ACTIVE role to a user (R4)',
        );
      }
    }

    // Build update object — map DTO fields to User schema fields
    const updates: Record<string, any> = {};
    if (dto.fullName !== undefined) updates.fullName = dto.fullName;
    if (dto.phone !== undefined) updates.phone = dto.phone;
    if (dto.roleId !== undefined) updates.roleId = new Types.ObjectId(dto.roleId);
    if (dto.password) updates.passwordHash = await bcrypt.hash(dto.password, 12);

    Object.assign(user, updates);
    return user.save();
  }

  /**
   * Soft-delete user (BR-USR-4: deleted users cannot log in).
   */
  async remove(id: string): Promise<void> {
    const user = await this.userModel.findById(id).exec();
    if (!user || user.deletedAt) throw new NotFoundException('User not found');

    user.deletedAt = new Date();
    await user.save();
  }
}
