import type {
  TAtscriptAnnotatedType,
  TMetadataMap,
  TValidatorPlugin,
} from '@atscript/typescript/utils'

import type { TDbFilter, TDbFindOptions } from './types'
import type { TDbInsertResult, TDbInsertManyResult, TDbUpdateResult, TDbDeleteResult } from './types'
import type { AtscriptDbTable } from './db-table'

/**
 * Abstract base class for database adapters.
 *
 * Adapter instances are 1:1 with table instances. When an {@link AtscriptDbTable}
 * is created with an adapter, it calls {@link registerTable} to establish a
 * bidirectional relationship:
 *
 * ```
 * AtscriptDbTable ──delegates CRUD──▶ BaseDbAdapter
 *                 ◀──reads metadata── (via this._table)
 * ```
 *
 * Adapter authors can access all computed metadata through `this._table`:
 * - `this._table.tableName` — resolved table/collection name
 * - `this._table.flatMap` — all fields as dot-notation paths
 * - `this._table.indexes` — computed index definitions
 * - `this._table.primaryKeys` — primary key field names
 * - `this._table.columnMap` — logical → physical column mappings
 * - `this._table.defaults` — default value configurations
 * - `this._table.ignoredFields` — fields excluded from DB
 * - `this._table.uniqueProps` — single-field unique index properties
 */
export abstract class BaseDbAdapter {
  // ── Table back-reference ──────────────────────────────────────────────────

  protected _table!: AtscriptDbTable

  /**
   * Called by {@link AtscriptDbTable} constructor. Gives the adapter access to
   * the table's computed metadata for internal use in query rendering, index
   * sync, etc.
   */
  registerTable(table: AtscriptDbTable): void {
    this._table = table
  }

  // ── Validation hooks (overridable) ────────────────────────────────────────

  /**
   * Returns additional validator plugins for this adapter.
   * These are merged with the built-in Atscript validators.
   *
   * Example: MongoDB adapter returns ObjectId validation plugin.
   */
  getValidatorPlugins(): TValidatorPlugin[] {
    return []
  }

  // ── ID preparation (overridable) ──────────────────────────────────────────

  /**
   * Transforms an ID value for the database.
   * Override to convert string → ObjectId, parse numeric IDs, etc.
   *
   * @param id - The raw ID value.
   * @param fieldType - The annotated type of the ID field.
   * @returns The transformed ID value.
   */
  prepareId(id: unknown, fieldType: TAtscriptAnnotatedType): unknown {
    return id
  }

  // ── Native patch support (overridable) ────────────────────────────────────

  /**
   * Whether this adapter supports native patch operations.
   * When `true`, {@link AtscriptDbTable} delegates patch payloads to
   * {@link nativePatch} instead of using the generic decomposition.
   */
  supportsNativePatch(): boolean {
    return false
  }

  /**
   * Applies a patch payload using native database operations.
   * Only called when {@link supportsNativePatch} returns `true`.
   *
   * @param filter - Filter identifying the record to patch.
   * @param patch - The patch payload with array operations.
   * @returns Update result.
   */
  async nativePatch(filter: TDbFilter, patch: unknown): Promise<TDbUpdateResult> {
    throw new Error('Native patch not supported by this adapter')
  }

  // ── Adapter-specific annotation processing (overridable) ──────────────────

  /**
   * Called before field flattening begins.
   * Use to extract table-level adapter-specific annotations.
   *
   * Example: MongoDB adapter extracts `@db.mongo.search.dynamic`.
   */
  onBeforeFlatten?(type: TAtscriptAnnotatedType): void

  /**
   * Called for each field during flattening.
   * Use to extract field-level adapter-specific annotations.
   *
   * Example: MongoDB adapter extracts `@db.mongo.index.text`, `@db.mongo.search.vector`.
   */
  onFieldScanned?(
    field: string,
    type: TAtscriptAnnotatedType,
    metadata: TMetadataMap<AtscriptMetadata>
  ): void

  /**
   * Called after all fields are scanned.
   * Use to finalize adapter-specific computed state.
   * Access table metadata via `this._table`.
   */
  onAfterFlatten?(): void

  /**
   * Returns an adapter-specific table name.
   * For example, MongoDB reads from `@db.mongo.collection`.
   * Return `undefined` to fall back to `@db.table` or the interface name.
   */
  getAdapterTableName?(type: TAtscriptAnnotatedType): string | undefined

  /**
   * Returns the metadata tag used to mark top-level arrays during flattening.
   * Default: `'db.__topLevelArray'`
   *
   * Override to use adapter-specific tags (e.g., `'db.mongo.__topLevelArray'`).
   */
  getTopLevelArrayTag?(): string

  // ── Abstract CRUD — adapters must implement ───────────────────────────────
  // The adapter reads this._table.tableName and any other metadata it needs
  // internally. No table name parameter needed.

  abstract insertOne(data: Record<string, unknown>): Promise<TDbInsertResult>
  abstract insertMany(data: Record<string, unknown>[]): Promise<TDbInsertManyResult>
  abstract replaceOne(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract updateOne(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract deleteOne(filter: TDbFilter): Promise<TDbDeleteResult>
  abstract findOne(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Record<string, unknown> | null>
  abstract findMany(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Record<string, unknown>[]>
  abstract count(filter: TDbFilter): Promise<number>

  // ── Batch operations ──────────────────────────────────────────────────────

  abstract updateMany(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract replaceMany(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract deleteMany(filter: TDbFilter): Promise<TDbDeleteResult>

  // ── Schema ────────────────────────────────────────────────────────────────

  /**
   * Synchronizes indexes between the Atscript definitions and the database.
   * Uses `this._table.indexes` for the full index definitions.
   */
  abstract syncIndexes(): Promise<void>

  /**
   * Ensures the table exists in the database, creating it if needed.
   * Uses `this._table.tableName`, `this._table.schema`, etc.
   */
  abstract ensureTable(): Promise<void>
}
