import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../types/permission-keys';

export const PERMISSIONS_METADATA_KEY = 'permissions';

/**
 * Mark route handler (or controller) as requiring the given permission keys.
 * RbacGuard reads this metadata + JWT payload to enforce.
 *
 * Usage:
 *   import { PERMISSION_KEYS } from '../common/types/permission-keys';
 *
 *   @Get()
 *   @Permissions(PERMISSION_KEYS.PRODUCTS_READ)
 *   list() { ... }
 *
 * Wave 2 (auth module) wires JwtAuthGuard BEFORE RbacGuard so that
 * `request.user` carries the JWT payload with the role's permission keys.
 *
 * RBAC: all listed keys are required (logical AND — user must have every one).
 */
export const Permissions = (...keys: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_METADATA_KEY, keys);
