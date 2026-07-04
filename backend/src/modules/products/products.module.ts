import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BomModule, BomModuleSchema } from '../modules/schemas/module.schema';
import { ModulesModule } from '../modules/modules.module';

/**
 * ProductsModule.
 *
 * Imports BomModule collection for productModuleIds[] validation +
 * ModulesModule for the recursive computeProductCost() pipeline.
 *
 * No circular dep: ModulesModule does NOT import ProductsModule.
 */
@Module({
  imports: [
    ModulesModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: BomModule.name, schema: BomModuleSchema },
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [MongooseModule, ProductsService],
})
export class ProductsModule {}
