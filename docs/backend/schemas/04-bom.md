# `schemas/04-bom.md` — BOM (Bill of Materials) схемы

> **Назначение.** Mongoose-схемы для BOM-домена: **Material** (каталог материалов от поставщиков), **Module** (узел сборки, может содержать другие модули + материалы + работы), **WorkType** (справочник видов работ), **Employee** (справочник сотрудников для будущего Gantt).
>
> **Иерархия:** `Product → Module → (Material | Module | WorkType)`. Цена каскадно вычисляется: Material price + Work cost → Module cost → Product cost.
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

## 1. Material (`_materials`)

Material — единица каталога (труба, лист, крепёж и т.д.). Покупается у поставщика (Organization). Имеет габаритные размеры в «фабричной» форме + флаги «фиксированных» размеров, которые не меняются при использовании (например, ширина/высота квадратной трубы фиксированы, длина — режется).

```typescript
// schemas/material.schema.ts
@Schema({ collection: 'materials', timestamps: true })
class Material {
  @Prop({ required: true, type: String }) name!: string;
  @Prop({ required: true, type: String, unique: true }) sku!: string;
  // sku: regex ^MAT-[A-Z0-9-]+$

  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Organization' })
  supplierId!: mongoose.Types.ObjectId;
  // BR-MAT-1: supplierId ОБЯЗАТЕЛЕН

  @Prop({ type: String }) category?: string;
  // 'Трубы' | 'Листовой' | 'Крепёж' | 'Сварка' | etc.

  @Prop({ type: String, required: true }) unit!: 'mm' | 'cm' | 'm' | 'kg' | 'g' | 'pcs';
  // BR-MAT-2: unit обязателен — единица продажи

  @Prop({ required: true, type: Number, min: 0 }) pricePerUnit!: number;
  @Prop({ default: 'RUB' }) priceCurrency!: string;

  // Габаритные размеры в «фабричной» форме (как продаётся)
  @Prop({ type: {
      length: { type: Number, required: false },
      width:  { type: Number, required: false },
      height: { type: Number, required: false },
      diameter: { type: Number, required: false },
      thickness: { type: Number, required: false },
    } })
  dimensions?: { length?: number; width?: number; height?: number; diameter?: number; thickness?: number };

  // Флаги «не изменяется» (какие размеры нельзя редактировать при использовании)
  @Prop({ type: {
      length:    { type: Boolean, default: false },
      width:     { type: Boolean, default: false },
      height:    { type: Boolean, default: false },
      diameter:  { type: Boolean, default: false },
      thickness: { type: Boolean, default: false },
    }, default: () => ({ length: false, width: false, height: false, diameter: false, thickness: false }) })
  fixedDimensions!: { length: boolean; width: boolean; height: boolean; diameter: boolean; thickness: boolean };

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }] })
  photoIds?: mongoose.Types.ObjectId[];

  @Prop({ type: String }) notes?: string;
  @Prop({ default: null, type: Date }) deletedAt!: Date | null;
}

MaterialSchema.index({ name: 1 });
MaterialSchema.index({ sku: 1 }, { unique: true });
MaterialSchema.index({ supplierId: 1, deletedAt: 1 });
MaterialSchema.index({ category: 1 });
```

**Правила (BR-MAT-*):**
- **BR-MAT-1**: `supplierId` обязателен (Mongoose `required: true`). Поставщик — это `Organization` с любым `legalType`.
- **BR-MAT-2**: `unit` обязателен — единица продажи материала. Используется для расчёта стоимости при потреблении.
- **BR-MAT-3**: `sku` regex `^MAT-[A-Z0-9-]+$`, 8-50 символов. Уникален.
- **BR-MAT-4**: `fixedDimensions.length` если `true`, то `dimensions.length` обязан быть задан (валидация в DTO).
- **BR-MAT-5**: Soft-delete через `deletedAt`. Queries фильтруют `deletedAt: null`.

## 2. Module (`_modules`)

Module — узел сборки. Может быть **standalone** (без материалов/работ/дочерних модулей) или **сложным** (содержит другие модули + материалы + работы). Цена вычисляется live через `ModuleService.computeCost(id)`.

