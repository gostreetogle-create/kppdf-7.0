import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { configuration } from './config/configuration';
import { HealthModule } from './health/health.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProductsModule } from './modules/products/products.module';
import { StorageModule } from './modules/storage/storage.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminSeedService } from './bootstrap/admin-seed';

/**
 * Root module for kppdf-7.0 backend.
 *
 * Stage 4.B (Admin Area) activated:
 *   - AuthModule (JWT login + refresh)
 *   - RolesModule (CRUD + permission assignment)
 *   - UsersModule (CRUD with role assignment)
 *   - AdminSeedService (real seed logic)
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

    // Stage 3 — Domain Mongoose schemas (all 7 entities).
    UsersModule,
    RolesModule,
    OrganizationsModule,
    ProductsModule,
    StorageModule,
    IngestionModule,

    // Stage 4.B — Admin Area.
    AuthModule,
  ],
  providers: [AdminSeedService],
})
export class AppModule {}
