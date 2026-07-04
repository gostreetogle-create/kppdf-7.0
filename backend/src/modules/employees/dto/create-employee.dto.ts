import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  // BR-EMP-1: name (login-style) — уникален.
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName!: string;

  // BR-EMP-2: phone обязателен.
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  phone!: string;

  // BR-EMP-3: email опционален, валидация формата.
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}
