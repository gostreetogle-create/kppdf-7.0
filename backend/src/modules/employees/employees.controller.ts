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
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSION_KEYS } from '../../common/types/permission-keys';

@Controller('employees')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Permissions(PERMISSION_KEYS.EMPLOYEES_READ)
  async findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSION_KEYS.EMPLOYEES_READ)
  async findOne(@Param('id') id: string) {
    return this.employeesService.findById(id);
  }

  @Post()
  @Permissions(PERMISSION_KEYS.EMPLOYEES_WRITE)
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Patch(':id')
  @Permissions(PERMISSION_KEYS.EMPLOYEES_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSION_KEYS.EMPLOYEES_DELETE)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.employeesService.remove(id);
    return { message: 'Employee deleted successfully' };
  }
}
