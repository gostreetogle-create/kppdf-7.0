import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Material, MaterialSchema } from './schemas/material.schema';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MongooseModule, MaterialsService],
})
export class MaterialsModule {}
