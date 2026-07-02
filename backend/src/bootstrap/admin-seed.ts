import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../modules/users/schemas/user.schema';
import { Role } from '../modules/roles/schemas/role.schema';
import { Permission, PermissionAction, PermissionSection } from '../modules/roles/schemas/permission.schema';

/**
 * Seed data: 14 default permissions per RBAC-SCHEME.md §1.
 */
const PERMISSIONS_SEED: Array<{
  key: string;
  section: PermissionSection;
  action: PermissionAction;
  description: string;
}> = [
  { key: 'USERS_READ', section: PermissionSection.USERS, action: PermissionAction.READ, description: 'Просмотр списка пользователей' },
  { key: 'USERS_WRITE', section: PermissionSection.USERS, action: PermissionAction.WRITE, description: 'Создание/редактирование пользователей' },
  { key: 'USERS_DELETE', section: PermissionSection.USERS, action: PermissionAction.DELETE, description: 'Удаление пользователей' },
  { key: 'ROLES_READ', section: PermissionSection.ROLES, action: PermissionAction.READ, description: 'Просмотр ролей и прав' },
  { key: 'ROLES_WRITE', section: PermissionSection.ROLES, action: PermissionAction.WRITE, description: 'Создание/редактирование ролей' },
  { key: 'ORGANIZATIONS_READ', section: PermissionSection.ORGANIZATIONS, action: PermissionAction.READ, description: 'Просмотр списка/карточки организаций' },
  { key: 'ORGANIZATIONS_WRITE', section: PermissionSection.ORGANIZATIONS, action: PermissionAction.WRITE, description: 'Создание/редактирование организаций' },
  { key: 'ORGANIZATIONS_DELETE', section: PermissionSection.ORGANIZATIONS, action: PermissionAction.DELETE, description: 'Удаление организаций' },
  { key: 'PRODUCTS_READ', section: PermissionSection.PRODUCTS, action: PermissionAction.READ, description: 'Просмотр списка/карточки товаров' },
  { key: 'PRODUCTS_WRITE', section: PermissionSection.PRODUCTS, action: PermissionAction.WRITE, description: 'Создание/редактирование товаров' },
  { key: 'PRODUCTS_DELETE', section: PermissionSection.PRODUCTS, action: PermissionAction.DELETE, description: 'Удаление товаров' },
  { key: 'PRODUCTS_COPY', section: PermissionSection.PRODUCTS, action: PermissionAction.COPY, description: 'Копирование товара' },
  { key: 'IMPORTS_READ', section: PermissionSection.IMPORTS, action: PermissionAction.READ, description: 'Просмотр статуса импорт-операций' },
  { key: 'IMPORTS_WRITE', section: PermissionSection.IMPORTS, action: PermissionAction.WRITE, description: 'Загрузка Excel/JSON/API для импорта' },
];

/**
 * Admin seed — creates bootstrap roles, permissions, and admin user on first launch.
 *
 * Per docs/backend/ARCHITECTURE.md §4 (Bootstrap flow):
 *   1. Seed 14 Permission documents (if collection empty).
 *   2. Create admin/manager/operator roles (if missing).
 *   3. Create admin User with bcrypt-hashed password.
 *   4. Log "✅ Admin seeded: username=..." (NEVER log the password).
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(Permission.name) private readonly permissionModel: Model<Permission>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedPermissions();
    await this.seedRoles();
    await this.seedAdminUser();
  }

  private async seedPermissions(): Promise<void> {
    const count = await this.permissionModel.countDocuments().exec();
    if (count > 0) {
      this.logger.log(`✅ ${count} permissions already exist, skipping permission seed`);
      return;
    }

    await this.permissionModel.insertMany(PERMISSIONS_SEED);
    this.logger.log(`✅ Seeded ${PERMISSIONS_SEED.length} permissions`);
  }

  private async seedRoles(): Promise<void> {
    await this.roleModel.findOneAndUpdate(
      { name: 'admin' },
      {
        $setOnInsert: {
          name: 'admin',
          isSystemRole: true,
          status: 'ACTIVE',
          permissions: [],
          description: 'System administrator — full access to all sections (R3 auto-resolve)',
        },
      },
      { upsert: true, new: true },
    ).exec();

    await this.roleModel.findOneAndUpdate(
      { name: 'manager' },
      {
        $setOnInsert: {
          name: 'manager',
          isSystemRole: false,
          status: 'ACTIVE',
          permissions: [
            'PRODUCTS_READ', 'PRODUCTS_WRITE', 'PRODUCTS_COPY',
            'ORGANIZATIONS_READ', 'ORGANIZATIONS_WRITE',
            'IMPORTS_READ', 'IMPORTS_WRITE',
          ],
          description: 'Manager — can manage products, organizations, and imports',
        },
      },
      { upsert: true, new: true },
    ).exec();

    await this.roleModel.findOneAndUpdate(
      { name: 'operator' },
      {
        $setOnInsert: {
          name: 'operator',
          isSystemRole: false,
          status: 'ACTIVE',
          permissions: ['PRODUCTS_READ', 'ORGANIZATIONS_READ', 'IMPORTS_READ'],
          description: 'Operator — read-only access to products, organizations, and imports',
        },
      },
      { upsert: true, new: true },
    ).exec();

    this.logger.log('✅ Roles seeded: admin, manager, operator');
  }

  private async seedAdminUser(): Promise<void> {
    const username = this.config.get<string>('app.admin.username')!;
    const password = this.config.get<string>('app.admin.password')!;

    const exists = await this.userModel
      .findOne({ username, deletedAt: null })
      .exec();
    if (exists) {
      this.logger.log(`✅ Admin user "${username}" already exists, skipping`);
      return;
    }

    const adminRole = await this.roleModel.findOne({ name: 'admin' }).exec();
    if (!adminRole) {
      this.logger.error('Admin role not found — seed race condition?');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.userModel.create({
      username,
      passwordHash,
      fullName: 'System Administrator',
      roleId: adminRole._id,
    });

    this.logger.log(`✅ Admin seeded: username="${username}"`);
  }
}
