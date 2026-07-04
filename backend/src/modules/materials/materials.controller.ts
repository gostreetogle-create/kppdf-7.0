import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';

@Controller('materials')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  @Permissions(PERMISSION_KEYS.MATERIALS_READ)
  async findAll() {
    return this.materialsService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSION_KEYS.MATERIALS_READ)
  async findOne(@Param('id') id: string) {
    return this.materialsService.findById(id);
  }

  @Post()
  @Permissions(PERMISSION_KEYS.MATERIALS_WRITE)
  async create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSION_KEYS.MATERIALS_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.materialsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSION_KEYS.MATERIALS_DELETE)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.materialsService.remove(id);
    return { message: 'Material deleted successfully' };
  }
}
