import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PermissionAction, PermissionSection } from '../schemas/permission.schema';

export class CreatePermissionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  key!: string;

  @IsEnum(PermissionSection)
  section!: PermissionSection;

  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsString()
  @MaxLength(255)
  description!: string;
}

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
