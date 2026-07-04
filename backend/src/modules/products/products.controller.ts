import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CopyProductDto } from './dto/copy-product.dto';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';

@Controller('products')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions(PERMISSION_KEYS.PRODUCTS_READ)
  async findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSION_KEYS.PRODUCTS_READ)
  async findOne(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post()
  @Permissions(PERMISSION_KEYS.PRODUCTS_WRITE)
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSION_KEYS.PRODUCTS_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Post(':id/copy')
  @Permissions(PERMISSION_KEYS.PRODUCTS_COPY)
  async copy(@Param('id') id: string, @Body() dto?: CopyProductDto) {
    return this.productsService.copy(id, dto);
  }

  // === BOM (PSL-012) ===

  @Post(':id/modules')
  @Permissions(PERMISSION_KEYS.PRODUCTS_WRITE)
  async addModule(
    @Param('id') id: string,
    @Body() body: { moduleId: string },
  ) {
    return this.productsService.addModule(id, body.moduleId);
  }

  @Delete(':id/modules/:moduleId')
  @Permissions(PERMISSION_KEYS.PRODUCTS_WRITE)
  async removeModule(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
  ) {
    return this.productsService.removeModule(id, moduleId);
  }

  @Patch(':id/modules/reorder')
  @Permissions(PERMISSION_KEYS.PRODUCTS_WRITE)
  async reorderModules(
    @Param('id') id: string,
    @Body() body: { moduleIds: string[] },
  ) {
    return this.productsService.reorderModules(id, body.moduleIds);
  }

  @Delete(':id')
  @Permissions(PERMISSION_KEYS.PRODUCTS_DELETE)
  async remove(@Param('id') id: string) {
    await this.productsService.remove(id);
    return { message: 'Product deleted successfully' };
  }

  /**
   * GET /api/products/:id/compute-cost — BR-PRD-10, Σ(active module totalCost).
   * Endpoint shape mirrors api.service.ts ComputeProductCostResult.
   */
  @Get(':id/compute-cost')
  @Permissions(PERMISSION_KEYS.PRODUCTS_READ)
  async computeCost(@Param('id') id: string) {
    return this.productsService.computeProductCost(id);
  }
}
