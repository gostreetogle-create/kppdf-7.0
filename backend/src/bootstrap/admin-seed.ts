import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

/**
 * Admin seed stub — Wave 2 (Wave 2.A — AuthModule) implements full version.
 *
 * Per docs/backend/ARCHITECTURE.md §4 (Bootstrap flow):
 *   1. Check User.countDocuments({ username: ADMIN_USERNAME, deletedAt: null }) === 0
 *   2. If yes:
 *      - Create 'admin' Role with `isSystemRole: true` + all 14 permissions
 *      - Create User with username/password (bcrypt 12 rounds) + roleId → admin
 *   3. Log "✅ Admin seeded: username=..." (NEVER log the password).
 *
 * Wave 1: file exists with correct interface signature so the contract is
 * established. Wave 2 replaces contents with real logic (after UsersModule +
 * RolesModule are wired).
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(private readonly config: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    // PLACEHOLDER — Wave 2.A writes actual seed logic.
    // This stub exists so AppModule can reference the symbol with stable import.
    const username = this.config.get<string>('app.admin.username');
    this.logger.warn(
      `[WAVE-1-STUB] AdminSeedService.onApplicationBootstrap called for username="${username}". ` +
        'Full implementation lands in Stage 4 Wave 2.A.',
    );
  }

  /**
   * Helper exported for Wave 2.A — bcrypt hash password with 12 rounds.
   * Wave 2.A uses this in actual seed and in UsersModule.create().
   */
  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
}
