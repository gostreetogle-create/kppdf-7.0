import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkType, WorkTypeSchema } from './schemas/work-type.schema';
import { WorkTypesController } from './work-types.controller';
import { WorkTypesService } from './work-types.service';
import { BomModule, BomModuleSchema } from '../modules/schemas/module.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkType.name, schema: WorkTypeSchema },
      { name: BomModule.name, schema: BomModuleSchema },
    ]),
  ],
  controllers: [WorkTypesController],
  providers: [WorkTypesService],
  exports: [MongooseModule, WorkTypesService],
})
export class WorkTypesModule {}
