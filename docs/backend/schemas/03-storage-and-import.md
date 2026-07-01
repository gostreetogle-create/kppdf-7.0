# `schemas/03-storage-and-import.md` — Photo + ImportJob схемы

> **Назначение.** Mongoose-схемы для подсистем хранения медиа (Photo cluster из 3 вариантов на upload) и фоновой обработки импорта (ImportJob state-machine).
>
> **Источник:** §6, §7 оригинального `DOMAIN-MODEL.md` v1.0 (содержимое **перенесено без изменений**, включая ASCII-диаграмму).
>
> **Объём:** ≤ 250 строк target / 400 hard limit.

## 1. Photo (`_photos` коллекция)

### 1.1 ASCII-диаграмма Photo cluster

При **одной** загрузке пользователем создаётся **кластер из 3 Photo-документов** (ORIGINAL + MEDIUM + THUMBNAIL), связанных через `linkedPhotoId`:

```
Photo Cluster (1 user upload = 3 records in `_photos`):

  [Photo ORIGINAL]                 [Photo MEDIUM]                [Photo THUMBNAIL]
  ────────────────                 ────────────────              ────────────────
   _id: 0xAAA1 (self)              _id: 0xAAA2                   _id: 0xAAA3
   variant: ORIGINAL               variant: MEDIUM               variant: THUMBNAIL
   linkedPhotoId: 0xAAA1 (self)    linkedPhotoId: 0xAAA1 (←OR)  linkedPhotoId: 0xAAA1 (←OR)
   parentPhotoId: null             parentPhotoId: 0xAAA1 (←OR)   parentPhotoId: 0xAAA1 (←OR)
   sizeBytes: 4 200 000            sizeBytes: 180 000            sizeBytes: 12 000
   widthPx: 2560                   widthPx: 1024                 widthPx: 256
   storageUrl: .../original.jpg    storageUrl: .../medium.jpg    storageUrl: .../thumb.jpg

Product.photoIds[]  или  Organization.photoIds[]  → ссылается на ID ORIGINAL-вариантов
                                                  (UI показывает по thumbnail-варианту из linkedPhotoId)
```

### 1.2 Разница между `linkedPhotoId` и `parentPhotoId`

| Поле | Смысл | Когда null |
|---|---|---|
| `parentPhotoId` | **Прямой родитель** в дереве одного кластера. У ORIGINAL = null. У MEDIUM/THUMBNAIL = id ORIGINAL. | Только у ORIGINAL. |
| `linkedPhotoId` | **Group identifier** всего кластера (одинаков у всех 3-х = id ORIGINAL). Для запроса «дай все варианты». | Никогда (даже у ORIGINAL=self). |

> 📌 **Зачем оба:** `parentPhotoId` — для traversal "precise parent" (если когда-то будем хранить >3 вариантов и нужна ветвящаяся иерархия). `linkedPhotoId` — для быстрого запроса **group by cluster**.

### 1.3 Schema

```typescript
// schemas/photo.schema.ts
enum PhotoVariant { ORIGINAL = 'ORIGINAL', THUMBNAIL = 'THUMBNAIL',
                    MEDIUM = 'MEDIUM', LARGE = 'LARGE' }

@Schema({ collection: 'photos', timestamps: true })
class Photo {
  @Prop({ required: true }) storageUrl: string;
  // '/uploads/products/2026/07/abc123.jpg' (или S3 URL в будущем)
  @Prop({ required: true }) originalFilename: string;
  // 'photo-from-phone.jpg'

  @Prop({ required: true, enum: Object.values(PhotoVariant) })
  variant: PhotoVariant;

  @Prop({ required: true }) mimeType: string;
  // 'image/jpeg'
  @Prop({ required: true }) sizeBytes: number;
  @Prop() widthPx: number;
  @Prop() heightPx: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Photo', default: null })
  parentPhotoId: ObjectId;
  // null только у ORIGINAL; у MEDIUM/THUMBNAIL = id ORIGINAL из того же кластера
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'Photo' })
  linkedPhotoId: ObjectId;
  // group identifier = id ORIGINAL из того же кластера (включая сам ORIGINAL — указывает на себя)
}

PhotoSchema.index({ parentPhotoId: 1 });
PhotoSchema.index({ linkedPhotoId: 1 });
```

