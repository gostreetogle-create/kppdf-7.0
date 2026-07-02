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
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';
import type { JwtUserPayload } from '../../common/guards/rbac.guard';

@Controller('roles')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions(PERMISSION_KEYS.ROLES_READ)
  async findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSION_KEYS.ROLES_READ)
  async findOne(@Param('id') id: string) {
    return this.rolesService.findById(id);
  }

  @Post()
  @Permissions(PERMISSION_KEYS.ROLES_WRITE)
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.rolesService.create(dto, user.permissions);
  }

  @Patch(':id')
  @Permissions(PERMISSION_KEYS.ROLES_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.rolesService.update(id, dto, user.permissions);
  }

  @Delete(':id')
  @Permissions(PERMISSION_KEYS.ROLES_WRITE)
  async remove(@Param('id') id: string) {
    await this.rolesService.remove(id);
    return { message: 'Role deleted successfully' };
  }
}
