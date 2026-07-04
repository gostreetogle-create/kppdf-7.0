import { CreateMaterialDto } from './create-material.dto';

// Update DTO — все поля опциональны (для PATCH).
// Реализован вручную, без @nestjs/mapped-types (избегаем лишней зависимости).
export class UpdateMaterialDto implements Partial<CreateMaterialDto> {
  name?: string;
  sku?: string;
  supplierId?: string;
  category?: string;
  unit?: 'mm' | 'cm' | 'm' | 'kg' | 'g' | 'pcs';
  pricePerUnit?: number;
  priceCurrency?: string;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
    thickness?: number;
  };
  fixedDimensions?: {
    length?: boolean;
    width?: boolean;
    height?: boolean;
    diameter?: boolean;
    thickness?: boolean;
  };
  photoIds?: string[];
  notes?: string;
}
