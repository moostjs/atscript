import { describe, it, expect, beforeAll } from 'vitest'
import { DbSpace, BaseDbAdapter, AtscriptDbTable } from '../index'
import { syncSchema } from '../sync'
import type {
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
  DbQuery,
  FilterExpr,
  TExistingColumn,
  TColumnDiff,
  TSyncColumnResult,
} from '../types'

import { prepareFixtures } from './test-utils'

let UsersTable: any

// ── Mock adapter that stores data in memory ──────────────────────────────

class MockAdapter extends BaseDbAdapter {
  tables = new Map<string, Array<Record<string, unknown>>>()
  private _existingColumns: TExistingColumn[] = []
  columnsAdded: string[] = []

  private _getTable(): Array<Record<string, unknown>> {
    const name = this._table.tableName
    if (!this.tables.has(name)) {
      this.tables.set(name, [])
    }
    return this.tables.get(name)!
  }

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    this._getTable().push(data)
    return { insertedId: data[this._table.primaryKeys[0] as string] ?? this._getTable().length }
  }

  async insertMany(data: Array<Record<string, unknown>>): Promise<TDbInsertManyResult> {
    const ids: unknown[] = []
    for (const row of data) {
      const r = await this.insertOne(row)
      ids.push(r.insertedId)
    }
    return { insertedCount: ids.length, insertedIds: ids }
  }

  async findOne(query: DbQuery): Promise<Record<string, unknown> | null> {
    const rows = this._getTable()
    if (query.filter && typeof query.filter === 'object') {
      const filter = query.filter as Record<string, unknown>
      for (const row of rows) {
        let match = true
        for (const [key, value] of Object.entries(filter)) {
          const expected = typeof value === 'object' && value !== null && '$eq' in (value as any)
            ? (value as any).$eq
            : value
          if (row[key] !== expected) { match = false; break }
        }
        if (match) return row
      }
      return null
    }
    return rows[0] ?? null
  }

  async findMany(query: DbQuery): Promise<Array<Record<string, unknown>>> {
    return this._getTable()
  }

  async count(): Promise<number> {
    return this._getTable().length
  }

  async replaceOne(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    const rows = this._getTable()
    const pk = this._table.primaryKeys[0] as string
    const filterObj = filter as Record<string, unknown>
    const idx = rows.findIndex(r => r[pk] === filterObj[pk])
    if (idx >= 0) { rows[idx] = data; return { matchedCount: 1, modifiedCount: 1 } }
    return { matchedCount: 0, modifiedCount: 0 }
  }

  async updateOne(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    return this.replaceOne(filter, data)
  }

  async deleteOne(filter: FilterExpr): Promise<TDbDeleteResult> {
    const rows = this._getTable()
    const pk = this._table.primaryKeys[0] as string
    const filterObj = filter as Record<string, unknown>
    const idx = rows.findIndex(r => r[pk] === filterObj[pk])
    if (idx >= 0) { rows.splice(idx, 1); return { deletedCount: 1 } }
    return { deletedCount: 0 }
  }

  async updateMany(): Promise<TDbUpdateResult> { return { matchedCount: 0, modifiedCount: 0 } }
  async replaceMany(): Promise<TDbUpdateResult> { return { matchedCount: 0, modifiedCount: 0 } }
  async deleteMany(): Promise<TDbDeleteResult> { return { deletedCount: 0 } }

  async ensureTable(): Promise<void> {
    // Track that ensureTable was called
    if (!this.tables.has(this._table.tableName)) {
      this.tables.set(this._table.tableName, [])
    }
  }

  async syncIndexes(): Promise<void> {}

  setExistingColumns(cols: TExistingColumn[]): void {
    this._existingColumns = cols
  }

  async getExistingColumns(): Promise<TExistingColumn[]> {
    return this._existingColumns
  }

  async syncColumns(diff: TColumnDiff): Promise<TSyncColumnResult> {
    const added = diff.added.map(f => f.physicalName)
    this.columnsAdded.push(...added)
    // After adding, update existing columns
    for (const field of diff.added) {
      this._existingColumns.push({
        name: field.physicalName,
        type: 'TEXT',
        notnull: !field.optional,
        pk: field.isPrimaryKey,
      })
    }
    return { added }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('syncSchema', () => {
  // Shared mock adapter state across tables in a space
  let sharedTables: Map<string, Array<Record<string, unknown>>>

  beforeAll(async () => {
    await prepareFixtures()
    const fixtures = await import('./fixtures/test-table.as.js')
    UsersTable = fixtures.UsersTable
  })

  function createSpace(): DbSpace {
    sharedTables = new Map()
    return new DbSpace(() => {
      const adapter = new MockAdapter()
      adapter.tables = sharedTables
      return adapter
    })
  }

  it('should create control table and sync user table', async () => {
    const space = createSpace()
    const result = await syncSchema(space, [UsersTable])

    expect(result.status).toBe('synced')
    expect(result.schemaHash).toBeTruthy()
    expect(result.tables).toBeDefined()

    // Control table should exist
    expect(sharedTables.has('__atscript_control')).toBe(true)

    // Users table should exist
    expect(sharedTables.has('users')).toBe(true)

    // Schema version should be stored
    const controlRows = sharedTables.get('__atscript_control')!
    const versionRow = controlRows.find(r => r.key === 'schema_version')
    expect(versionRow).toBeDefined()
    expect(versionRow!.value).toBe(result.schemaHash)
  })

  it('should skip sync when hash matches', async () => {
    const space = createSpace()

    const result1 = await syncSchema(space, [UsersTable])
    expect(result1.status).toBe('synced')

    const result2 = await syncSchema(space, [UsersTable])
    expect(result2.status).toBe('up-to-date')
    expect(result2.schemaHash).toBe(result1.schemaHash)
  })

  it('should force sync even when hash matches', async () => {
    const space = createSpace()

    await syncSchema(space, [UsersTable])
    const result = await syncSchema(space, [UsersTable], { force: true })

    expect(result.status).toBe('synced')
  })

  it('should acquire and release lock', async () => {
    const space = createSpace()
    await syncSchema(space, [UsersTable])

    // After sync, no lock should remain
    const controlRows = sharedTables.get('__atscript_control')!
    const lockRow = controlRows.find(r => r.key === 'sync_lock')
    expect(lockRow).toBeUndefined()
  })

  it('should detect stale locks and clean them up', async () => {
    const space = createSpace()

    // Pre-create control table with an expired lock
    sharedTables.set('__atscript_control', [
      { key: 'sync_lock', lockedBy: 'dead-pod', lockedAt: 0, expiresAt: 1 },
    ])

    // Sync should clean up the expired lock and proceed
    const result = await syncSchema(space, [UsersTable])
    expect(result.status).toBe('synced')

    // Lock should be cleaned up
    const controlRows = sharedTables.get('__atscript_control')!
    const lockRow = controlRows.find(r => r.key === 'sync_lock')
    expect(lockRow).toBeUndefined()
  })
})
