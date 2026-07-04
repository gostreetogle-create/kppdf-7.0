import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  // BR-WT-1: hourlyRate ≥ 0.
  @IsNumber()
  @Min(0)
  hourlyRate!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
