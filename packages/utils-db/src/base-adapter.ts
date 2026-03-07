import { AsyncLocalStorage } from 'node:async_hooks'

import type {
  TAtscriptAnnotatedType,
  TMetadataMap,
  TValidatorPlugin,
} from '@atscript/typescript/utils'

import type { FilterExpr } from '@uniqu/core'

import type { DbQuery, TDbIndex, TSearchIndexInfo, TDbRelation, TDbForeignKey, TExistingColumn, TColumnDiff, TSyncColumnResult } from './types'
import type { TDbInsertResult, TDbInsertManyResult, TDbUpdateResult, TDbDeleteResult } from './types'
import type { WithRelation } from '@uniqu/core'
import type { AtscriptDbReadable } from './db-readable'
import type { AtscriptDbTable } from './db-table'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'

// ── Transaction context ─────────────────────────────────────────────────────

interface TxContext { state: unknown }
const txStorage = new AsyncLocalStorage<TxContext>()

/**
 * Abstract base class for database adapters.
 *
 * Adapter instances are 1:1 with readable instances (tables or views).
 * When an {@link AtscriptDbReadable} is created with an adapter, it calls
 * {@link registerReadable} to establish a bidirectional relationship:
 *
 * ```
 * AtscriptDbReadable ──delegates ops──▶ BaseDbAdapter
 *                    ◀──reads metadata── (via this._table)
 * ```
 *
 * Adapter authors can access all computed metadata through `this._table`:
 * - `this._table.tableName` — resolved table/collection/view name
 * - `this._table.flatMap` — all fields as dot-notation paths
 * - `this._table.indexes` — computed index definitions
 * - `this._table.primaryKeys` — primary key field names
 * - `this._table.columnMap` — logical → physical column mappings
 * - `this._table.defaults` — default value configurations
 * - `this._table.ignoredFields` — fields excluded from DB
 * - `this._table.uniqueProps` — single-field unique index properties
 * - `this._table.isView` — whether this is a view (vs a table)
 */
export abstract class BaseDbAdapter {
  // ── Table/view back-reference ─────────────────────────────────────────────

  protected _table!: AtscriptDbReadable<any, any, any, any, any, any, any>

  /** Logger instance — set via {@link registerReadable} from the readable's logger. */
  protected logger: TGenericLogger = NoopLogger

  /** When true, adapter logs DB calls via `logger.debug`. Off by default. */
  protected _verbose = false

  /**
   * Called by {@link AtscriptDbReadable} constructor. Gives the adapter access
   * to the readable's computed metadata for internal use in query rendering,
   * index sync, etc.
   */
  registerReadable(readable: AtscriptDbReadable<any, any, any, any, any, any, any>, logger?: TGenericLogger): void {
    this._table = readable
    if (logger) { this.logger = logger }
  }

  /**
   * Enables or disables verbose (debug-level) logging for this adapter.
   * When disabled, no log strings are constructed — zero overhead.
   */
  setVerbose(enabled: boolean): void {
    this._verbose = enabled
  }

  /**
   * Logs a debug message if verbose mode is enabled.
   * Adapters call this to log DB operations with zero overhead when disabled.
   */
  protected _log(...args: unknown[]): void {
    if (!this._verbose) { return }
    this.logger.debug(...args)
  }

  // ── Transaction support ──────────────────────────────────────────────────

