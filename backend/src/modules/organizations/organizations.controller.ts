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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';

@Controller('organizations')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get()
  @Permissions(PERMISSION_KEYS.ORGANIZATIONS_READ)
  async findAll() {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSION_KEYS.ORGANIZATIONS_READ)
  async findOne(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Post()
  @Permissions(PERMISSION_KEYS.ORGANIZATIONS_WRITE)
  async create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSION_KEYS.ORGANIZATIONS_WRITE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSION_KEYS.ORGANIZATIONS_DELETE)
  async remove(@Param('id') id: string) {
    await this.organizationsService.remove(id);
    return { message: 'Organization deleted successfully' };
  }
}
