import {
  IsArray,
  ArrayNotEmpty,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LegalType, PartyType } from '../schemas/organization.schema';

class ContactDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsEnum(LegalType)
  legalType!: LegalType;

  // Общие поля
  @IsOptional()
  @IsString()
  inn?: string;

  @IsOptional()
  @IsString()
  kpp?: string;

  @IsOptional()
  @IsString()
  ogrn?: string;

  @IsOptional()
  @IsString()
  legalAddress?: string;

  @IsOptional()
  @IsString()
  actualAddress?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  // ООО
  @IsOptional()
  @IsString()
  directorName?: string;

  @IsOptional()
  @IsDateString()
  registrationDate?: string;

  // ИП
  @IsOptional()
  @IsString()
  ogrnip?: string;

  @IsOptional()
  @IsDateString()
  ipRegistrationDate?: string;

  // ФЛ
  @IsOptional()
  @IsString()
  passportSeries?: string;

  @IsOptional()
  @IsString()
  passportNumber?: string;

  @IsOptional()
  @IsString()
  passportIssuedBy?: string;

  @IsOptional()
  @IsDateString()
  passportIssuedDate?: string;

  // Роли контрагента (минимум 1 — BR-ORG-4)
  @IsArray()
  @ArrayNotEmpty({ message: 'Организация должна иметь хотя бы одну partyType (BR-ORG-4)' })
  @IsEnum(PartyType, { each: true })
  partyTypes!: PartyType[];

  // Контакты
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts?: ContactDto[];
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(LegalType)
  legalType?: LegalType;

  @IsOptional()
  @IsString()
  inn?: string;

  @IsOptional()
  @IsString()
  kpp?: string;

  @IsOptional()
  @IsString()
  ogrn?: string;

  @IsOptional()
  @IsString()
  legalAddress?: string;

  @IsOptional()
  @IsString()
  actualAddress?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  directorName?: string;

  @IsOptional()
  @IsDateString()
  registrationDate?: string;

  @IsOptional()
  @IsString()
  ogrnip?: string;

  @IsOptional()
  @IsDateString()
  ipRegistrationDate?: string;

  @IsOptional()
  @IsString()
  passportSeries?: string;

  @IsOptional()
  @IsString()
  passportNumber?: string;

  @IsOptional()
  @IsString()
  passportIssuedBy?: string;

  @IsOptional()
  @IsDateString()
  passportIssuedDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'Организация должна иметь хотя бы одну partyType (BR-ORG-4)' })
  @IsEnum(PartyType, { each: true })
  partyTypes?: PartyType[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts?: ContactDto[];
}
