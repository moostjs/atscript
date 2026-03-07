import { describe, it, expect, beforeAll } from 'vitest'
import { DbSpace, BaseDbAdapter } from '../index'
import { SchemaSync, syncSchema, SyncEntry } from '../sync'
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
let LegacyReportView: any

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

  async dropViewByName(viewName: string): Promise<void> {
    this.tables.delete(viewName)
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
  LegacyReportView = fixtures.LegacyReportView
})

// ── syncSchema (basic run) ───────────────────────────────────────────────

describe('syncSchema', () => {
  it('should create control table and sync user table', async () => {
    const space = createSpace()
    const result = await syncSchema(space, [UsersTable])

    expect(result.status).toBe('synced')
    expect(result.schemaHash).toBeTruthy()
    expect(result.entries.length).toBeGreaterThan(0)
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

// ── SyncEntry ─────────────────────────────────────────────────────────────

describe('SyncEntry', () => {
  it('should compute destructive=false for external view drops', () => {
    const entry = new SyncEntry({ name: 'my_ext', viewType: 'E', status: 'drop' })
    expect(entry.destructive).toBe(false)
  })

  it('should compute destructive=false for virtual view drops', () => {
    const entry = new SyncEntry({ name: 'my_view', viewType: 'V', status: 'drop' })
    expect(entry.destructive).toBe(false)
  })

  it('should compute destructive=true for materialized view drops', () => {
    const entry = new SyncEntry({ name: 'my_mat_view', viewType: 'M', status: 'drop' })
    expect(entry.destructive).toBe(true)
  })

  it('should compute destructive=true for table drops', () => {
    const entry = new SyncEntry({ name: 'my_table', status: 'drop' })
    expect(entry.destructive).toBe(true)
  })

  it('should compute destructive=true when columns are dropped', () => {
    const entry = new SyncEntry({ name: 't', status: 'alter', columnsToDrop: ['old_col'] })
    expect(entry.destructive).toBe(true)
  })

  it('should compute destructive=false for create/in-sync/alter without drops', () => {
    expect(new SyncEntry({ name: 't', status: 'create' }).destructive).toBe(false)
    expect(new SyncEntry({ name: 't', status: 'in-sync' }).destructive).toBe(false)
    expect(new SyncEntry({ name: 't', status: 'alter' }).destructive).toBe(false)
  })

  it('should compute hasChanges correctly', () => {
    expect(new SyncEntry({ name: 't', status: 'create' }).hasChanges).toBe(true)
    expect(new SyncEntry({ name: 't', status: 'alter' }).hasChanges).toBe(true)
    expect(new SyncEntry({ name: 't', status: 'drop' }).hasChanges).toBe(true)
    expect(new SyncEntry({ name: 't', status: 'in-sync' }).hasChanges).toBe(false)
    expect(new SyncEntry({ name: 't', status: 'error' }).hasChanges).toBe(false)
  })

  it('should compute hasErrors correctly', () => {
    expect(new SyncEntry({ name: 't', status: 'error', errors: ['missing'] }).hasErrors).toBe(true)
    expect(new SyncEntry({ name: 't', status: 'in-sync' }).hasErrors).toBe(false)
  })

  it('should print error status', () => {
    const entry = new SyncEntry({ name: 'bad_view', viewType: 'E', status: 'error', errors: ['View not found'] })
    const lines = entry.print('plan')
    expect(lines[0]).toContain('bad_view')
    expect(lines[0]).toContain('error')
    expect(lines[1]).toContain('View not found')
  })

  it('should print plan lines without colors', () => {
    const entry = new SyncEntry({ name: 'users', status: 'drop' })
    const lines = entry.print('plan')
    expect(lines[0]).toContain('users')
    expect(lines[0]).toContain('drop table')
  })

  it('should print result lines without colors', () => {
    const entry = new SyncEntry({ name: 'users', status: 'drop' })
    const lines = entry.print('result')
    expect(lines[0]).toContain('users')
    expect(lines[0]).toContain('dropped table')
  })

  it('should print view drop differently from table drop', () => {
    const viewEntry = new SyncEntry({ name: 'v', viewType: 'V', status: 'drop' })
    const tableEntry = new SyncEntry({ name: 't', status: 'drop' })
    expect(viewEntry.print('plan')[0]).toContain('drop view')
    expect(tableEntry.print('plan')[0]).toContain('drop table')
  })
})

// ── run() — views ────────────────────────────────────────────────────────

describe('SchemaSync.run — views', () => {
  it('should sync views alongside tables', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    expect(result.status).toBe('synced')
    const viewEntry = result.entries.find(e => e.name === 'active_users')
    expect(viewEntry).toBeDefined()
    expect(viewEntry!.viewType).toBe('V')

    const tableEntry = result.entries.find(e => e.name === 'users')
    expect(tableEntry).toBeDefined()
    expect(tableEntry!.viewType).toBeUndefined()
  })

  it('should mark new views as created on first run', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    const viewEntry = result.entries.find(e => e.name === 'active_users')
    expect(viewEntry!.status).toBe('create')
  })

  it('should not mark existing views as created on subsequent run', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    const viewEntry = result.entries.find(e => e.name === 'active_users')
    expect(viewEntry!.status).toBe('in-sync')
  })

  it('should track views with isView flag in control table', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)
    await sync.run([UsersTable, ActiveUsersView], { force: true })

    const controlRows = sharedTables.get('__atscript_control')!
    const trackedRow = controlRows.find(r => r.key === 'synced_tables')
    const tracked = JSON.parse(trackedRow!.value as string) as Array<{ name: string; isView: boolean; viewType?: string }>

    const viewEntry = tracked.find(t => t.name === 'active_users')
    expect(viewEntry).toBeDefined()
    expect(viewEntry!.isView).toBe(true)
    expect(viewEntry!.viewType).toBe('V')

    const tableEntry = tracked.find(t => t.name === 'users')
    expect(tableEntry).toBeDefined()
    expect(tableEntry!.isView).toBe(false)
  })

  it('should detect removed views separately from removed tables', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const result = await sync.run([UsersTable], { force: true })

    const drops = result.entries.filter(e => e.status === 'drop')
    expect(drops).toHaveLength(1)
    expect(drops[0].name).toBe('active_users')
    expect(drops[0].viewType).toBe('V')
    expect(drops[0].destructive).toBe(false)
  })

  it('should detect removed tables separately from removed views', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable, ActiveUsersView], { force: true })
    const result = await sync.run([UsersTable, ActiveUsersView], { force: true })

    const drops = result.entries.filter(e => e.status === 'drop')
    expect(drops).toHaveLength(1)
    expect(drops[0].name).toBe('profiles')
    expect(drops[0].viewType).toBeUndefined()
    expect(drops[0].destructive).toBe(true)
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
    expect(plan.entries.length).toBeGreaterThan(0)
    expect(plan.entries.filter(e => e.status === 'drop')).toEqual([])
  })

  it('should return changes-needed for new tables', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const plan = await sync.plan([UsersTable], { force: true })

    expect(plan.status).toBe('changes-needed')
    const usersEntry = plan.entries.find(e => e.name === 'users')
    expect(usersEntry).toBeDefined()
    expect(usersEntry!.status).toBe('create')
    expect(usersEntry!.columnsToAdd.length).toBeGreaterThan(0)
  })

  it('should separate views from tables in plan output', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    const viewEntry = plan.entries.find(e => e.name === 'active_users')
    expect(viewEntry).toBeDefined()
    expect(viewEntry!.viewType).toBe('V')

    const tableEntry = plan.entries.find(e => e.name === 'users')
    expect(tableEntry).toBeDefined()
    expect(tableEntry!.viewType).toBeUndefined()
  })

  it('should mark new views as create in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    const viewEntry = plan.entries.find(e => e.name === 'active_users')
    expect(viewEntry).toBeDefined()
    expect(viewEntry!.status).toBe('create')
  })

  it('should mark existing views as in-sync in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    const viewEntry = plan.entries.find(e => e.name === 'active_users')
    expect(viewEntry).toBeDefined()
    expect(viewEntry!.status).toBe('in-sync')
  })

  it('should detect removed views in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable], { force: true })

    expect(plan.status).toBe('changes-needed')
    const drops = plan.entries.filter(e => e.status === 'drop')
    expect(drops).toHaveLength(1)
    expect(drops[0].name).toBe('active_users')
    expect(drops[0].viewType).toBe('V')
    expect(drops[0].destructive).toBe(false)
  })

  it('should detect removed tables in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable, ActiveUsersView], { force: true })

    expect(plan.status).toBe('changes-needed')
    const tableDrops = plan.entries.filter(e => e.status === 'drop' && !e.viewType)
    expect(tableDrops).toHaveLength(1)
    expect(tableDrops[0].name).toBe('profiles')
    expect(tableDrops[0].destructive).toBe(true)

    const viewDrops = plan.entries.filter(e => e.status === 'drop' && e.viewType)
    expect(viewDrops).toHaveLength(0)
  })

  it('should hide destructive ops in safe mode', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    await sync.run([UsersTable, ProfileTable, ActiveUsersView], { force: true })
    const plan = await sync.plan([UsersTable], { force: true, safe: true })

    const drops = plan.entries.filter(e => e.status === 'drop')
    expect(drops).toHaveLength(0)
    for (const e of plan.entries) {
      expect(e.columnsToDrop).toEqual([])
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
    const drops = plan.entries.filter(e => e.status === 'drop')
    expect(drops).toHaveLength(1)
    expect(drops[0].name).toBe('old_table')
    // Old format entries are treated as tables (not views)
    expect(drops[0].viewType).toBeUndefined()
    expect(drops[0].destructive).toBe(true)
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

// ── External views ──────────────────────────────────────────────────────

describe('SchemaSync — external views', () => {
  it('should mark external view as in-sync when it exists in DB', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    // Simulate the view existing in the DB by pre-populating columns
    const adapter = space.get(LegacyReportView).dbAdapter as MockAdapter
    adapter.setExistingColumns([
      { name: 'id', type: 'INTEGER', notnull: true, pk: true },
      { name: 'total', type: 'INTEGER', notnull: true, pk: false },
    ])

    const result = await sync.run([UsersTable, LegacyReportView], { force: true })
    const entry = result.entries.find(e => e.name === 'legacy_report')
    expect(entry).toBeDefined()
    expect(entry!.viewType).toBe('E')
    expect(entry!.status).toBe('in-sync')
  })

  it('should mark external view as error when it does not exist in DB', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const result = await sync.run([UsersTable, LegacyReportView], { force: true })
    const entry = result.entries.find(e => e.name === 'legacy_report')
    expect(entry).toBeDefined()
    expect(entry!.viewType).toBe('E')
    expect(entry!.status).toBe('error')
    expect(entry!.errors[0]).toContain('not found')
  })

  it('should mark external view as error when columns are missing', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    // View exists but is missing the 'total' column
    const adapter = space.get(LegacyReportView).dbAdapter as MockAdapter
    adapter.setExistingColumns([
      { name: 'id', type: 'INTEGER', notnull: true, pk: true },
    ])

    const result = await sync.run([UsersTable, LegacyReportView], { force: true })
    const entry = result.entries.find(e => e.name === 'legacy_report')
    expect(entry).toBeDefined()
    expect(entry!.status).toBe('error')
    expect(entry!.errors[0]).toContain('total')
  })

  it('should check external views in plan', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    // External view exists
    const adapter = space.get(LegacyReportView).dbAdapter as MockAdapter
    adapter.setExistingColumns([
      { name: 'id', type: 'INTEGER', notnull: true, pk: true },
      { name: 'total', type: 'INTEGER', notnull: true, pk: false },
    ])

    const plan = await sync.plan([UsersTable, LegacyReportView], { force: true })
    const entry = plan.entries.find(e => e.name === 'legacy_report')
    expect(entry).toBeDefined()
    expect(entry!.viewType).toBe('E')
    expect(entry!.status).toBe('in-sync')
  })

  it('should never drop external views when removed from schema', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    // First sync with external view
    const adapter = space.get(LegacyReportView).dbAdapter as MockAdapter
    adapter.setExistingColumns([
      { name: 'id', type: 'INTEGER', notnull: true, pk: true },
      { name: 'total', type: 'INTEGER', notnull: true, pk: false },
    ])
    await sync.run([UsersTable, LegacyReportView], { force: true })

    // Second sync without external view — should NOT generate a drop entry
    const result = await sync.run([UsersTable], { force: true })
    const drops = result.entries.filter(e => e.status === 'drop')
    expect(drops).toHaveLength(0)
  })

  it('should track external views with viewType E in control table', async () => {
    const space = createSpace()
    const sync = new SchemaSync(space)

    const adapter = space.get(LegacyReportView).dbAdapter as MockAdapter
    adapter.setExistingColumns([
      { name: 'id', type: 'INTEGER', notnull: true, pk: true },
      { name: 'total', type: 'INTEGER', notnull: true, pk: false },
    ])
    await sync.run([UsersTable, LegacyReportView], { force: true })

    const controlRows = sharedTables.get('__atscript_control')!
    const trackedRow = controlRows.find(r => r.key === 'synced_tables')
    const tracked = JSON.parse(trackedRow!.value as string) as Array<{ name: string; isView: boolean; viewType?: string }>

    const extEntry = tracked.find(t => t.name === 'legacy_report')
    expect(extEntry).toBeDefined()
    expect(extEntry!.isView).toBe(true)
    expect(extEntry!.viewType).toBe('E')
  })
})
