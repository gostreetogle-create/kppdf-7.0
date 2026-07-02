import { ImportJob } from '../schemas/import-job.schema';
import { ImportSourceType } from '../schemas/import-job.schema';

/**
 * Progress callback invoked by strategies after each batch of records.
 * Reports counts back to IngestionService which persists them in MongoDB.
 */
export interface ProgressCallback {
  (
    processed: number,
    success: number,
    failed: number,
    errors: Array<{ rowIndex: number; errorMessage: string; rawData?: Record<string, any> }>,
  ): Promise<void>;
}

/**
 * Strategy interface for importing data from different sources (Excel, JSON, API).
 *
 * Per ARCHITECTURE.md §2: adding a new source type = one new strategy + DI registration.
 */
export interface IImportStrategy {
  /** The source type this strategy handles */
  readonly sourceType: ImportSourceType;

  /**
   * Execute the import.
   *
   * @param job  - ImportJob document (contains sourceFile/sourceUrl/sourceOptions/entityType)
   * @param onProgress - Callback to report progress (persisted to MongoDB)
   * @param signal - AbortSignal for cancellation support
   */
  execute(
    job: ImportJob,
    onProgress: ProgressCallback,
    signal: AbortSignal,
  ): Promise<void>;
}
