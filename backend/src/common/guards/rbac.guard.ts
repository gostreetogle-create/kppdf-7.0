import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_METADATA_KEY } from '../decorators/permissions.decorator';
import {
  ALL_PERMISSION_KEYS,
  type PermissionKey,
} from '../types/permission-keys';

/**
 * JWT payload shape — produced by AuthModule's JwtStrategy (Wave 2.A).
 * Defined here so RbacGuard is testable in isolation pre-Auth.
 */
export interface JwtUserPayload {
  sub: string; // userId
  username: string;
  roleName: string;
  roleId: string;
  permissions: PermissionKey[];
}

/**
 * RBAC enforcement guard. Per docs/backend/RBAC-SCHEME.md:
 *   - R3 auto-resolve: admin role always has ALL permissions (RBAC §3.3).
 *   - User's effective permissions = role.permissions[] ∪ {all 14 for admin}.
 *   - Empty @Permissions() metadata → no enforcement (route is public).
 *
 * Wave 2 (AuthModule) issues JWTs with this payload shape. RbacGuard must be
 * applied AFTER JwtAuthGuard (`@UseGuards(JwtAuthGuard, RbacGuard)`).
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtUserPayload }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException(
        'No user in request — apply JwtAuthGuard before RbacGuard',
      );
    }

    const effective: PermissionKey[] =
      user.roleName === 'admin' ? ALL_PERMISSION_KEYS : (user.permissions ?? []);

    const missing = required.filter((k) => !effective.includes(k));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `User '${user.username}' (role=${user.roleName}) lacks permissions: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
