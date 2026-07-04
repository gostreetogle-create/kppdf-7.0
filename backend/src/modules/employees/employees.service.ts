import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee } from './schemas/employee.schema';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

/**
 * EmployeesService — CRUD для справочника сотрудников.
 *
 * BR-EMP-1: name уникален.
 * BR-EMP-2: phone required.
 * BR-EMP-3: email опционален, валидация формата (DTO-side).
 * BR-EMP-4: active flag для уволенных + soft-delete.
 * BR-EMP-5: никакой auth-интеграции (Employee != User).
 */
@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<Employee>,
  ) {}

  async findAll(): Promise<Employee[]> {
    return this.employeeModel.find({ deletedAt: null }).exec();
  }

  async findById(id: string): Promise<Employee> {
    const employee = await this.employeeModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async create(dto: CreateEmployeeDto): Promise<Employee> {
    const exists = await this.employeeModel
      .findOne({ name: dto.name, deletedAt: null })
      .exec();
    if (exists) {
      throw new ConflictException(
        `Employee with name="${dto.name}" already exists (BR-EMP-1)`,
      );
    }
    const employee = new this.employeeModel({
      name: dto.name,
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      position: dto.position,
      active: true,
    });
    return employee.save();
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.employeeModel
      .findOne({ _id: id, deletedAt: null })
      .exec();
    if (!employee) throw new NotFoundException('Employee not found');

    if (dto.name && dto.name !== employee.name) {
      const exists = await this.employeeModel
        .findOne({ name: dto.name, deletedAt: null, _id: { $ne: id } })
        .exec();
      if (exists) {
        throw new ConflictException(
          `Employee with name="${dto.name}" already exists (BR-EMP-1)`,
        );
      }
    }

    Object.assign(employee, dto);
    return employee.save();
  }

  async remove(id: string): Promise<void> {
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee || employee.deletedAt) {
      throw new NotFoundException('Employee not found');
    }
    // Soft-delete + active: false (для семантики BR-EMP-4 «уволенные»).
    employee.deletedAt = new Date();
    employee.active = false;
    await employee.save();
  }
}
