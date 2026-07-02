import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Role } from '../../roles/schemas/role.schema';
import {
  ALL_PERMISSION_KEYS,
  type PermissionKey,
} from '../../../common/types/permission-keys';
import type { JwtUserPayload } from '../../../common/guards/rbac.guard';

/**
 * JWT strategy — extracts user from Bearer token in Authorization header.
 *
 * Per RBAC-SCHEME.md §3.3 (R3 — Admin Auto-Resolve):
 *   - admin role → effective permissions = ALL_PERMISSION_KEYS
 *   - other roles → permissions from role.permissions[] in DB
 *
 * Rejects if user is soft-deleted (BR-USR-4).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('app.jwt.secret')!,
    });
  }

  async validate(payload: { sub: string }): Promise<JwtUserPayload> {
    const user = await this.userModel.findById(payload.sub).exec();
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found or deleted (BR-USR-4)');
    }

    const role = await this.roleModel.findById(user.roleId).exec();
    if (!role || role.status !== 'ACTIVE') {
      throw new UnauthorizedException('User role is not active');
    }

    const permissions: PermissionKey[] =
      role.name === 'admin'
        ? ALL_PERMISSION_KEYS
        : (role.permissions as PermissionKey[]);

    return {
      sub: user._id.toString(),
      username: user.username,
      roleName: role.name,
      roleId: role._id.toString(),
      permissions,
    };
  }
}
