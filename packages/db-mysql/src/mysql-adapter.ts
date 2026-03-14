import type { TAtscriptAnnotatedType, TMetadataMap } from '@atscript/typescript/utils'
import { BaseDbAdapter, AtscriptDbView, DbError } from '@atscript/db'
import type {
  TDbDeleteResult,
  TDbIndex,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbUpdateResult,
  TExistingColumn,
  TExistingTableOption,
  TColumnDiff,
  TTableOptionDiff,
  TSyncColumnResult,
  TDbFieldMeta,
  TDbDefaultFn,
  TValueFormatterPair,
} from '@atscript/db'
import type { DbQuery, FilterExpr } from '@atscript/db'

import { buildWhere } from './filter-builder'
import {
  buildCreateTable,
  buildCreateView,
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
  defaultValueForType,
  defaultValueToSqlLiteral,
  mysqlTypeFromField,
  qi,
  quoteTableName,
  collationToMysql,
  refActionToSql,
} from './sql-builder'
import type { TMysqlConnection, TMysqlDriver } from './types'

/** Parses a MySQL UTC datetime string ('YYYY-MM-DD HH:MM:SS') to epoch ms. Returns the original value if parsing fails. */
export function utcDatetimeToEpochMs(value: unknown): unknown {
  if (typeof value === 'number') { return value }
  if (value instanceof Date) { return value.getTime() }
  if (typeof value === 'string') {
    const ms = Date.UTC(
      +value.slice(0, 4),
      +value.slice(5, 7) - 1,
      +value.slice(8, 10),
      +value.slice(11, 13),
      +value.slice(14, 16),
      +value.slice(17, 19),
    )
    return Number.isNaN(ms) ? value : ms
  }
  return value
}

