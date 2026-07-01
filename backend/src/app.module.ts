import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { configuration } from './config/configuration';
import { HealthModule } from './health/health.module';

/**
 * Root module for kppdf-7.0 backend.
 *
 * Per docs/ANALYSIS.md §4.4 + docs/backend/CHECKLIST.md §6.1:
 *   - ONLY the Bootstrap agent (this Wave 1) edits this file.
 *   - Wave 2 domain agents (auth, organizations, products, storage) register
 *     their modules via parent-agent coordination (they edit `app.module.ts`
 *     ARE PROHIBITED — see ANALYSIS §4.4 "Конфликт-менеджмент").
 */
@Module({
  imports: [
    // Typesafe env loader (src/config/configuration.ts).
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    // MongoDB connection (via @nestjs/mongoose).
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGO_URI,
        dbName: process.env.MONGO_DB_NAME,
      }),
    }),

    // BullMQ connection for async ingestion (Wave 3.B).
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT ?? 6379),
          db: Number(process.env.REDIS_DB ?? 0),
        },
      }),
    }),

    // Health check (Wave 1).
    HealthModule,

    // ─── Wave 2 modules — registered here by parent agent after each agent commit ───
    // NOTE: AdminSeedService (src/bootstrap/admin-seed.ts) is intentionally NOT registered yet.
    // It's a Wave 1 placeholder with correct interface signature. Wave 2.A (AuthModule)
    // will register the real AdminSeedService via its providers list.
    // AuthModule,           // 4.A → 2.A (JWT strategies + login endpoint)
    // AuthModule,           // 4.A → 2.A (JWT strategies + login endpoint)
    // OrganizationsModule,  // 2.C
    // ProductsModule,       // 2.C
    // StorageModule,        // 2.D (LocalDiskProvider for photos)
    //
    // ─── Wave 3 modules ───
    // RolesModule,          // 4.B → 3.A (CRUD + permission assignment)
    // IngestionModule,      // 4.E → 3.B (BullMQ + 3 strategies)
  ],
})
export class AppModule {}
