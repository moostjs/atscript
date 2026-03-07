import { describe, it, expect, beforeAll } from 'vitest'
import { DbSpace, BaseDbAdapter } from '../index'
import { SchemaSync, syncSchema } from '../sync'
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
let ProfileTable: any
let ActiveUsersView: any

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
        if (match) { return row }
      }
      return null
    }
    return rows[0] ?? null
  }

  async findMany(): Promise<Array<Record<string, unknown>>> {
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

  async dropColumns(columns: string[]): Promise<void> {
    this._existingColumns = this._existingColumns.filter(c => !columns.includes(c.name))
  }

  async dropTableByName(tableName: string): Promise<void> {
    this.tables.delete(tableName)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

let sharedTables: Map<string, Array<Record<string, unknown>>>

function createSpace(): DbSpace {
  sharedTables = new Map()
  return new DbSpace(() => {
    const adapter = new MockAdapter()
    adapter.tables = sharedTables
    return adapter
  })
}

// ── Setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await prepareFixtures()
  const fixtures = await import('./fixtures/test-table.as.js')
  UsersTable = fixtures.UsersTable
  ProfileTable = fixtures.ProfileTable
  ActiveUsersView = fixtures.ActiveUsersView
})

// ── syncSchema (basic run) ───────────────────────────────────────────────

describe('syncSchema', () => {
  it('should create control table and sync user table', async () => {
    const space = createSpace()
    const result = await syncSchema(space, [UsersTable])

    expect(result.status).toBe('synced')
    expect(result.schemaHash).toBeTruthy()
    expect(result.tables).toBeDefined()
    expect(sharedTables.has('__atscript_control')).toBe(true)
    expect(sharedTables.has('users')).toBe(true)

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

    const controlRows = sharedTables.get('__atscript_control')!
    const lockRow = controlRows.find(r => r.key === 'sync_lock')
    expect(lockRow).toBeUndefined()
  })

  it('should detect stale locks and clean them up', async () => {
    const space = createSpace()
    sharedTables.set('__atscript_control', [
      { key: 'sync_lock', lockedBy: 'dead-pod', lockedAt: 0, expiresAt: 1 },
    ])

    const result = await syncSchema(space, [UsersTable])
    expect(result.status).toBe('synced')

    const controlRows = sharedTables.get('__atscript_control')!
    const lockRow = controlRows.find(r => r.key === 'sync_lock')
    expect(lockRow).toBeUndefined()
  })
})

// ── run() — views ────────────────────────────────────────────────────────

describe('SchemaSync.run — views', () => {
  it('should sync views alongside tables', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    expect(result.status).toBe('synced')
    const viewResult = result.tables!.find(t => t.tableName === 'active_users')
    expect(viewResult).toBeDefined()
    expect(viewResult!.viewType).toBe('V')

    const tableResult = result.tables!.find(t => t.tableName === 'users')
    expect(tableResult).toBeDefined()
    expect(tableResult!.viewType).toBeUndefined()
  })

  it('should mark new views as created on first run', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    const viewResult = result.tables!.find(t => t.tableName === 'active_users')
    expect(viewResult!.created).toBe(true)
  })

  it('should not mark existing views as created on subsequent run', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    const viewResult = result.tables!.find(t => t.tableName === 'active_users')
    expect(viewResult!.created).toBe(false)
  })

  it('should track views with isView flag in control table', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    await sync.run([UsersTable, ActiveUsersView], { force: true })

    const controlRows = sharedTables.get('__atscript_control')!
    const trackedRow = controlRows.find(r => r.key === 'synced_tables')
    const tracked = JSON.parse(trackedRow!.value as string) as Array<{ name: string; isView: boolean }>

    const viewEntry = tracked.find(t => t.name === 'active_users')
    expect(viewEntry).toBeDefined()
    expect(viewEntry!.isView).toBe(true)

    const tableEntry = tracked.find(t => t.name === 'users')
    expect(tableEntry).toBeDefined()
    expect(tableEntry!.isView).toBe(false)
  })

  it('should detect removed views separately from removed tables', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const result = await sync.run([UsersTable], { force: true })

    expect(result.removedTables).toBeUndefined()
    expect(result.removedViews).toBeDefined()
    expect(result.removedViews).toContain('active_users')
  })

  it('should detect removed tables separately from removed views', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable, ActiveUsersView], { force: true })
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    expect(result.removedTables).toBeDefined()
    expect(result.removedTables).toContain('profiles')
    expect(result.removedViews).toBeUndefined()
  })
})