```typescript
// schemas/module.schema.ts
@Schema({ collection: 'modules', timestamps: true })
class Module {
  @Prop({ required: true, type: String }) name!: string;
  @Prop({ required: true, type: String, unique: true }) sku!: string;
  // sku: regex ^[A-Z0-9-]+$ (как Product)
  @Prop({ type: String }) category?: string;
  // 'Рама' | 'Сборка' | 'Корпус' | etc.
  @Prop({ type: String }) notes?: string;

  // Габариты модуля (overall, для UI)
  @Prop({ type: {
      length: { type: Number, required: false },
      width:  { type: Number, required: false },
      height: { type: Number, required: false },
    } })
  dimensions?: { length?: number; width?: number; height?: number };

  // Дочерние модули (рекурсивная иерархия)
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Module' }] })
  childModuleIds?: mongoose.Types.ObjectId[];

  // Материалы в составе (embed)
  @Prop({ type: [{
      materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
      qty:        { type: Number, required: true, min: 0.0001 },
      unit:       { type: String, required: false }, // override Material.unit
      usedDimensions: {
        type: {
          length:    { type: Number, required: false },
          width:     { type: Number, required: false },
          height:    { type: Number, required: false },
          diameter:  { type: Number, required: false },
          thickness: { type: Number, required: false },
        },
        default: {},
        _id: false,
      },
      order: { type: Number, default: 0 },
    }] })
  moduleMaterials?: Array<{
    materialId: mongoose.Types.ObjectId;
    qty: number;
    unit?: string;
    usedDimensions: { length?: number; width?: number; height?: number; diameter?: number; thickness?: number };
    order: number;
  }>;

  // Работы в составе (embed)
  @Prop({ type: [{
      workTypeId:    { type: mongoose.Schema.Types.ObjectId, ref: 'WorkType', required: true },
      hours:         { type: Number, required: true, min: 0.01 },
      overrideRate:  { type: Number, required: false, min: 0 },
      order:         { type: Number, default: 0 },
    }] })
  moduleWorks?: Array<{
    workTypeId: mongoose.Types.ObjectId;
    hours: number;
    overrideRate?: number;
    order: number;
  }>;

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }] })
  photoIds?: mongoose.Types.ObjectId[];

  @Prop({ default: null, type: Date }) deletedAt!: Date | null;
}

export const ModuleSchema = SchemaFactory.createForClass(Module);
ModuleSchema.index({ sku: 1 }, { unique: true });
ModuleSchema.index({ name: 1, deletedAt: 1 });
ModuleSchema.index({ category: 1 });
```

**Расчёт стоимости модуля (`ModuleService.computeCost(id)`):**
```typescript
{
  materialsCost: Σ(material.pricePerUnit × ratio × qty),   // см. ниже
  worksCost:     Σ(hours × (overrideRate || workType.hourlyRate)),
  totalCost:     materialsCost + worksCost,
  breakdown: [
    { type: 'material', refId, qty, unitCost, totalCost },
    { type: 'work',     refId, hours, unitCost, totalCost },
    ...
  ]
}
```

**`ratio` для material:**
- 3D: `usedVolume / sourceVolume` (если указаны `usedDimensions` И `dimensions`)
- 1D (труба/пруток): `usedLength / sourceLength`
- Простой: `1.0` (qty = сколько единиц материала)

**Правила (BR-MOD-*):**
- **BR-MOD-1**: Module может быть standalone (пустые `moduleMaterials`, `moduleWorks`, `childModuleIds`). Не валидационная ошибка.
- **BR-MOD-2**: Вложенность модулей не ограничена (теоретически бесконечная), но UI рисует max 3 уровня вложенности для читаемости.
- **BR-MOD-3**: `sku` regex `^[A-Z0-9-]+$`, 3-32 символа, уникален.
- **BR-MOD-4**: `moduleMaterials[].qty > 0`. `moduleMaterials[].materialId` → существующий Material.
- **BR-MOD-5**: `moduleWorks[].hours > 0`. `moduleWorks[].workTypeId` → существующий WorkType. `overrideRate` опционален (если null/undefined, используется `workType.hourlyRate`).
- **BR-MOD-6**: `childModuleIds` не могут содержать сам модуль (защита от циклов). Проверка при сохранении.
- **BR-MOD-7**: Soft-delete через `deletedAt`. Нельзя удалить модуль, на который ссылается `Product.productModuleIds` (BR-PRD-9 deferred).

