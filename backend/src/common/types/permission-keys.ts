/**
 * Permission keys registry — single source of truth.
 *
 * Per docs/backend/RBAC-SCHEME.md §1 (MVP = 14 permissions).
 * Used by:
 *   - @Permissions() decorator (src/common/decorators/permissions.decorator.ts)
 *   - RbacGuard (src/common/guards/rbac.guard.ts)
 *   - Admin seed (Wave 2.A — auto-grants all to admin role)
 *   - Default role definitions (manager, operator)
 *
 * NEVER add new permission without corresponding update to RBAC-SCHEME.md
 * — they're tightly coupled for audit purposes.
 */
export const PERMISSION_KEYS = {
  USERS_READ: 'USERS_READ',
  USERS_WRITE: 'USERS_WRITE',
  USERS_DELETE: 'USERS_DELETE',
  ROLES_READ: 'ROLES_READ',
  ROLES_WRITE: 'ROLES_WRITE',
  ORGANIZATIONS_READ: 'ORGANIZATIONS_READ',
  ORGANIZATIONS_WRITE: 'ORGANIZATIONS_WRITE',
  ORGANIZATIONS_DELETE: 'ORGANIZATIONS_DELETE',
  PRODUCTS_READ: 'PRODUCTS_READ',
  PRODUCTS_WRITE: 'PRODUCTS_WRITE',
  PRODUCTS_DELETE: 'PRODUCTS_DELETE',
  PRODUCTS_COPY: 'PRODUCTS_COPY',
  IMPORTS_READ: 'IMPORTS_READ',
  IMPORTS_WRITE: 'IMPORTS_WRITE',
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSION_KEYS);
