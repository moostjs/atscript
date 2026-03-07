import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
import { BaseDbAdapter, AtscriptDbView } from '@atscript/utils-db'
import type {
  TDbDeleteResult,
  TDbIndex,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbUpdateResult,
  TExistingColumn,
  TColumnDiff,
  TSyncColumnResult,
} from '@atscript/utils-db'
import type { DbQuery, FilterExpr } from '@atscript/utils-db'

import { buildWhere } from './filter-builder'
import {
  buildCreateTable,
  buildCreateView,
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
  esc,
  toSqliteValue,
  sqliteTypeFromDesignType,
} from './sql-builder'
import type { TSqliteDriver } from './types'

/**
 * SQLite adapter for {@link AtscriptDbTable}.
 *
 * Accepts any {@link TSqliteDriver} implementation — the actual SQLite engine
 * is fully swappable (better-sqlite3, node:sqlite, sql.js, etc.).
 *
 * Usage:
 * ```typescript
 * import { BetterSqlite3Driver } from '@atscript/db-sqlite'
 *
 * const driver = new BetterSqlite3Driver(':memory:')
 * const adapter = new SqliteAdapter(driver)
 * const users = new AtscriptDbTable(UsersType, adapter)
 * ```
 */
export class SqliteAdapter extends BaseDbAdapter {
  constructor(protected readonly driver: TSqliteDriver) {
    super()
    this.driver.exec('PRAGMA foreign_keys = ON')
  }

  // ── Transaction primitives ────────────────────────────────────────────────

  protected override async _beginTransaction(): Promise<unknown> {
    this._log('BEGIN')
    this.driver.exec('BEGIN')
    return undefined
  }

  protected override async _commitTransaction(): Promise<void> {
    this._log('COMMIT')
    this.driver.exec('COMMIT')
  }

  protected override async _rollbackTransaction(): Promise<void> {
    this._log('ROLLBACK')
    this.driver.exec('ROLLBACK')
  }

  /** SQLite does not use schemas — override to always exclude schema. */
  override resolveTableName(): string {
    return super.resolveTableName(false)
  }

  // ── ID preparation ─────────────────────────────────────────────────────────

  prepareId(id: unknown, _fieldType: TAtscriptAnnotatedType): unknown {
    // SQLite uses integer or text PKs — no transformation needed
    return id
  }

