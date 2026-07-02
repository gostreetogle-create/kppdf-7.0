import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CopyProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'sku must be uppercase alphanumeric with hyphens (BR-PRD-3)',
  })
  sku?: string;
}
