import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUserPayload } from '../guards/rbac.guard';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 *
 * JwtAuthGuard must be applied before this decorator can work.
 *
 * Usage:
 * ```typescript
 * @Post()
 * async create(@CurrentUser() user: JwtUserPayload) { ... }
 * ```
 *
 * For a specific field:
 * ```typescript
 * @CurrentUser('permissions') permissions: PermissionKey[]
 * ```
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtUserPayload | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtUserPayload }>();
    const user = req.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
