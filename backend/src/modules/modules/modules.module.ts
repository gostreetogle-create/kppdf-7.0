import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BomModule, BomModuleSchema } from './schemas/module.schema';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { Material, MaterialSchema } from '../materials/schemas/material.schema';
import { WorkType, WorkTypeSchema } from '../work-types/schemas/work-type.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BomModule.name, schema: BomModuleSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: WorkType.name, schema: WorkTypeSchema },
    ]),
  ],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [MongooseModule, ModulesService],
})
export class ModulesModule {}
