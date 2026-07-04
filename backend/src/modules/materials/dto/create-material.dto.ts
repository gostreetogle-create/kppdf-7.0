import {
  IsArray,
  IsBoolean,
  IsEnum,
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
import { MATERIAL_UNITS, type MaterialUnit } from '../schemas/material.schema';

/**
 * Dimensions — any subset of { length, width, height, diameter, thickness }.
 * В mm (единый стандарт UI). Конвертация — UI-уровень.
 */
export class MaterialDimensionsDto {
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
 * fixedDimensions — какие размеры «жёстко зашиты» (не меняются при использовании).
 * Например, ширина/высота квадратной трубы — fixed, длина — режется.
 */
export class MaterialFixedDimensionsDto {
  @IsOptional()
  @IsBoolean()
  length?: boolean;

  @IsOptional()
  @IsBoolean()
  width?: boolean;

  @IsOptional()
  @IsBoolean()
  height?: boolean;

  @IsOptional()
  @IsBoolean()
  diameter?: boolean;

  @IsOptional()
  @IsBoolean()
  thickness?: boolean;
}

export class CreateMaterialDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  // BR-MAT-3: regex ^MAT-[A-Z0-9-]+$, 8–50 chars.
  @IsString()
  @Matches(/^MAT-[A-Z0-9-]+$/, {
    message: 'sku must match ^MAT-[A-Z0-9-]+$ (BR-MAT-3)',
  })
  @MinLength(8)
  @MaxLength(50)
  sku!: string;

  // BR-MAT-1: supplierId обязателен.
  @IsMongoId()
  supplierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  // BR-MAT-2: unit обязателен.
  @IsEnum(MATERIAL_UNITS, {
    message: `unit must be one of: ${MATERIAL_UNITS.join(', ')}`,
  })
  unit!: MaterialUnit;

  @IsNumber()
  @Min(0)
  pricePerUnit!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  priceCurrency?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MaterialDimensionsDto)
  dimensions?: MaterialDimensionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MaterialFixedDimensionsDto)
  fixedDimensions?: MaterialFixedDimensionsDto;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  photoIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