  // ── CRUD: Insert ───────────────────────────────────────────────────────────

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    const { sql, params } = buildInsert(this.resolveTableName(), data)
    this._log(sql, params)
    const result = this.driver.run(sql, params)
    return { insertedId: result.lastInsertRowid }
  }

  async insertMany(
    data: Array<Record<string, unknown>>
  ): Promise<TDbInsertManyResult> {
    return this.withTransaction(async () => {
      const ids: unknown[] = []
      for (const row of data) {
        const { sql, params } = buildInsert(this.resolveTableName(), row)
        this._log(sql, params)
        const result = this.driver.run(sql, params)
        ids.push(result.lastInsertRowid)
      }
      return { insertedCount: ids.length, insertedIds: ids }
    })
  }

  // ── CRUD: Read ─────────────────────────────────────────────────────────────

  async findOne(
    query: DbQuery
  ): Promise<Record<string, unknown> | null> {
    const where = buildWhere(query.filter)
    const controls = { ...query.controls, $limit: 1 }
    const { sql, params } = buildSelect(
      this.resolveTableName(),
      where,
      controls
    )
    this._log(sql, params)
    return this.driver.get(sql, params)
  }

  async findMany(
    query: DbQuery
  ): Promise<Array<Record<string, unknown>>> {
    const where = buildWhere(query.filter)
    const { sql, params } = buildSelect(this.resolveTableName(), where, query.controls)
    this._log(sql, params)
    return this.driver.all(sql, params)
  }

  async count(query: DbQuery): Promise<number> {
    const where = buildWhere(query.filter)
    const tableName = this.resolveTableName()
    const sql = `SELECT COUNT(*) as cnt FROM "${esc(tableName)}" WHERE ${where.sql}`
    this._log(sql, where.params)
    const row = this.driver.get<{ cnt: number }>(sql, where.params)
    return row?.cnt ?? 0
  }

  // ── CRUD: Update ───────────────────────────────────────────────────────────

  async updateOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // SQLite doesn't support UPDATE ... LIMIT 1 directly.
    // Use a subquery on rowid to target one row.
    const where = buildWhere(filter)
    const tableName = this.resolveTableName()
    const setClauses: string[] = []
    const setParams: unknown[] = []

    for (const [key, value] of Object.entries(data)) {
      setClauses.push(`"${esc(key)}" = ?`)
      setParams.push(toSqliteValue(value))
    }

    const sql = `UPDATE "${esc(tableName)}" SET ${setClauses.join(', ')} WHERE rowid = (SELECT rowid FROM "${esc(tableName)}" WHERE ${where.sql} LIMIT 1)`
    const allParams = [...setParams, ...where.params]
    this._log(sql, allParams)
    const result = this.driver.run(sql, allParams)
    return { matchedCount: result.changes, modifiedCount: result.changes }
  }

  async updateMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where)
    this._log(sql, params)
    const result = this.driver.run(sql, params)
    return { matchedCount: result.changes, modifiedCount: result.changes }
  }

  // ── CRUD: Replace ──────────────────────────────────────────────────────────

  async replaceOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const where = buildWhere(filter)
    const tableName = this.resolveTableName()
    // Use UPDATE (set all columns) instead of DELETE+INSERT to avoid triggering CASCADE deletes
    const limitedWhere = {
      sql: `rowid = (SELECT rowid FROM "${esc(tableName)}" WHERE ${where.sql} LIMIT 1)`,
      params: where.params,
    }
    const { sql, params } = buildUpdate(tableName, data, limitedWhere)
    this._log(sql, params)
    const result = this.driver.run(sql, params)
    return { matchedCount: result.changes, modifiedCount: result.changes }
  }

  async replaceMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // For replaceMany we do a full UPDATE (set all columns)
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where)
    this._log(sql, params)
    const result = this.driver.run(sql, params)
    return { matchedCount: result.changes, modifiedCount: result.changes }
  }

  // ── CRUD: Delete ───────────────────────────────────────────────────────────

  async deleteOne(filter: FilterExpr): Promise<TDbDeleteResult> {
    const where = buildWhere(filter)
    const tableName = this.resolveTableName()
    const sql = `DELETE FROM "${esc(tableName)}" WHERE rowid = (SELECT rowid FROM "${esc(tableName)}" WHERE ${where.sql} LIMIT 1)`
    this._log(sql, where.params)
    const result = this.driver.run(sql, where.params)
    return { deletedCount: result.changes }
  }

  async deleteMany(filter: FilterExpr): Promise<TDbDeleteResult> {
    const where = buildWhere(filter)
    const { sql, params } = buildDelete(this.resolveTableName(), where)
    this._log(sql, params)
    const result = this.driver.run(sql, params)
    return { deletedCount: result.changes }
  }

  // ── Schema ─────────────────────────────────────────────────────────────────

  async ensureTable(): Promise<void> {
    if (this._table instanceof AtscriptDbView) {
      return this.ensureView()
    }
    const sql = buildCreateTable(
      this.resolveTableName(),
      this._table.fieldDescriptors,
      this._table.foreignKeys
    )
    this._log(sql)
    this.driver.exec(sql)
  }

  async ensureView(): Promise<void> {
    const view = this._table as AtscriptDbView
    const sql = buildCreateView(
      this.resolveTableName(),
      view.viewPlan,
      view.getViewColumnMappings(),
      ref => view.resolveFieldRef(ref),
    )
    this._log(sql)
    this.driver.exec(sql)
  }

  async getExistingColumns(): Promise<TExistingColumn[]> {
    return this.getExistingColumnsForTable(this.resolveTableName())
  }

  async syncColumns(diff: TColumnDiff): Promise<TSyncColumnResult> {
    const tableName = this.resolveTableName()
    const added: string[] = []
    const renamed: string[] = []

    // Renames first (before adds, in case a renamed column is referenced)
    for (const { field, oldName } of diff.renamed ?? []) {
      const ddl = `ALTER TABLE "${esc(tableName)}" RENAME COLUMN "${esc(oldName)}" TO "${esc(field.physicalName)}"`
      this._log(ddl)
      this.driver.exec(ddl)
      renamed.push(field.physicalName)
    }

    // Adds
    for (const field of diff.added) {
      const sqlType = this.typeMapper(field)
      let ddl = `ALTER TABLE "${esc(tableName)}" ADD COLUMN "${esc(field.physicalName)}" ${sqlType}`
      // SQLite: NOT NULL requires a DEFAULT value for ADD COLUMN
      if (!field.optional && !field.isPrimaryKey) {
        ddl += ` NOT NULL DEFAULT ${defaultValueForType(field.designType)}`
      }
      this._log(ddl)
      this.driver.exec(ddl)
      added.push(field.physicalName)
    }

    return { added, renamed }
  }

  async recreateTable(): Promise<void> {
    const tableName = this.resolveTableName()
    const tempName = `${tableName}__tmp_${Date.now()}`

    // 1. Create new table with temp name
    const createSql = buildCreateTable(tempName, this._table.fieldDescriptors, this._table.foreignKeys)
    this._log(createSql)
    this.driver.exec(createSql)

    // 2. Get columns that exist in both old and new
    const oldCols = (await this.getExistingColumns()).map(c => c.name)
    const newCols = this._table.fieldDescriptors.filter(f => !f.ignored).map(f => f.physicalName)
    const oldColSet = new Set(oldCols)
    const commonCols = newCols.filter(c => oldColSet.has(c))

    if (commonCols.length > 0) {
      // 3. Copy data
      const cols = commonCols.map(c => `"${esc(c)}"`).join(', ')
      const copySql = `INSERT INTO "${esc(tempName)}" (${cols}) SELECT ${cols} FROM "${esc(tableName)}"`
      this._log(copySql)
      this.driver.exec(copySql)
    }

    // 4. Drop old, rename new
    this.driver.exec(`DROP TABLE "${esc(tableName)}"`)
    this.driver.exec(`ALTER TABLE "${esc(tempName)}" RENAME TO "${esc(tableName)}"`)
  }

  async dropTable(): Promise<void> {
    const tableName = this.resolveTableName()
    const ddl = `DROP TABLE IF EXISTS "${esc(tableName)}"`
    this._log(ddl)
    this.driver.exec(ddl)
  }

  async dropColumns(columns: string[]): Promise<void> {
    await this.withTransaction(async () => {
      const tableName = this.resolveTableName()
      for (const col of columns) {
        const ddl = `ALTER TABLE "${esc(tableName)}" DROP COLUMN "${esc(col)}"`
        this._log(ddl)
        this.driver.exec(ddl)
      }
    })
  }

  async dropTableByName(tableName: string): Promise<void> {
    const ddl = `DROP TABLE IF EXISTS "${esc(tableName)}"`
    this._log(ddl)
    this.driver.exec(ddl)
  }

  async dropViewByName(viewName: string): Promise<void> {
    const ddl = `DROP VIEW IF EXISTS "${esc(viewName)}"`
    this._log(ddl)
    this.driver.exec(ddl)
  }

  async renameTable(oldName: string): Promise<void> {
    const newName = this.resolveTableName()
    const ddl = `ALTER TABLE "${esc(oldName)}" RENAME TO "${esc(newName)}"`
    this._log(ddl)
    this.driver.exec(ddl)
  }

  typeMapper(field: { designType: string; isPrimaryKey: boolean }): string {
    // Numeric primary keys must be INTEGER (not REAL) for SQLite rowid alias
    if (field.isPrimaryKey && (field.designType === 'number' || field.designType === 'integer')) {
      return 'INTEGER'
    }
    return sqliteTypeFromDesignType(field.designType)
  }

  async getExistingColumnsForTable(tableName: string): Promise<TExistingColumn[]> {
    const rows = this.driver.all<{ name: string; type: string; notnull: number; pk: number }>(
      `PRAGMA table_info("${esc(tableName)}")`
    )
    return rows.map(r => ({
      name: r.name,
      type: r.type,
      notnull: r.notnull === 1,
      pk: r.pk > 0,
    }))
  }

  async syncIndexes(): Promise<void> {
    const tableName = this.resolveTableName()

    await this.syncIndexesWithDiff({
      listExisting: async () =>
        this.driver
          .all<{ name: string }>(`PRAGMA index_list("${esc(tableName)}")`)
          .filter(i => !i.name.startsWith('sqlite_')),
      createIndex: async (index: TDbIndex) => {
        const unique = index.type === 'unique' ? 'UNIQUE ' : ''
        // Field names are already resolved to physical names by the generic layer
        const cols = index.fields
          .map(f => `"${esc(f.name)}" ${f.sort === 'desc' ? 'DESC' : 'ASC'}`)
          .join(', ')
        const sql = `CREATE ${unique}INDEX IF NOT EXISTS "${esc(index.key)}" ON "${esc(tableName)}" (${cols})`
        this._log(sql)
        this.driver.exec(sql)
      },
      dropIndex: async (name: string) => {
        const sql = `DROP INDEX IF EXISTS "${esc(name)}"`
        this._log(sql)
        this.driver.exec(sql)
      },
      shouldSkipType: (type) => type === 'fulltext',
    })
  }
}

/** Returns a safe SQLite DEFAULT literal for a given design type. */
function defaultValueForType(designType: string): string {
  switch (designType) {
    case 'number':
    case 'integer': { return '0' }
    case 'boolean': { return '0' }
    default: { return "''" }
  }
}
