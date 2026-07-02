import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import {
  ImportJob,
  ImportJobSchema,
} from './schemas/import-job.schema';
import { Product } from '../products/schemas/product.schema';
import { ProductSchema } from '../products/schemas/product.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { OrganizationSchema } from '../organizations/schemas/organization.schema';
import { User } from '../users/schemas/user.schema';
import { UserSchema } from '../users/schemas/user.schema';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { ImportJobProcessor } from './import-job.processor';
import { ExcelImportStrategy } from './strategies/excel-import.strategy';
import { JsonImportStrategy } from './strategies/json-import.strategy';
import { ApiImportStrategy } from './strategies/api-import.strategy';
import { IImportStrategy } from './strategies/i-import.strategy';

const IMPORT_STRATEGIES = 'IMPORT_STRATEGIES';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImportJob.name, schema: ImportJobSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({
      name: 'imports',
    }),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    ImportJobProcessor,
    ExcelImportStrategy,
    JsonImportStrategy,
    ApiImportStrategy,
    {
      provide: IMPORT_STRATEGIES,
      useFactory: (
        excel: ExcelImportStrategy,
        json: JsonImportStrategy,
        api: ApiImportStrategy,
      ): IImportStrategy[] => [excel, json, api],
      inject: [ExcelImportStrategy, JsonImportStrategy, ApiImportStrategy],
    },
  ],
  exports: [MongooseModule],
})
export class IngestionModule {}
