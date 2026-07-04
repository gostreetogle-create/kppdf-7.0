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
import { ModulesService } from './modules.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';

@Controller('modules')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get()
  @Permissions(PERMISSION_KEYS.MODULES_READ)
  async findAll() {
    return this.modulesService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSION_KEYS.MODULES_READ)
  async findOne(@Param('id') id: string) {
    return this.modulesService.findById(id);
  }

  /**
   * BR-MOD-8: POST /api/modules/:id/compute-cost
   * Returns: { materialsCost, worksCost, childModulesCost, totalCost, breakdown[] }.
   */
  @Post(':id/compute-cost')
  @Permissions(PERMISSION_KEYS.MODULES_READ)
  @HttpCode(HttpStatus.OK)
  async computeCost(@Param('id') id: string) {
    return this.modulesService.computeCost(id);
  }

  @Post()
  @Permissions(PERMISSION_KEYS.MODULES_WRITE)
  async create(@Body() dto: CreateModuleDto) {
    return this.modulesService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSION_KEYS.MODULES_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateModuleDto) {
    return this.modulesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSION_KEYS.MODULES_DELETE)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.modulesService.remove(id);
    return { message: 'Module deleted successfully' };
  }
}