## 3. WorkType (`_workTypes`)

WorkType — справочник видов работ. Содержит name и default hourly rate.

```typescript
// schemas/work-type.schema.ts
@Schema({ collection: 'workTypes', timestamps: true })
class WorkType {
  @Prop({ required: true, type: String, unique: true }) name!: string;
  // 'Сварка' | 'Покраска' | 'Сборка' | 'Гибка' | etc.
  @Prop({ required: true, type: Number, min: 0 }) hourlyRate!: number;
  // BR-WT-1: hourlyRate ≥ 0
  @Prop({ type: String }) description?: string;
  @Prop({ default: null, type: Date }) deletedAt!: Date | null;
}

WorkTypeSchema.index({ name: 1 }, { unique: true });
```

**Правила (BR-WT-1/2):**
- **BR-WT-1**: `hourlyRate ≥ 0` (может быть 0 для учебных работ или бартера).
- **BR-WT-2**: Soft-delete через `deletedAt`. Нельзя удалить WorkType, на который ссылается хоть один `Module.moduleWorks` (отказ 409 ConflictException).

**Seed:** `admin-seed.ts` создаёт 3 базовых WorkType при первом запуске (если их нет): «Сварка» (500₽/ч), «Покраска» (400₽/ч), «Сборка» (350₽/ч). ID-agnostic — если уже есть с таким `name`, skip.

## 4. Employee (`_employees`)

Employee — справочник сотрудников для будущего Gantt-флоу (Phase X.2). Сейчас никаких связей с Works нет — справочник сам по себе.

```typescript
// schemas/employee.schema.ts
@Schema({ collection: 'employees', timestamps: true })
class Employee {
  @Prop({ required: true, type: String }) name!: string;
  // Краткое имя/логин ('ivanov')
  @Prop({ required: true, type: String }) fullName!: string;
  // 'Иванов Иван Иванович'
  @Prop({ type: String, required: true }) phone!: string;
  @Prop({ type: String, required: false }) email?: string;
  @Prop({ type: String, required: false }) position?: string;
  // 'Сварщик' | 'Маляр' | 'Сборщик' — для будущего распределения WorkType→Employee
  @Prop({ type: Boolean, default: true }) active!: boolean;
  // Уволенные = false (soft)
  @Prop({ default: null, type: Date }) deletedAt!: Date | null;
}

EmployeeSchema.index({ name: 1 }, { unique: true });
EmployeeSchema.index({ active: 1, deletedAt: 1 });
```

**Правила (BR-EMP-*):**
- **BR-EMP-1**: `name` уникален (login-style).
- **BR-EMP-2**: `phone` обязателен (для будущего Gantt-уведомлений).
- **BR-EMP-3**: `email` опционален, но если задан — валидация формата.
- **BR-EMP-4**: Soft-delete (`deletedAt: Date | null`). Уволенные: `active: false` + `deletedAt` set.
- **BR-EMP-5**: Никаких auth-интеграций. Employee — это просто запись в справочнике. Логин в систему — через `User`.

## 5. Связи (локально для этой группы)

```text
Product ──── productModuleIds[] ────► Module
                                       │
                                       ├─ childModuleIds[] ───► Module (рекурсивно)
                                       ├─ moduleMaterials[] ───► Material
                                       │                              │
                                       │                              └─ supplierId ──► Organization
                                       └─ moduleWorks[] ────────────► WorkType

(Phase X.2)
Order → Product (ref) → Task → ModuleWork + Employee
```

## 6. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.0 | 2026-07-04 | Initial BOM. 4 сущности: Material, Module, WorkType, Employee. Иерархия Product → Module → (Material \| Work \| Module). Расчёт cost live. См. PSL-012. |
