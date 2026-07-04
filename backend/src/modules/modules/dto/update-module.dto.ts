// Update DTO — все поля опциональны (для PATCH).
// Реализован вручную без @nestjs/mapped-types.
export class UpdateModuleDto {
  name?: string;
  sku?: string;
  category?: string;
  notes?: string;
  dimensions?: { length?: number; width?: number; height?: number };
  childModuleIds?: string[];
  moduleMaterials?: Array<{
    materialId: string;
    qty: number;
    unit?: string;
    usedDimensions?: {
      length?: number;
      width?: number;
      height?: number;
      diameter?: number;
      thickness?: number;
    };
    order?: number;
  }>;
  moduleWorks?: Array<{
    workTypeId: string;
    hours: number;
    overrideRate?: number;
    order?: number;
  }>;
  photoIds?: string[];
}