/** Formats epoch ms as 'YYYY-MM-DD HH:MM:SS' in UTC for MySQL TIMESTAMP columns. */
function epochMsToUtcDatetime(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`
}

/**
 * MySQL adapter for {@link AtscriptDbTable}.
 *
 * Accepts any {@link TMysqlDriver} implementation — the actual MySQL driver
 * is fully swappable (mysql2/promise pool, custom implementations, etc.).
 *
 * Usage:
 * ```typescript
 * import { Mysql2Driver, MysqlAdapter } from '@atscript/db-mysql'
 * import { DbSpace } from '@atscript/db'
 *
 * const driver = new Mysql2Driver('mysql://root@localhost:3306/mydb')
 * const space = new DbSpace(() => new MysqlAdapter(driver))
 * const users = space.getTable(UsersType)
 * ```
 */
export class MysqlAdapter extends BaseDbAdapter {
  override supportsColumnModify = true

  // 'uuid' is intentionally excluded: MySQL's DEFAULT (UUID()) generates the value
  // server-side, but the insertId in the result header is always 0 for non-AUTO_INCREMENT
  // columns, making it impossible to retrieve the generated UUID without a separate SELECT.
  // Client-side generation via crypto.randomUUID() avoids this round-trip.
  private static readonly NATIVE_DEFAULT_FNS: ReadonlySet<TDbDefaultFn> = new Set(['now', 'increment'])

  // ── MySQL-specific state from annotations ────────────────────────────────
  private _engine = 'InnoDB'
  private _charset = 'utf8mb4'
  private _collation = 'utf8mb4_unicode_ci'
  private _autoIncrementStart?: number
  private _incrementFields = new Set<string>()
  private _onUpdateFields = new Map<string, string>()

  /** Schema name for INFORMATION_SCHEMA queries (null falls through to DATABASE()). */
  private get _schema(): string | null { return this._table.schema ?? null }

  constructor(protected readonly driver: TMysqlDriver) {
    super()
  }

  // ── Transaction primitives ──────────────────────────────────────────────

  protected override async _beginTransaction(): Promise<TMysqlConnection> {
    const conn = await this.driver.getConnection()
    await conn.exec('START TRANSACTION')
    this._log('START TRANSACTION')
    return conn
  }

  protected override async _commitTransaction(state: unknown): Promise<void> {
    const conn = state as TMysqlConnection
    try {
      this._log('COMMIT')
      await conn.exec('COMMIT')
    } finally {
      conn.release()
    }
  }

  protected override async _rollbackTransaction(state: unknown): Promise<void> {
    const conn = state as TMysqlConnection
    try {
      this._log('ROLLBACK')
      await conn.exec('ROLLBACK')
    } finally {
      conn.release()
    }
  }

  /**
   * Returns the active executor: dedicated connection if inside a transaction,
   * otherwise the pool-based driver.
   */
  private _exec(): Pick<TMysqlDriver, 'run' | 'all' | 'get' | 'exec'> {
    const txState = this._getTransactionState() as TMysqlConnection | undefined
    return txState ?? this.driver
  }

  // ── Capability flags ──────────────────────────────────────────────────────

  /** MySQL InnoDB enforces FK constraints natively. */
  override supportsNativeForeignKeys(): boolean {
    return true
  }

  // ── ID preparation ────────────────────────────────────────────────────────

  override prepareId(id: unknown, _fieldType: TAtscriptAnnotatedType): unknown {
    return id
  }

  override supportsNativeValueDefaults(): boolean { return true }

  override nativeDefaultFns(): ReadonlySet<TDbDefaultFn> {
    return MysqlAdapter.NATIVE_DEFAULT_FNS
  }

  // ── Annotation hooks ──────────────────────────────────────────────────────

  override onBeforeFlatten(type: TAtscriptAnnotatedType): void {
    const meta = type.metadata
    const engine = meta.get('db.mysql.engine') as string | undefined
    if (engine) { this._engine = engine }
    const charset = meta.get('db.mysql.charset') as string | undefined
    if (charset) { this._charset = charset }
    const collate = meta.get('db.mysql.collate') as string | undefined
    if (collate) { this._collation = collate }
  }

  override onFieldScanned(
    field: string,
    _type: TAtscriptAnnotatedType,
    metadata: TMetadataMap<AtscriptMetadata>
  ): void {
    // Track @db.default.increment fields + optional start value
    if (metadata.has('db.default.increment')) {
      this._incrementFields.add(field)
      const startVal = metadata.get('db.default.increment')
      if (typeof startVal === 'number') {
        this._autoIncrementStart = startVal
      }
    }
    // Track @db.mysql.onUpdate fields
    const onUpdate = metadata.get('db.mysql.onUpdate') as string | undefined
    if (onUpdate) {
      this._onUpdateFields.set(field, onUpdate)
    }
  }

  // ── Table options ────────────────────────────────────────────────────────

  override getDesiredTableOptions(): TExistingTableOption[] {
    return [
      { key: 'engine', value: this._engine },
      { key: 'charset', value: this._charset },
      { key: 'collation', value: this._collation },
    ]
  }

  override async getExistingTableOptions(): Promise<TExistingTableOption[]> {
    const row = await this._exec().get<{
      ENGINE: string
      TABLE_COLLATION: string
    }>(
      `SELECT ENGINE, TABLE_COLLATION
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = ? AND TABLE_SCHEMA = COALESCE(?, DATABASE())`,
      [this._table.tableName, this._schema]
    )
    if (!row) { return [] }

    // Extract charset from collation (e.g., utf8mb4_unicode_ci → utf8mb4)
    const charset = row.TABLE_COLLATION?.split('_')[0] ?? 'utf8mb4'

    return [
      { key: 'engine', value: row.ENGINE ?? 'InnoDB' },
      { key: 'charset', value: charset },
      { key: 'collation', value: row.TABLE_COLLATION ?? 'utf8mb4_unicode_ci' },
    ]
  }

  override async applyTableOptions(changes: TTableOptionDiff['changed']): Promise<void> {
    const tableName = this.resolveTableName()
    const clauses: string[] = []

    for (const change of changes) {
      switch (change.key) {
        case 'engine': {
          clauses.push(`ENGINE = ${change.newValue}`)
          break
        }
        case 'charset': {
          clauses.push(`CHARACTER SET = ${change.newValue}`)
          break
        }
        case 'collation': {
          clauses.push(`COLLATE = ${change.newValue}`)
          break
        }
      }
    }

    if (clauses.length > 0) {
      const ddl = `ALTER TABLE ${quoteTableName(tableName)} ${clauses.join(', ')}`
      this._log(ddl)
      await this._exec().exec(ddl)
    }
  }

  /**
   * Returns a value formatter for TIMESTAMP-mapped fields.
   * Number fields with @db.default.now map to MySQL TIMESTAMP — the formatter
   * converts epoch ms to a UTC datetime string for the wire protocol.
   */
  override formatValue(field: TDbFieldMeta): TValueFormatterPair | ((value: unknown) => unknown) | undefined {
    if (field.designType === 'number' && field.defaultValue?.kind === 'fn' && field.defaultValue.fn === 'now') {
      return {
        toStorage: (value: unknown) => typeof value === 'number' ? epochMsToUtcDatetime(value) : value,
        fromStorage: utcDatetimeToEpochMs,
      }
    }
    return undefined
  }

  // ── Error mapping ─────────────────────────────────────────────────────────

  /**
   * Wraps an async write operation to catch MySQL constraint errors
   * and rethrow as structured `DbError`.
   *
   * MySQL uses numeric error codes:
   * - 1062 = ER_DUP_ENTRY (unique constraint violation)
   * - 1451 = ER_ROW_IS_REFERENCED_2 (FK violation on delete)
   * - 1452 = ER_NO_REFERENCED_ROW_2 (FK violation on insert/update)
   */
  private async _wrapConstraintError<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errno' in error) {
        const err = error as { errno: number; message: string; sqlMessage?: string }

        // Duplicate key (unique constraint)
        if (err.errno === 1062) {
          const match = err.message?.match(/for key '(?:\w+\.)?(\w+)'/)
          const field = match?.[1] ?? ''
          throw new DbError('CONFLICT', [{ path: field, message: err.sqlMessage ?? err.message }])
        }

        // FK violation
        if (err.errno === 1451 || err.errno === 1452) {
          const errors = this._mapFkError(err.message)
          throw new DbError('FK_VIOLATION', errors)
        }
      }
      throw error
    }
  }

  private _mapFkError(message: string): Array<{ path: string; message: string }> {
    const fkMatch = message.match(/FOREIGN KEY \(`(\w+)`\)/)
    if (fkMatch) {
      const physicalCol = fkMatch[1]
      const field = this._table.fieldDescriptors.find(f => f.physicalName === physicalCol)
      return [{ path: field?.path ?? physicalCol, message }]
    }
    return [{ path: '', message }]
  }

  // ── CRUD: Insert ──────────────────────────────────────────────────────────

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    const { sql, params } = buildInsert(this.resolveTableName(), data)
    this._log(sql, params)
    const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
    return { insertedId: this._resolveInsertedId(data, result.insertId) }
  }

  async insertMany(
    data: Array<Record<string, unknown>>
  ): Promise<TDbInsertManyResult> {
    return this.withTransaction(async () => {
      const ids: unknown[] = []
      for (const row of data) {
        const { sql, params } = buildInsert(this.resolveTableName(), row)
        this._log(sql, params)
        const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
        ids.push(this._resolveInsertedId(row, result.insertId))
      }
      return { insertedCount: ids.length, insertedIds: ids }
    })
  }

  // ── CRUD: Read ────────────────────────────────────────────────────────────

  async findOne(
    query: DbQuery
  ): Promise<Record<string, unknown> | null> {
    const where = buildWhere(query.filter)
    const controls = { ...query.controls, $limit: 1 }
    const { sql, params } = buildSelect(this.resolveTableName(), where, controls)
    this._log(sql, params)
    return this._exec().get(sql, params)
  }

  async findMany(
    query: DbQuery
  ): Promise<Array<Record<string, unknown>>> {
    const where = buildWhere(query.filter)
    const { sql, params } = buildSelect(this.resolveTableName(), where, query.controls)
    this._log(sql, params)
    return this._exec().all(sql, params)
  }

  async count(query: DbQuery): Promise<number> {
    const where = buildWhere(query.filter)
    const tableName = this.resolveTableName()
    const sql = `SELECT COUNT(*) as cnt FROM ${quoteTableName(tableName)} WHERE ${where.sql}`
    this._log(sql, where.params)
    const row = await this._exec().get<{ cnt: number }>(sql, where.params)
    return row?.cnt ?? 0
  }

  // ── CRUD: Update ──────────────────────────────────────────────────────────

  async updateOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // MySQL supports native UPDATE ... LIMIT 1
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where, 1)
    this._log(sql, params)
    const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
    return { matchedCount: result.affectedRows, modifiedCount: result.changedRows }
  }

  async updateMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where)
    this._log(sql, params)
    const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
    return { matchedCount: result.affectedRows, modifiedCount: result.changedRows }
  }

  // ── CRUD: Replace ─────────────────────────────────────────────────────────

  async replaceOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // Use UPDATE (set all columns) instead of DELETE+INSERT to avoid triggering CASCADE deletes
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where, 1)
    this._log(sql, params)
    const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
    return { matchedCount: result.affectedRows, modifiedCount: result.changedRows }
  }

  async replaceMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where)
    this._log(sql, params)
    const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
    return { matchedCount: result.affectedRows, modifiedCount: result.changedRows }
  }

  // ── CRUD: Delete ──────────────────────────────────────────────────────────

  async deleteOne(filter: FilterExpr): Promise<TDbDeleteResult> {
    // MySQL supports native DELETE ... LIMIT 1
    const where = buildWhere(filter)
    const { sql, params } = buildDelete(this.resolveTableName(), where, 1)
    this._log(sql, params)
    const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
    return { deletedCount: result.affectedRows }
  }

  async deleteMany(filter: FilterExpr): Promise<TDbDeleteResult> {
    const where = buildWhere(filter)
    const { sql, params } = buildDelete(this.resolveTableName(), where)
    this._log(sql, params)
    const result = await this._wrapConstraintError(() => this._exec().run(sql, params))
    return { deletedCount: result.affectedRows }
  }

  // ── Schema ────────────────────────────────────────────────────────────────

  async ensureTable(): Promise<void> {
    if (this._table instanceof AtscriptDbView) {
      return this._ensureView()
    }
    const sql = buildCreateTable(
      this.resolveTableName(),
      this._table.fieldDescriptors,
      this._table.foreignKeys,
      {
        engine: this._engine,
        charset: this._charset,
        collation: this._collation,
        autoIncrementStart: this._autoIncrementStart,
        incrementFields: this._incrementFields,
        onUpdateFields: this._onUpdateFields,
      }
    )
    this._log(sql)
    await this._exec().exec(sql)
  }

  private async _ensureView(): Promise<void> {
    const view = this._table as AtscriptDbView
    const sql = buildCreateView(
      this.resolveTableName(),
      view.viewPlan,
      view.getViewColumnMappings(),
      ref => view.resolveFieldRef(ref, qi),
    )
    this._log(sql)
    await this._exec().exec(sql)
  }

  async getExistingColumns(): Promise<TExistingColumn[]> {
    return this.getExistingColumnsForTable(this._table.tableName)
  }

  async getExistingColumnsForTable(tableName: string): Promise<TExistingColumn[]> {
    const schema = this._schema
    const rows = await this._exec().all<{
      COLUMN_NAME: string
      COLUMN_TYPE: string
      IS_NULLABLE: string
      COLUMN_KEY: string
      COLUMN_DEFAULT: string | null
    }>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = ? AND TABLE_SCHEMA = COALESCE(?, DATABASE())
       ORDER BY ORDINAL_POSITION`,
      [tableName, schema]
    )
    return rows.map(r => ({
      name: r.COLUMN_NAME,
      type: r.COLUMN_TYPE.toUpperCase(),
      notnull: r.IS_NULLABLE === 'NO',
      pk: r.COLUMN_KEY === 'PRI',
      dflt_value: normalizeMysqlDefault(r.COLUMN_DEFAULT),
    }))
  }

  async syncColumns(diff: TColumnDiff): Promise<TSyncColumnResult> {
    const tableName = this.resolveTableName()
    const added: string[] = []
    const renamed: string[] = []

    // Renames first
    for (const { field, oldName } of diff.renamed ?? []) {
      const ddl = `ALTER TABLE ${quoteTableName(tableName)} RENAME COLUMN ${qi(oldName)} TO ${qi(field.physicalName)}`
      this._log(ddl)
      await this._exec().exec(ddl)
      renamed.push(field.physicalName)
    }

    // Adds
    for (const field of diff.added) {
      const sqlType = this.typeMapper(field)
      let ddl = `ALTER TABLE ${quoteTableName(tableName)} ADD COLUMN ${qi(field.physicalName)} ${sqlType}`
      if (!field.optional && !field.isPrimaryKey) {
        ddl += ' NOT NULL'
      }
      if (field.defaultValue?.kind === 'value') {
        ddl += ` DEFAULT ${defaultValueToSqlLiteral(field.designType, field.defaultValue.value)}`
      } else if (!field.optional && !field.isPrimaryKey) {
        ddl += ` DEFAULT ${defaultValueForType(field.designType)}`
      }
      if (field.collate) {
        const nativeCollate = field.type?.metadata?.get('db.mysql.collate') as string | undefined
        ddl += ` COLLATE ${nativeCollate ?? collationToMysql(field.collate)}`
      }
      this._log(ddl)
      await this._exec().exec(ddl)
      added.push(field.physicalName)
    }

    // Type changes — MySQL supports ALTER TABLE MODIFY COLUMN natively
    for (const { field } of diff.typeChanged ?? []) {
      const sqlType = this.typeMapper(field)
      let ddl = `ALTER TABLE ${quoteTableName(tableName)} MODIFY COLUMN ${qi(field.physicalName)} ${sqlType}`
      if (!field.optional && !field.isPrimaryKey) { ddl += ' NOT NULL' }
      this._log(ddl)
      await this._exec().exec(ddl)
    }

    // Nullable changes
    for (const { field } of diff.nullableChanged ?? []) {
      const sqlType = this.typeMapper(field)
      const nullability = field.optional ? 'NULL' : 'NOT NULL'
      const ddl = `ALTER TABLE ${quoteTableName(tableName)} MODIFY COLUMN ${qi(field.physicalName)} ${sqlType} ${nullability}`
      this._log(ddl)
      await this._exec().exec(ddl)
    }

    // Default value changes
    for (const { field } of diff.defaultChanged ?? []) {
      const sqlType = this.typeMapper(field)
      let ddl = `ALTER TABLE ${quoteTableName(tableName)} MODIFY COLUMN ${qi(field.physicalName)} ${sqlType}`
      if (!field.optional && !field.isPrimaryKey) { ddl += ' NOT NULL' }
      if (field.defaultValue?.kind === 'value') {
        ddl += ` DEFAULT ${defaultValueToSqlLiteral(field.designType, field.defaultValue.value)}`
      } else if (field.defaultValue?.kind === 'fn') {
        ddl += ` DEFAULT ${field.defaultValue.fn === 'now' ? 'CURRENT_TIMESTAMP' : field.defaultValue.fn === 'uuid' ? '(UUID())' : `(${field.defaultValue.fn}())`}`
      } else {
        ddl += ' DEFAULT NULL'
      }
      this._log(ddl)
      await this._exec().exec(ddl)
    }

    return { added, renamed }
  }

  async recreateTable(): Promise<void> {
    const tableName = this.resolveTableName()
    const tempName = `${this._table.tableName}__tmp_${Date.now()}`

    // Disable FK checks during recreation
    await this._exec().exec('SET FOREIGN_KEY_CHECKS = 0')
    try {
      // 1. Create new table with temp name
      const createSql = buildCreateTable(
        tempName,
        this._table.fieldDescriptors,
        this._table.foreignKeys,
        {
          engine: this._engine,
          charset: this._charset,
          collation: this._collation,
          autoIncrementStart: this._autoIncrementStart,
          incrementFields: this._incrementFields,
          onUpdateFields: this._onUpdateFields,
        }
      )
      this._log(createSql)
      await this._exec().exec(createSql)

      // 2. Get columns that exist in both old and new
      const oldCols = (await this.getExistingColumns()).map(c => c.name)
      const newCols = this._table.fieldDescriptors.filter(f => !f.ignored).map(f => f.physicalName)
      const oldColSet = new Set(oldCols)
      const commonCols = newCols.filter(c => oldColSet.has(c))

      if (commonCols.length > 0) {
        // 3. Copy data
        const fieldsByName = new Map(this._table.fieldDescriptors.map(f => [f.physicalName, f]))
        const colNames = commonCols.map(c => qi(c)).join(', ')
        const selectExprs = commonCols.map(c => {
          const field = fieldsByName.get(c)
          if (field && !field.optional && !field.isPrimaryKey) {
            const fallback = field.defaultValue?.kind === 'value'
              ? defaultValueToSqlLiteral(field.designType, field.defaultValue.value)
              : defaultValueForType(field.designType)
            return `COALESCE(${qi(c)}, ${fallback}) AS ${qi(c)}`
          }
          return qi(c)
        }).join(', ')
        const copySql = `INSERT INTO ${qi(tempName)} (${colNames}) SELECT ${selectExprs} FROM ${quoteTableName(tableName)}`
        this._log(copySql)
        await this._exec().exec(copySql)
      }

      // 4. Drop old, rename new
      await this._exec().exec(`DROP TABLE IF EXISTS ${quoteTableName(tableName)}`)
      await this._exec().exec(`RENAME TABLE ${qi(tempName)} TO ${quoteTableName(tableName)}`)
    } finally {
      await this._exec().exec('SET FOREIGN_KEY_CHECKS = 1')
    }
  }

  async dropTable(): Promise<void> {
    const ddl = `DROP TABLE IF EXISTS ${quoteTableName(this.resolveTableName())}`
    this._log(ddl)
    const conn = await this.driver.getConnection()
    await conn.exec('SET FOREIGN_KEY_CHECKS = 0')
    try { await conn.exec(ddl) } finally {
      await conn.exec('SET FOREIGN_KEY_CHECKS = 1')
      conn.release()
    }
  }

  async dropColumns(columns: string[]): Promise<void> {
    const tableName = this.resolveTableName()
    // MySQL supports multi-column drop in a single ALTER TABLE
    const drops = columns.map(col => `DROP COLUMN ${qi(col)}`).join(', ')
    const ddl = `ALTER TABLE ${quoteTableName(tableName)} ${drops}`
    this._log(ddl)
    await this._exec().exec(ddl)
  }

  async dropTableByName(tableName: string): Promise<void> {
    const ddl = `DROP TABLE IF EXISTS ${quoteTableName(tableName)}`
    this._log(ddl)
    const conn = await this.driver.getConnection()
    await conn.exec('SET FOREIGN_KEY_CHECKS = 0')
    try { await conn.exec(ddl) } finally {
      await conn.exec('SET FOREIGN_KEY_CHECKS = 1')
      conn.release()
    }
  }

  async dropViewByName(viewName: string): Promise<void> {
    const ddl = `DROP VIEW IF EXISTS ${quoteTableName(viewName)}`
    this._log(ddl)
    await this._exec().exec(ddl)
  }

  async renameTable(oldName: string): Promise<void> {
    const newName = this.resolveTableName()
    const ddl = `RENAME TABLE ${quoteTableName(oldName)} TO ${quoteTableName(newName)}`
    this._log(ddl)
    await this._exec().exec(ddl)
  }

  typeMapper(field: TDbFieldMeta): string {
    return mysqlTypeFromField(field)
  }

  // ── Index sync ────────────────────────────────────────────────────────────

  async syncIndexes(): Promise<void> {
    const tableName = this._table.tableName
    const schema = this._schema
    // Pre-build lookup for string fields (O(1) per index field instead of linear scan)
    const stringFields = new Set(
      this._table.fieldDescriptors.filter(f => f.designType === 'string').map(f => f.physicalName)
    )

    await this.syncIndexesWithDiff({
      listExisting: async () =>
        this._exec().all<{ name: string }>(
          `SELECT DISTINCT INDEX_NAME as name FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_NAME = ? AND TABLE_SCHEMA = COALESCE(?, DATABASE())`,
          [tableName, schema]
        ),
      createIndex: async (index: TDbIndex) => {
        const unique = index.type === 'unique' ? 'UNIQUE ' : ''
        const fulltext = index.type === 'fulltext' ? 'FULLTEXT ' : ''
        // FULLTEXT indexes accept TEXT columns; others need a key length prefix
        // for string fields that may still be TEXT in pre-existing tables
        const needsPrefix = index.type !== 'fulltext'
        const cols = index.fields
          .map(f => {
            const col = qi(f.name)
            const prefix = needsPrefix && stringFields.has(f.name) ? '(255)' : ''
            return `${col}${prefix} ${f.sort === 'desc' ? 'DESC' : 'ASC'}`
          })
          .join(', ')
        const sql = `CREATE ${fulltext}${unique}INDEX ${qi(index.key)} ON ${quoteTableName(this.resolveTableName())} (${cols})`
        this._log(sql)
        await this._exec().exec(sql)
      },
      dropIndex: async (name: string) => {
        const sql = `DROP INDEX ${qi(name)} ON ${quoteTableName(this.resolveTableName())}`
        this._log(sql)
        await this._exec().exec(sql)
      },
      // MySQL supports FULLTEXT indexes natively — don't skip them
    })
  }

  // ── FK sync ───────────────────────────────────────────────────────────────

  async syncForeignKeys(): Promise<void> {
    const existingByName = await this._getExistingFkConstraints()

    // Build desired FK set (keyed by sorted local column names)
    const desiredFkKeys = new Set<string>()
    for (const fk of this._table.foreignKeys.values()) {
      desiredFkKeys.add([...fk.fields].sort().join(','))
    }

    // Drop stale FKs (managed ones that no longer match desired)
    for (const [constraintName, columns] of existingByName) {
      const key = columns.sort().join(',')
      if (!desiredFkKeys.has(key)) {
        const ddl = `ALTER TABLE ${quoteTableName(this.resolveTableName())} DROP FOREIGN KEY ${qi(constraintName)}`
        this._log(ddl)
        await this._exec().exec(ddl)
      }
    }

    // Add missing FKs
    const existingKeys = new Set(
      [...existingByName.values()].map(cols => cols.sort().join(','))
    )
    for (const fk of this._table.foreignKeys.values()) {
      const key = [...fk.fields].sort().join(',')
      if (!existingKeys.has(key)) {
        const localCols = fk.fields.map(f => qi(f)).join(', ')
        const targetCols = fk.targetFields.map(f => qi(f)).join(', ')
        let ddl = `ALTER TABLE ${quoteTableName(this.resolveTableName())} ADD FOREIGN KEY (${localCols}) REFERENCES ${qi(fk.targetTable)} (${targetCols})`
        if (fk.onDelete) {
          ddl += ` ON DELETE ${refActionToSql(fk.onDelete)}`
        }
        if (fk.onUpdate) {
          ddl += ` ON UPDATE ${refActionToSql(fk.onUpdate)}`
        }
        this._log(ddl)
        await this._exec().exec(ddl)
      }
    }
  }

  async dropForeignKeys(fkFieldKeys: string[]): Promise<void> {
    if (fkFieldKeys.length === 0) { return }
    const keySet = new Set(fkFieldKeys)
    const existingByName = await this._getExistingFkConstraints()

    for (const [constraintName, cols] of existingByName) {
      const key = cols.sort().join(',')
      if (keySet.has(key)) {
        const ddl = `ALTER TABLE ${quoteTableName(this.resolveTableName())} DROP FOREIGN KEY ${qi(constraintName)}`
        this._log(ddl)
        await this._exec().exec(ddl)
      }
    }
  }

  /** Queries INFORMATION_SCHEMA for existing FK constraints, grouped by constraint name → column names. */
  private async _getExistingFkConstraints(): Promise<Map<string, string[]>> {
    const rows = await this._exec().all<{
      CONSTRAINT_NAME: string
      COLUMN_NAME: string
    }>(
      `SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       WHERE kcu.TABLE_NAME = ? AND kcu.TABLE_SCHEMA = COALESCE(?, DATABASE())
         AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
      [this._table.tableName, this._schema]
    )
    const byName = new Map<string, string[]>()
    for (const row of rows) {
      let cols = byName.get(row.CONSTRAINT_NAME)
      if (!cols) { cols = []; byName.set(row.CONSTRAINT_NAME, cols) }
      cols.push(row.COLUMN_NAME)
    }
    return byName
  }

  // ── Fulltext search ───────────────────────────────────────────────────────

  override getSearchIndexes() {
    const indexes: Array<{ name: string; description?: string; type?: 'text' | 'vector' }> = []
    for (const index of this._table.indexes.values()) {
      if (index.type === 'fulltext') {
        indexes.push({
          name: index.key,
          description: `FULLTEXT index on ${index.fields.map(f => f.name).join(', ')}`,
          type: 'text',
        })
      }
    }
    return indexes
  }

  override async search(
    text: string,
    query: DbQuery,
    indexName?: string
  ): Promise<Array<Record<string, unknown>>> {
    const combinedWhere = this._buildSearchWhere(text, query, indexName)
    const { sql, params } = buildSelect(this.resolveTableName(), combinedWhere, query.controls)
    this._log(sql, params)
    return this._exec().all(sql, params)
  }

  override async searchWithCount(
    text: string,
    query: DbQuery,
    indexName?: string
  ): Promise<{ data: Array<Record<string, unknown>>; count: number }> {
    const combinedWhere = this._buildSearchWhere(text, query, indexName)
    const tableName = this.resolveTableName()

    const selectPromise = (async () => {
      const { sql, params } = buildSelect(tableName, combinedWhere, query.controls)
      this._log(sql, params)
      return this._exec().all(sql, params)
    })()

    const countPromise = (async () => {
      const sql = `SELECT COUNT(*) as cnt FROM ${quoteTableName(tableName)} WHERE ${combinedWhere.sql}`
      this._log(sql, combinedWhere.params)
      const row = await this._exec().get<{ cnt: number }>(sql, combinedWhere.params)
      return row?.cnt ?? 0
    })()

    const [data, count] = await Promise.all([selectPromise, countPromise])
    return { data, count }
  }

  private _buildSearchWhere(
    text: string,
    query: DbQuery,
    indexName?: string
  ): { sql: string; params: unknown[] } {
    const fulltextIndex = this._getFulltextIndex(indexName)
    if (!fulltextIndex) {
      throw new Error('No FULLTEXT index found for search')
    }
    const matchCols = fulltextIndex.fields.map(f => qi(f.name)).join(', ')
    const where = buildWhere(query.filter)
    const matchClause = `MATCH(${matchCols}) AGAINST(? IN NATURAL LANGUAGE MODE)`
    return {
      sql: where.sql === '1=1' ? matchClause : `${where.sql} AND ${matchClause}`,
      params: [...where.params, text],
    }
  }

  private _getFulltextIndex(indexName?: string): TDbIndex | undefined {
    for (const index of this._table.indexes.values()) {
      if (index.type === 'fulltext') {
        if (!indexName || index.key === indexName) {
          return index
        }
      }
    }
    return undefined
  }
}

/**
 * Normalizes MySQL INFORMATION_SCHEMA.COLUMNS.COLUMN_DEFAULT values
 * to match the format produced by `serializeDefaultValue()`.
 *
 * MySQL stores expression defaults as raw SQL (e.g., `CURRENT_TIMESTAMP`,
 * `uuid()`), but the diff engine compares against serialized form (`fn:now`,
 * `fn:uuid`). Without normalization, every table with function defaults
 * produces phantom ALTER diffs on re-plan.
 */
function normalizeMysqlDefault(value: string | null): string | undefined {
  if (value === null) { return undefined }
  const lower = value.toLowerCase()
  // DEFAULT CURRENT_TIMESTAMP / current_timestamp() → fn:now
  if (lower === 'current_timestamp' || lower === 'current_timestamp()') { return 'fn:now' }
  // DEFAULT uuid() — MySQL 8.0 stores as "uuid()"
  if (lower === 'uuid()') { return 'fn:uuid' }
  // Strip enclosing single quotes and un-double escaped quotes
  // MySQL INFORMATION_SCHEMA returns 'it''s active' for DEFAULT 'it''s active'
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}
