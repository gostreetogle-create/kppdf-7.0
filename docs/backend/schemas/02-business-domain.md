# `schemas/02-business-domain.md` — Organization + Product схемы

> **Назначение.** Mongoose-схемы бизнес-сущностей (контрагенты + товары). Зависит от [`01-core-users.md`](01-core-users.md) косвенно (через audit `createdByUserId` → User, и через RBAC permissions `ORGANIZATIONS_*` / `PRODUCTS_*`).
>
> **Источник:** §4, §5 оригинального `DOMAIN-MODEL.md` v1.0 (содержимое **перенесено без изменений**).
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

## 1. Organization (`_organizations` коллекция)

```typescript
// schemas/organization.schema.ts
enum LegalType { OOO = 'OOO', IP = 'IP', FL = 'FL' }
enum PartyType { SUPPLIER = 'SUPPLIER', SELLER = 'SELLER', BUYER = 'BUYER' }

@Schema({ collection: 'organizations', timestamps: true })
class Organization {
  @Prop({ required: true }) name: string;
  // 'ООО Ромашка', 'ИП Иванов', 'Петров П.П.'
  @Prop({ required: true, enum: Object.values(LegalType) })
  legalType: LegalType;

  // === Общие поля (для всех типов) ===
  @Prop() inn: string;
  @Prop() kpp: string;
  @Prop() ogrn: string;
  @Prop() legalAddress: string;
  @Prop() actualAddress: string;
  @Prop() phone: string;
  @Prop() email: string;
  @Prop() website: string;

  // === Специфичные для ООО ===
  @Prop() directorName: string;       // 'Иванов И.И.'
  @Prop({ default: null }) registrationDate: Date;

  // === Специфичные для ИП ===
  @Prop() ogrnip: string;
  @Prop() ipRegistrationDate: Date;

  // === Специфичные для ФЛ ===
  @Prop() passportSeries: string;
  @Prop() passportNumber: string;
  @Prop() passportIssuedBy: string;
  @Prop() passportIssuedDate: Date;

  // === Контрактные роли (multi-select, минимум 1) ===
  @Prop({ required: true, type: [String],
          enum: Object.values(PartyType),
          default: [PartyType.SUPPLIER],
          validate: { validator: (v) => Array.isArray(v) && v.length >= 1,
                      message: 'Организация должна иметь хотя бы одну partyType (BR-ORG-4)' } })
  partyTypes: PartyType[];

  // === Контакты и фото ===
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
          default: [] }) photoIds: ObjectId[];
  // НЕ ОБЯЗАТЕЛЬНО для Organization (в отличие от Product)
  @Prop({ type: [{ name: String, position: String, phone: String, email: String }],
          default: [] })
  contacts: Array<{
    name: string; position: string; phone: string; email: string;
  }>;

  @Prop({ default: null }) deletedAt: Date;
}
```

**Правила (BR-ORG-*):**

- `legalType: LegalType.OOO` → показываются поля ООО (`directorName`, `registrationDate`, `kpp`).
- `legalType: LegalType.IP` → показываются поля ИП (`ogrnip`, `ipRegistrationDate`).
- `legalType: LegalType.FL` → показываются поля ФЛ (`passportSeries`, …).
- `partyTypes` — массив (multi-select): может быть `[SUPPLIER]`, `[BUYER]`, `[SUPPLIER, SELLER, BUYER]`. **Можно менять со временем** (ИП Иванов стал ещё и покупателем).
- Фото — опционально (0+), но если есть, то multiple.
- **Нет операции COPY** (по требованию PO). Только CRUD.

## 2. Product (`_products` коллекция)

```typescript
// schemas/product.schema.ts
@Schema({ collection: 'products', timestamps: true })
class Product {
  @Prop({ required: true }) name: string;
  // 'Шуруп 3x20 мм'
  @Prop({ required: true }) sku: string;
  // SKU/артикул: 'SH-3-20' (произвольный формат)
  @Prop() description: string;
  @Prop() category: string;        // 'Крепёж', 'Электротовары'
  @Prop() unit: string;            // 'шт', 'м', 'кг'
  @Prop({ default: 0, min: 0 }) price: number;
  @Prop({ default: 0, min: 0 }) cost: number;  // себестоимость

  // === Фото (ОБЯЗАТЕЛЬНО ≥ 1) ===
  @Prop({ required: true, type: [{ type: mongoose.Schema.Types.ObjectId,
          ref: 'Photo' }],
          validate: { validator: (v) => Array.isArray(v) && v.length >= 1,
                      message: 'У товара должно быть минимум 1 фото (BR-PRD-X)' } })
  photoIds: ObjectId[];

  // === Дубликат-protection ===
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Product',
          default: null }) copiedFromProductId: ObjectId;
  // если этот товар — копия другого, ссылка на оригинал (для audit)

  @Prop({ default: null }) deletedAt: Date;
}

ProductSchema.index({ name: 1, sku: 1 }, { unique: true });
// ↑ Главный compound index для дубликат-protection.
// Отдельный { sku: 1 } не нужен — покрыт compound-индексом (избегает dead index).
// Отдельный { name: 1 } не нужен — покрыт compound-индексом.
ProductSchema.index({ category: 1 });
```

**Правила (BR-PRD-*):**

- `(name, sku)` — **unique compound index**. Попытка создать второй товар → 409 Conflict.
- `photoIds` — обязательно ≥ 1 (валидация на уровне схемы).
- **COPY-операция** требует уникального sku: либо пользователь меняет вручную, либо auto-suffix `-COPY-{base36}` (см. §2.1 ниже).

### 2.1 COPY flow (services/products/products.service.ts)

```typescript
async copy(originalId: ObjectId, modifications: Partial<Product>): Promise<Product> {
  const original = await this.productModel.findById(originalId).exec();
  if (!original) throw new NotFoundException();

  // Генерируем уникальный sku для копии (отличается от original)
  const newSku = modifications.sku
    ?? `${original.sku}-COPY-${Date.now().toString(36)}`;

  // Создаём НОВЫЙ документ, переиспользуем photoIds (НЕ дублируем файлы).
  return this.productModel.create({
    ...original.toObject(),
    _id: new mongoose.Types.ObjectId(),
    sku: newSku,                                  // ← переопределяем (уникальность)
    name: modifications.name ?? `${original.name} (копия)`,
    photoIds: original.photoIds,                  // ← reuse (shared refs)
    copiedFromProductId: original._id,            // ← audit trail
    createdAt: undefined, updatedAt: undefined,   // ← timestamps auto
  });
}
```

## 3. Связи (локальные для этой группы)

```
Product ──── photoIds[] ──────────► Photo (ORIGINAL+variants)
Organization ── photoIds[] ──────► Photo

Product ── copiedFromProductId ──► Product (origin)
```

## 4. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.0 | 2026-07-01 | Извлечено из `DOMAIN-MODEL.md` v1.0 (§4, §5) в отдельный файл. Content unchanged. |
