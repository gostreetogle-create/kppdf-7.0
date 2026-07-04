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
import { WorkTypesService } from './work-types.service';
import { CreateWorkTypeDto } from './dto/create-work-type.dto';
import { UpdateWorkTypeDto } from './dto/update-work-type.dto';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';

@Controller('work-types')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class WorkTypesController {
  constructor(private readonly workTypesService: WorkTypesService) {}

  @Get()
  @Permissions(PERMISSION_KEYS.WORKTYPES_READ)
  async findAll() {
    return this.workTypesService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSION_KEYS.WORKTYPES_READ)
  async findOne(@Param('id') id: string) {
    return this.workTypesService.findById(id);
  }

  @Post()
  @Permissions(PERMISSION_KEYS.WORKTYPES_WRITE)
  async create(@Body() dto: CreateWorkTypeDto) {
    return this.workTypesService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSION_KEYS.WORKTYPES_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateWorkTypeDto) {
    return this.workTypesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSION_KEYS.WORKTYPES_DELETE)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.workTypesService.remove(id);
    return { message: 'WorkType deleted successfully' };
  }
}
