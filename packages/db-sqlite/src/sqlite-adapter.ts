import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
import { BaseDbAdapter, AtscriptDbView } from '@atscript/utils-db'
import type {
  TDbDeleteResult,
  TDbIndex,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbUpdateResult,
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
    return this.withTransaction(async () => {
      const where = buildWhere(filter)
      const tableName = this.resolveTableName()
      const delSql = `DELETE FROM "${esc(tableName)}" WHERE rowid = (SELECT rowid FROM "${esc(tableName)}" WHERE ${where.sql} LIMIT 1)`
      this._log(delSql, where.params)
      const delResult = this.driver.run(delSql, where.params)
      if (delResult.changes > 0) {
        const { sql, params } = buildInsert(tableName, data)
        this._log(sql, params)
        this.driver.run(sql, params)
      }
      return { matchedCount: delResult.changes, modifiedCount: delResult.changes }
    })
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