// ── plan() ───────────────────────────────────────────────────────────────

describe('SchemaSync.plan', () => {
  it('should return up-to-date when hash matches', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable], { force: true })
    const plan = await sync.plan([UsersTable])

    expect(plan.status).toBe('up-to-date')
    expect(plan.tables.length).toBeGreaterThan(0)
    expect(plan.removedTables).toEqual([])
    expect(plan.removedViews).toEqual([])
  })

  it('should return changes-needed for new tables', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const plan = await sync.plan([UsersTable], { force: true })

    expect(plan.status).toBe('changes-needed')
    const usersPlan = plan.tables.find(t => t.tableName === 'users')
    expect(usersPlan).toBeDefined()
    expect(usersPlan!.isNew).toBe(true)
    expect(usersPlan!.columnsToAdd.length).toBeGreaterThan(0)
  })

  it('should separate views from tables in plan output', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    const viewPlan = plan.tables.find(t => t.tableName === 'active_users')
    expect(viewPlan).toBeDefined()
    expect(viewPlan!.viewType).toBe('V')

    const tablePlan = plan.tables.find(t => t.tableName === 'users')
    expect(tablePlan).toBeDefined()
    expect(tablePlan!.viewType).toBeUndefined()
  })

  it('should mark new views as isNew in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    const viewPlan = plan.tables.find(t => t.tableName === 'active_users')
    expect(viewPlan).toBeDefined()
    expect(viewPlan!.isNew).toBe(true)
  })

  it('should mark existing views as not isNew in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    const viewPlan = plan.tables.find(t => t.tableName === 'active_users')
    expect(viewPlan).toBeDefined()
    expect(viewPlan!.isNew).toBe(false)
  })

  it('should detect removed views in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable], { force: true })

    expect(plan.status).toBe('changes-needed')
    expect(plan.removedViews).toContain('active_users')
    expect(plan.removedTables).not.toContain('active_users')
  })

  it('should detect removed tables in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    expect(plan.status).toBe('changes-needed')
    expect(plan.removedTables).toContain('profiles')
    expect(plan.removedViews).toEqual([])
  })

  it('should hide destructive ops in safe mode', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable], { force: true, safe: true })

    expect(plan.removedTables).toEqual([])
    expect(plan.removedViews).toEqual([])
    for (const t of plan.tables) {
      expect(t.columnsToDrop).toEqual([])
    }
  })

  it('should handle backwards-compatible old tracked format (string[])', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable], { force: true })

    // Overwrite with old string[] format
    const controlRows = sharedTables.get('__atscript_control')!
    const trackedRow = controlRows.find(r => r.key === 'synced_tables')
    trackedRow!.value = JSON.stringify(['users', 'old_table'])

    const plan = await sync.plan([UsersTable], { force: true })
    // Old format entries are treated as tables (not views)
    expect(plan.removedTables).toContain('old_table')
    expect(plan.removedViews).toEqual([])
  })
})

// ── run() — safe mode ────────────────────────────────────────────────────

describe('SchemaSync.run — safe mode', () => {
  it('should skip dropping removed tables/views in safe mode', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable, ActiveUsersView], { force: true })
    await sync.run([UsersTable], { force: true, safe: true })

    // In safe mode, the mock tables should NOT be deleted
    expect(sharedTables.has('profiles')).toBe(true)
  })

  it('should drop removed tables/views in normal mode', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable], { force: true })
    expect(sharedTables.has('profiles')).toBe(true)

    await sync.run([UsersTable], { force: true })
    // profiles should be dropped
    expect(sharedTables.has('profiles')).toBe(false)
  })
})
