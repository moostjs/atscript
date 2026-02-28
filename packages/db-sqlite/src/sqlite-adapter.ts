import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
import { BaseDbAdapter } from '@atscript/utils-db'
import type {
  TDbDeleteResult,
  TDbFilter,
  TDbFindOptions,
  TDbIndex,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbUpdateResult,
} from '@atscript/utils-db'

import { buildWhere } from './filter-builder'
import {
  buildCreateTable,
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
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
    const result = this.driver.run(sql, params)
    return { insertedId: result.lastInsertRowid }
  }

  async insertMany(
    data: Array<Record<string, unknown>>
  ): Promise<TDbInsertManyResult> {
    const ids: unknown[] = []
    this.driver.exec('BEGIN')
    try {
      for (const row of data) {
        const { sql, params } = buildInsert(this.resolveTableName(), row)
        const result = this.driver.run(sql, params)
        ids.push(result.lastInsertRowid)
      }
      this.driver.exec('COMMIT')
    } catch (error) {
      this.driver.exec('ROLLBACK')
      throw error
    }
    return { insertedCount: ids.length, insertedIds: ids }
  }

  // ── CRUD: Read ─────────────────────────────────────────────────────────────

  async findOne(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Record<string, unknown> | null> {
    const where = buildWhere(filter)
    const { sql, params } = buildSelect(
      this.resolveTableName(),
      where,
      { ...options, limit: 1 }
    )
    return this.driver.get(sql, params)
  }

  async findMany(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Array<Record<string, unknown>>> {
    const where = buildWhere(filter)
    const { sql, params } = buildSelect(this.resolveTableName(), where, options)
    return this.driver.all(sql, params)
  }

  async count(filter: TDbFilter): Promise<number> {
    const where = buildWhere(filter)
    const tableName = this.resolveTableName()
    const sql = `SELECT COUNT(*) as cnt FROM "${esc(tableName)}" WHERE ${where.sql}`
    const row = this.driver.get<{ cnt: number }>(sql, where.params)
    return row?.cnt ?? 0
  }

  // ── CRUD: Update ───────────────────────────────────────────────────────────

  async updateOne(
    filter: TDbFilter,
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
    const result = this.driver.run(sql, [...setParams, ...where.params])
    return { matchedCount: result.changes, modifiedCount: result.changes }
  }

  async updateMany(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where)
    const result = this.driver.run(sql, params)
    return { matchedCount: result.changes, modifiedCount: result.changes }
  }

  // ── CRUD: Replace ──────────────────────────────────────────────────────────

  async replaceOne(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // DELETE old row, then INSERT the new one
    const where = buildWhere(filter)
    const tableName = this.resolveTableName()
    this.driver.exec('BEGIN')
    try {
      const delSql = `DELETE FROM "${esc(tableName)}" WHERE rowid = (SELECT rowid FROM "${esc(tableName)}" WHERE ${where.sql} LIMIT 1)`
      const delResult = this.driver.run(delSql, where.params)
      if (delResult.changes > 0) {
        const { sql, params } = buildInsert(tableName, data)
        this.driver.run(sql, params)
      }
      this.driver.exec('COMMIT')
      return { matchedCount: delResult.changes, modifiedCount: delResult.changes }
    } catch (error) {
      this.driver.exec('ROLLBACK')
      throw error
    }
  }

  async replaceMany(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // For replaceMany we do a full UPDATE (set all columns)
    const where = buildWhere(filter)
    const { sql, params } = buildUpdate(this.resolveTableName(), data, where)
    const result = this.driver.run(sql, params)
    return { matchedCount: result.changes, modifiedCount: result.changes }
  }

  // ── CRUD: Delete ───────────────────────────────────────────────────────────

  async deleteOne(filter: TDbFilter): Promise<TDbDeleteResult> {
    const where = buildWhere(filter)
    const tableName = this.resolveTableName()
    const sql = `DELETE FROM "${esc(tableName)}" WHERE rowid = (SELECT rowid FROM "${esc(tableName)}" WHERE ${where.sql} LIMIT 1)`
    const result = this.driver.run(sql, where.params)
    return { deletedCount: result.changes }
  }

  async deleteMany(filter: TDbFilter): Promise<TDbDeleteResult> {
    const where = buildWhere(filter)
    const { sql, params } = buildDelete(this.resolveTableName(), where)
    const result = this.driver.run(sql, params)
    return { deletedCount: result.changes }
  }

  // ── Schema ─────────────────────────────────────────────────────────────────

  async ensureTable(): Promise<void> {
    const sql = buildCreateTable(
      this.resolveTableName(),
      this._table.fieldDescriptors
    )
    this.driver.exec(sql)
  }

  async syncIndexes(): Promise<void> {
    const tableName = this.resolveTableName()
    const columnMap = this._table.columnMap

    await this.syncIndexesWithDiff({
      listExisting: async () =>
        this.driver
          .all<{ name: string }>(`PRAGMA index_list("${esc(tableName)}")`)
          .filter(i => !i.name.startsWith('sqlite_')),
      createIndex: async (index: TDbIndex) => {
        const unique = index.type === 'unique' ? 'UNIQUE ' : ''
        const cols = index.fields
          .map(f => {
            const physical = columnMap.get(f.name) ?? f.name
            return `"${esc(physical)}" ${f.sort === 'desc' ? 'DESC' : 'ASC'}`
          })
          .join(', ')
        this.driver.exec(
          `CREATE ${unique}INDEX IF NOT EXISTS "${esc(index.key)}" ON "${esc(tableName)}" (${cols})`
        )
      },
      dropIndex: async (name: string) => {
        this.driver.exec(`DROP INDEX IF EXISTS "${esc(name)}"`)
      },
      shouldSkipType: (type) => type === 'fulltext',
    })
  }
}

function esc(name: string): string {
  return name.replace(/"/g, '""')
}

function toSqliteValue(value: unknown): unknown {
  if (value === undefined) { return null }
  if (value === null) { return null }
  if (typeof value === 'object') { return JSON.stringify(value) }
  if (typeof value === 'boolean') { return value ? 1 : 0 }
  return value
}