**Правила (BR-PHO-*):**

- При upload создаётся кластер: ORIGINAL (2560×1920 px) + MEDIUM (1024×768) + THUMBNAIL (256×192), все с shared `linkedPhotoId` (= id самого ORIGINAL).
- **Product.photoIds[] / Organization.photoIds[]** ссылаются на ID **ORIGINAL-варианта**, а UI автоматически подтягивает THUMBNAIL через `linkedPhotoId`.
- Удаление ORIGINAL-варианта → каскадно удаляет все MEDIUM/THUMBNAIL с тем же `linkedPhotoId` (через `pre('findOneAndDelete')` hook или service-level cascade).

## 2. ImportJob (`_importJobs` коллекция)

```typescript
// schemas/import-job.schema.ts
enum ImportSourceType { EXCEL = 'EXCEL', JSON = 'JSON', API = 'API' }
enum ImportStatus { PENDING = 'PENDING', PROCESSING = 'PROCESSING',
                    COMPLETED = 'COMPLETED', FAILED = 'FAILED',
                    CANCELLED = 'CANCELLED' }
enum ImportEntityType { PRODUCTS = 'PRODUCTS', ORGANIZATIONS = 'ORGANIZATIONS',
                        USERS = 'USERS' }

@Schema({ collection: 'importJobs', timestamps: true })
class ImportJob {
  @Prop({ required: true, enum: Object.values(ImportSourceType) })
  sourceType: ImportSourceType;
  @Prop({ required: true, enum: Object.values(ImportEntityType) })
  entityType: ImportEntityType;

  // Входные параметры
  @Prop() sourceFile: string;       // путь к загруженному файлу
  @Prop() sourceUrl: string;        // для API sourceType
  @Prop({ type: Object }) sourceOptions: Record<string, any>;

  // Прогресс
  @Prop({ required: true, enum: Object.values(ImportStatus), default: ImportStatus.PENDING })
  status: ImportStatus;
  @Prop({ default: 0, min: 0, max: 100 }) progressPercent: number;
  @Prop({ default: 0 }) totalRecords: number;
  @Prop({ default: 0 }) processedRecords: number;
  @Prop({ default: 0 }) successRecords: number;
  @Prop({ default: 0 }) failedRecords: number;

  // Ошибки (capped 1000 entries per BR-IMP-3)
  @Prop({ type: [{ rowIndex: Number, errorMessage: String, rawData: Object }],
          default: [],
          validate: { validator: (v) => Array.isArray(v) && v.length <= 1000,
                      message: 'errorLog capped at 1000 entries (BR-IMP-3)' } })
  errorLog: Array<{
    rowIndex: number;
    errorMessage: string;
    rawData?: Record<string, any>;
  }>;

  // Audit
  @Prop({ required: true, type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  createdByUserId: ObjectId;
  @Prop() startedAt: Date;
  @Prop() completedAt: Date;
}

ImportJobSchema.index({ status: 1, createdAt: -1 });
ImportJobSchema.index({ createdByUserId: 1, createdAt: -1 });
```

**Правила (BR-IMP-*):**

- Frontend polling'ит `GET /api/imports/:id` каждые 2 сек для progress.
- При `FAILED` — `errorLog` нетривиальный (список строк с rawData + errorMessage), чтобы можно было скачать и исправить.
- При повторном клике "Import again" с тем же файлом → создаётся НОВЫЙ ImportJob (не перезапуск старого).
- **Worker handler** должен перехватывать validation error от `errorLog` cap (`length > 1000`), делать `errorLog.slice(0, 1000)` + ставить `status = FAILED` без throw.

## 3. Связи (локальные для этой группы)

```
User ───── createdByUserId ───► ImportJob
                                  │
                                  ▼   (BullMQ Worker)
                            bulkWrite(upsert)
                                  ▼
                       Product / Organization

Product ───── photoIds[] ────────► Photo (ORIGINAL+variants cluster)
Organization ── photoIds[] ──────► Photo
```

## 4. Версия

| Версия | Дата | Что |
|---|---|---|
| 1.0 | 2026-07-01 | Извлечено из `DOMAIN-MODEL.md` v1.0 (§6, §7) в отдельный файл. ASCII-диаграмма Photo cluster сохранена. Content unchanged. |