  /**
   * Runs `fn` inside a database transaction. Nested calls (from related tables
   * within the same async chain) reuse the existing transaction automatically.
   *
   * The generic layer handles nesting detection via `AsyncLocalStorage`.
   * Adapters override `_beginTransaction`, `_commitTransaction`, and
   * `_rollbackTransaction` to provide raw DB-specific transaction primitives.
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (txStorage.getStore()) { return fn() }

    const ctx: TxContext = { state: undefined }
    ctx.state = await this._beginTransaction()
    return txStorage.run(ctx, async () => {
      try {
        const result = await fn()
        await this._commitTransaction(ctx.state)
        return result
      } catch (error) {
        try { await this._rollbackTransaction(ctx.state) } catch { /* preserve original error */ }
        throw error
      }
    })
  }

  /**
   * Returns the opaque transaction state from the current async context.
   * Adapters use this to retrieve DB-specific state (e.g., MongoDB `ClientSession`).
   */
  protected _getTransactionState(): unknown {
    return txStorage.getStore()?.state
  }

  /**
   * Starts a raw transaction. Returns opaque state stored in the async context.
   * Override in adapters that support transactions.
   */
  protected async _beginTransaction(): Promise<unknown> { return undefined }

  /** Commits the raw transaction. Override in adapters that support transactions. */
  protected async _commitTransaction(_state: unknown): Promise<void> {}

  /** Rolls back the raw transaction. Override in adapters that support transactions. */
  protected async _rollbackTransaction(_state: unknown): Promise<void> {}

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
   * Whether this adapter handles nested objects natively.
   * When `true`, the generic layer skips flattening and
   * passes nested objects as-is to the adapter.
   * MongoDB returns `true`; relational adapters return `false` (default).
   */
  supportsNestedObjects(): boolean {
    return false
  }

  // ── Relation loading (overridable) ────────────────────────────────────────

  /**
   * Whether this adapter handles `$with` relation loading natively.
   * When `true`, the table layer delegates to {@link loadRelations}
   * instead of using the generic batch-loading strategy.
   *
   * Adapters can use this to implement SQL JOINs, MongoDB `$lookup`,
   * or other DB-native relation loading optimizations.
   *
   * Default: `false` — the table layer uses application-level batch loading.
   */
  supportsNativeRelations(): boolean {
    return false
  }

  /**
   * Loads relations onto result rows using adapter-native operations.
   * Only called when {@link supportsNativeRelations} returns `true`.
   *
   * The adapter receives the rows to enrich, the `$with` relation specs,
   * and the table's relation/FK metadata for resolution.
   *
   * @param rows - The result rows to enrich (mutable — add relation properties in place).
   * @param withRelations - The `$with` specs from the query.
   * @param relations - This table's relation metadata (from `@db.rel.to`/`@db.rel.from`).
   * @param foreignKeys - This table's FK metadata (from `@db.rel.FK`).
   */
  async loadRelations(
    rows: Array<Record<string, unknown>>,
    withRelations: WithRelation[],
    relations: ReadonlyMap<string, TDbRelation>,
    foreignKeys: ReadonlyMap<string, TDbForeignKey>
  ): Promise<void> {
    throw new Error('Native relation loading not supported by this adapter')
  }

  /**
   * Applies a patch payload using native database operations.
   * Only called when {@link supportsNativePatch} returns `true`.
   *
   * @param filter - Filter identifying the record to patch.
   * @param patch - The patch payload with array operations.
   * @returns Update result.
   */
  async nativePatch(filter: FilterExpr, patch: unknown): Promise<TDbUpdateResult> {
    throw new Error('Native patch not supported by this adapter')
  }

  /**
   * Builds a custom insert validator for this adapter.
   * When defined, {@link AtscriptDbTable} uses this instead of the default
   * insert validator (which makes all primary keys optional).
   *
   * Example: MongoDB only makes ObjectId primary keys optional (auto-generated),
   * but string/number IDs remain required.
   */
  buildInsertValidator?(table: AtscriptDbTable): any

  /**
   * Builds a custom patch validator for this adapter.
   * When defined, {@link AtscriptDbTable} uses this instead of the default
   * partial validator for the `'patch'` purpose.
   *
   * Example: MongoDB wraps top-level array fields with `$replace`/`$insert`/…
   * patch operators that the default validator doesn't understand.
   */
  buildPatchValidator?(table: AtscriptDbTable): any

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
   * Example: MongoDB adapter extracts `@db.mongo.search.vector`, `@db.mongo.search.text`.
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

  // ── Table name resolution ──────────────────────────────────────────────────

  /**
   * Resolves the full table name, optionally including the schema prefix.
   * Override for databases that don't support schemas (e.g., SQLite).
   *
   * @param includeSchema - Whether to prepend `schema.` prefix (default: true).
   */
  resolveTableName(includeSchema = true): string {
    const schema = this._table.schema
    const name = this._table.tableName
    return includeSchema && schema ? `${schema}.${name}` : name
  }

  // ── Index sync helper ──────────────────────────────────────────────────────

  /**
   * Template method for index synchronization.
   * Implements the diff algorithm (list → compare → create/drop).
   * Adapters provide the three DB-specific primitives.
   *
   * @example
   * ```typescript
   * async syncIndexes() {
   *   await this.syncIndexesWithDiff({
   *     listExisting: async () => this.driver.all('PRAGMA index_list(...)'),
   *     createIndex: async (index) => this.driver.exec('CREATE INDEX ...'),
   *     dropIndex: async (name) => this.driver.exec('DROP INDEX ...'),
   *     shouldSkipType: (type) => type === 'fulltext',
   *   })
   * }
   * ```
   */
  protected async syncIndexesWithDiff(opts: {
    listExisting(): Promise<Array<{ name: string }>>
    createIndex(index: TDbIndex): Promise<void>
    dropIndex(name: string): Promise<void>
    prefix?: string
    shouldSkipType?(type: TDbIndex['type']): boolean
  }): Promise<void> {
    const prefix = opts.prefix ?? 'atscript__'

    // List existing indexes, filter to managed ones
    const existing = await opts.listExisting()
    const existingNames = new Set(
      existing.filter(i => i.name.startsWith(prefix)).map(i => i.name)
    )

    const desiredNames = new Set<string>()

    // Create missing indexes
    for (const index of this._table.indexes.values()) {
      if (opts.shouldSkipType?.(index.type)) { continue }

      desiredNames.add(index.key)

      if (!existingNames.has(index.key)) {
        await opts.createIndex(index)
      }
    }

    // Drop stale indexes
    for (const name of existingNames) {
      if (!desiredNames.has(name)) {
        await opts.dropIndex(name)
      }
    }
  }

  // ── Search index metadata ─────────────────────────────────────────────────

  /**
   * Returns available search indexes for this adapter.
   * UI uses this to show index picker. Override in adapters that support search.
   */
  getSearchIndexes(): TSearchIndexInfo[] {
    return []
  }

  /**
   * Whether this adapter supports text search.
   * Default: `true` when {@link getSearchIndexes} returns any entries.
   */
  isSearchable(): boolean {
    return this.getSearchIndexes().length > 0
  }

  // ── Search ──────────────────────────────────────────────────────────────

  /**
   * Full-text search. Override in adapters that support search.
   *
   * @param text - Search text.
   * @param query - Filter, sort, limit, etc.
   * @param indexName - Optional search index to target.
   */
  async search(
    text: string,
    query: DbQuery,
    indexName?: string
  ): Promise<Array<Record<string, unknown>>> {
    throw new Error('Search not supported by this adapter')
  }

  /**
   * Full-text search with count (for paginated search results).
   *
   * @param text - Search text.
   * @param query - Filter, sort, limit, etc.
   * @param indexName - Optional search index to target.
   */
  async searchWithCount(
    text: string,
    query: DbQuery,
    indexName?: string
  ): Promise<{ data: Array<Record<string, unknown>>; count: number }> {
    throw new Error('Search not supported by this adapter')
  }

  // ── Optimized pagination ──────────────────────────────────────────────

  /**
   * Fetches records and total count in one call.
   * Default: two parallel calls. Adapters may override for single-query optimization.
   */
  async findManyWithCount(
    query: DbQuery
  ): Promise<{ data: Array<Record<string, unknown>>; count: number }> {
    const [data, count] = await Promise.all([this.findMany(query), this.count(query)])
    return { data, count }
  }

  // ── Abstract CRUD — adapters must implement ───────────────────────────────
  // The adapter reads this._table.tableName and any other metadata it needs
  // internally. No table name parameter needed.

  abstract insertOne(data: Record<string, unknown>): Promise<TDbInsertResult>
  abstract insertMany(data: Array<Record<string, unknown>>): Promise<TDbInsertManyResult>
  abstract replaceOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract updateOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract deleteOne(filter: FilterExpr): Promise<TDbDeleteResult>
  abstract findOne(
    query: DbQuery
  ): Promise<Record<string, unknown> | null>
  abstract findMany(
    query: DbQuery
  ): Promise<Array<Record<string, unknown>>>
  abstract count(query: DbQuery): Promise<number>

  // ── Batch operations ──────────────────────────────────────────────────────

  abstract updateMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract replaceMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult>
  abstract deleteMany(filter: FilterExpr): Promise<TDbDeleteResult>

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

  /**
   * Synchronizes foreign key constraints between Atscript definitions and the database.
   * Uses `this._table.foreignKeys` for the full FK definitions.
   * Optional — only relational adapters need to implement this.
   */
  async syncForeignKeys?(): Promise<void>

  /**
   * Returns existing columns from the database via introspection.
   * Used by schema sync for column diffing.
   * Optional — schema-less adapters (MongoDB) skip this.
   */
  getExistingColumns?(): Promise<TExistingColumn[]>

  /**
   * Applies column diff (ALTER TABLE ADD COLUMN, etc.).
   * The generic layer computes the diff; adapters execute DB-specific DDL.
   * Optional — only relational adapters implement this.
   */
  syncColumns?(diff: TColumnDiff): Promise<TSyncColumnResult>

  /**
   * Recreates the table losslessly: create temp → copy data → drop old → rename.
   * Used by `@db.sync.method "recreate"` when structural changes can't be ALTER'd.
   * Optional — only relational adapters implement this.
   */
  recreateTable?(): Promise<void>

  /**
   * Drops the table entirely.
   * Used by `@db.sync.method "drop"` for tables with ephemeral data.
   * Optional — only relational adapters implement this.
   */
  dropTable?(): Promise<void>

  /**
   * Drops one or more columns from the table.
   * Used by schema sync to remove stale columns no longer in the schema.
   * Optional — only relational adapters implement this.
   */
  dropColumns?(columns: string[]): Promise<void>

  /**
   * Drops a table by name (without needing a registered readable).
   * Used by schema sync to remove tables no longer in the schema.
   * Optional — only relational adapters implement this.
   */
  dropTableByName?(tableName: string): Promise<void>
}
