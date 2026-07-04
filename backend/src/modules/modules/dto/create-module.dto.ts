import {
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ModuleDimensionsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;
}

class ModuleUsedDimensionsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diameter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  thickness?: number;
}

/**
 * Вложенный материал в составе модуля.
 * BR-MOD-4: qty > 0, materialId → существующий Material.
 */
class ModuleMaterialItemDto {
  @IsMongoId()
  materialId!: string;

  @IsNumber()
  @Min(0.0001)
  qty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ModuleUsedDimensionsDto)
  usedDimensions?: ModuleUsedDimensionsDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  order?: number;
}

/**
 * Вложенная работа в составе модуля.
 * BR-MOD-5: hours > 0, workTypeId → существующий WorkType. overrideRate опционален.
 */
class ModuleWorkItemDto {
  @IsMongoId()
  workTypeId!: string;

  @IsNumber()
  @Min(0.01)
  hours!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overrideRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  order?: number;
}

/**
 * CreateModuleDto — BR-MOD-1..6.
 * standalone-модуль (пустые moduleMaterials/moduleWorks/childModuleIds) — OK.
 */
export class CreateModuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  // BR-MOD-3: sku regex ^[A-Z0-9-]+$, 3–32 chars.
  @IsString()
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'sku must match ^[A-Z0-9-]+$ (BR-MOD-3)',
  })
  @MinLength(3)
  @MaxLength(32)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ModuleDimensionsDto)
  dimensions?: ModuleDimensionsDto;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  childModuleIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuleMaterialItemDto)
  moduleMaterials?: ModuleMaterialItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuleWorkItemDto)
  moduleWorks?: ModuleWorkItemDto[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  photoIds?: string[];
}
