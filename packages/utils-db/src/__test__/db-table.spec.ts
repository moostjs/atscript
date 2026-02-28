import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

import { AtscriptDbTable } from '../db-table'
import { BaseDbAdapter } from '../base-adapter'
import type {
  TDbFilter,
  TDbFindOptions,
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
} from '../types'

// @ts-expect-error — test fixture
import { UsersTable, NoTableAnnotation } from './fixtures/test-table.as'

// ── Mock adapter ────────────────────────────────────────────────────────────

class MockAdapter extends BaseDbAdapter {
  public calls: Array<{ method: string; args: any[] }> = []

  private record(method: string, ...args: any[]) {
    this.calls.push({ method, args })
  }

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    this.record('insertOne', data)
    return { insertedId: 1 }
  }

  async insertMany(data: Record<string, unknown>[]): Promise<TDbInsertManyResult> {
    this.record('insertMany', data)
    return { insertedCount: data.length, insertedIds: data.map((_, i) => i + 1) }
  }

  async replaceOne(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this.record('replaceOne', filter, data)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async updateOne(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this.record('updateOne', filter, data)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async deleteOne(filter: TDbFilter): Promise<TDbDeleteResult> {
    this.record('deleteOne', filter)
    return { deletedCount: 1 }
  }

  async findOne(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Record<string, unknown> | null> {
    this.record('findOne', filter, options)
    return { id: 1, name: 'test' }
  }

  async findMany(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Record<string, unknown>[]> {
    this.record('findMany', filter, options)
    return [{ id: 1, name: 'test' }]
  }

  async count(filter: TDbFilter): Promise<number> {
    this.record('count', filter)
    return 42
  }

  async updateMany(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this.record('updateMany', filter, data)
    return { matchedCount: 5, modifiedCount: 5 }
  }

  async replaceMany(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this.record('replaceMany', filter, data)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async deleteMany(filter: TDbFilter): Promise<TDbDeleteResult> {
    this.record('deleteMany', filter)
    return { deletedCount: 3 }
  }

  async syncIndexes(): Promise<void> {
    this.record('syncIndexes')
  }

  async ensureTable(): Promise<void> {
    this.record('ensureTable')
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AtscriptDbTable', () => {
  let adapter: MockAdapter
  let table: AtscriptDbTable

  beforeEach(() => {
    adapter = new MockAdapter()
    table = new AtscriptDbTable(UsersTable, adapter)
  })

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should extract table name from @db.table', () => {
      expect(table.tableName).toBe('users')
    })

    it('should extract schema from @db.schema', () => {
      expect(table.schema).toBe('auth')
    })

    it('should register itself with the adapter', () => {
      // The adapter should have a back-reference
      expect((adapter as any)._table).toBe(table)
    })

    it('should fall back to interface name when @db.table has no name arg', () => {
      const a = new MockAdapter()
      const t = new AtscriptDbTable(NoTableAnnotation, a)
      expect(t.tableName).toBe('NoTableAnnotation')
    })

    it('should throw for non-annotated types', () => {
      expect(() => new AtscriptDbTable({} as any, new MockAdapter())).toThrow(
        'Atscript Annotated Type expected'
      )
    })
  })

  // ── Metadata ──────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should compute flatMap with all fields', () => {
      const keys = [...table.flatMap.keys()]
      expect(keys).toContain('id')
      expect(keys).toContain('email')
      expect(keys).toContain('name')
      expect(keys).toContain('createdAt')
      expect(keys).toContain('displayName')
      expect(keys).toContain('status')
      expect(keys).toContain('bio')
    })

    it('should extract primary keys from @meta.id', () => {
      expect([...table.primaryKeys]).toEqual(['id'])
    })

    it('should extract column mappings from @db.column', () => {
      expect(table.columnMap.get('email')).toBe('email_address')
    })

    it('should extract defaults from @db.default.value', () => {
      const statusDefault = table.defaults.get('status')
      expect(statusDefault).toEqual({ kind: 'value', value: 'active' })
    })

    it('should extract defaults from @db.default.fn', () => {
      const createdAtDefault = table.defaults.get('createdAt')
      expect(createdAtDefault).toEqual({ kind: 'fn', fn: 'now' })
    })

    it('should extract ignored fields from @db.ignore', () => {
      expect(table.ignoredFields.has('displayName')).toBe(true)
      expect(table.ignoredFields.has('name')).toBe(false)
    })

    it('should extract unique props from single-field unique indexes', () => {
      expect(table.uniqueProps.has('email')).toBe(true)
    })

    it('should return ID descriptor', () => {
      const desc = table.getIdDescriptor()
      expect(desc.fields).toEqual(['id'])
      expect(desc.isComposite).toBe(false)
    })
  })

  // ── Indexes ───────────────────────────────────────────────────────────

  describe('indexes', () => {
    it('should compute indexes from @db.index.*', () => {
      const indexes = table.indexes
      expect(indexes.size).toBeGreaterThan(0)
    })

    it('should create unique index for @db.index.unique', () => {
      const indexes = [...table.indexes.values()]
      const emailIdx = indexes.find(i => i.name === 'email_idx')
      expect(emailIdx).toBeDefined()
      expect(emailIdx!.type).toBe('unique')
      expect(emailIdx!.fields).toEqual([{ name: 'email', sort: 'asc' }])
    })

    it('should create composite plain index when fields share a name', () => {
      const indexes = [...table.indexes.values()]
      const nameIdx = indexes.find(i => i.name === 'name_idx')
      expect(nameIdx).toBeDefined()
      expect(nameIdx!.type).toBe('plain')
      expect(nameIdx!.fields.length).toBe(2)
      expect(nameIdx!.fields.map(f => f.name)).toContain('name')
      expect(nameIdx!.fields.map(f => f.name)).toContain('createdAt')
    })

    it('should respect sort direction in @db.index.plain', () => {
      const indexes = [...table.indexes.values()]
      const createdIdx = indexes.find(i => i.name === 'created_idx')
      expect(createdIdx).toBeDefined()
      expect(createdIdx!.fields[0].sort).toBe('desc')
    })

    it('should create fulltext index for @db.index.fulltext', () => {
      const indexes = [...table.indexes.values()]
      const searchIdx = indexes.find(i => i.name === 'search_idx')
      expect(searchIdx).toBeDefined()
      expect(searchIdx!.type).toBe('fulltext')
      expect(searchIdx!.fields).toEqual([{ name: 'bio', sort: 'asc' }])
    })
  })

  // ── CRUD ──────────────────────────────────────────────────────────────

  describe('CRUD operations', () => {
    it('should delegate findOne to adapter', async () => {
      const result = await table.findOne({ id: 1 })
      expect(adapter.calls[0].method).toBe('findOne')
      expect(adapter.calls[0].args[0]).toEqual({ id: 1 })
      expect(result).toEqual({ id: 1, name: 'test' })
    })

    it('should delegate findMany to adapter', async () => {
      await table.findMany({ name: 'test' }, { limit: 10 })
      expect(adapter.calls[0].method).toBe('findMany')
      expect(adapter.calls[0].args[0]).toEqual({ name: 'test' })
      expect(adapter.calls[0].args[1]).toEqual({ limit: 10 })
    })

    it('should delegate count to adapter', async () => {
      const result = await table.count({ status: 'active' })
      expect(adapter.calls[0].method).toBe('count')
      expect(result).toBe(42)
    })

    it('should delegate deleteOne with prepared ID', async () => {
      await table.deleteOne(123)
      expect(adapter.calls[0].method).toBe('deleteOne')
      expect(adapter.calls[0].args[0]).toEqual({ id: 123 })
    })

    it('should delegate deleteMany to adapter', async () => {
      await table.deleteMany({ status: 'inactive' })
      expect(adapter.calls[0].method).toBe('deleteMany')
    })

    it('should delegate syncIndexes to adapter', async () => {
      await table.syncIndexes()
      expect(adapter.calls[0].method).toBe('syncIndexes')
    })

    it('should delegate ensureTable to adapter', async () => {
      await table.ensureTable()
      expect(adapter.calls[0].method).toBe('ensureTable')
    })
  })

  // ── Write preparation ─────────────────────────────────────────────────

  describe('write preparation', () => {
    it('should strip ignored fields on insert', async () => {
      await table.insertOne({
        id: 1,
        email: 'test@example.com',
        name: 'John',
        createdAt: 12345,
        displayName: 'Johnny',
        status: 'active',
      } as any)

      const insertCall = adapter.calls[0]
      expect(insertCall.method).toBe('insertOne')
      // displayName should be stripped (@db.ignore)
      expect(insertCall.args[0].displayName).toBeUndefined()
    })

    it('should map column names on insert', async () => {
      await table.insertOne({
        id: 1,
        email: 'test@example.com',
        name: 'John',
        createdAt: 12345,
        status: 'active',
      } as any)

      const insertCall = adapter.calls[0]
      // email should be mapped to email_address (@db.column)
      expect(insertCall.args[0].email_address).toBe('test@example.com')
      expect(insertCall.args[0].email).toBeUndefined()
    })

    it('should apply default values on insert when field is missing', async () => {
      await table.insertOne({
        id: 1,
        email: 'test@example.com',
        name: 'John',
        createdAt: 12345,
      } as any)

      const insertCall = adapter.calls[0]
      // status should get default value "active" (@db.default.value)
      expect(insertCall.args[0].status).toBe('active')
    })
  })

  // ── Adapter back-reference ────────────────────────────────────────────

  describe('adapter back-reference', () => {
    it('should allow adapter to access table metadata', () => {
      // Access flatMap to trigger flattening
      table.flatMap

      // Adapter should be able to read metadata via this._table
      expect((adapter as any)._table.tableName).toBe('users')
      expect((adapter as any)._table.schema).toBe('auth')
      expect((adapter as any)._table.primaryKeys).toEqual(['id'])
    })

    it('should allow adapter to access indexes', () => {
      const adapterTable = (adapter as any)._table as AtscriptDbTable
      expect(adapterTable.indexes.size).toBeGreaterThan(0)
    })
  })

  // ── Adapter hooks ─────────────────────────────────────────────────────

  describe('adapter hooks', () => {
    it('should call onBeforeFlatten during flatten', () => {
      const hookAdapter = new MockAdapter()
      hookAdapter.onBeforeFlatten = vi.fn()
      const t = new AtscriptDbTable(UsersTable, hookAdapter)
      t.flatMap // trigger flatten
      expect(hookAdapter.onBeforeFlatten).toHaveBeenCalledWith(UsersTable)
    })

    it('should call onFieldScanned for each field', () => {
      const hookAdapter = new MockAdapter()
      hookAdapter.onFieldScanned = vi.fn()
      const t = new AtscriptDbTable(UsersTable, hookAdapter)
      t.flatMap // trigger flatten
      expect(hookAdapter.onFieldScanned).toHaveBeenCalled()
      // Should be called for each field (id, email, name, createdAt, displayName, status, bio)
      expect((hookAdapter.onFieldScanned as any).mock.calls.length).toBe(7)
    })

    it('should call onAfterFlatten after flatten', () => {
      const hookAdapter = new MockAdapter()
      hookAdapter.onAfterFlatten = vi.fn()
      const t = new AtscriptDbTable(UsersTable, hookAdapter)
      t.flatMap // trigger flatten
      expect(hookAdapter.onAfterFlatten).toHaveBeenCalled()
    })

    it('should use adapter getAdapterTableName when provided', () => {
      const hookAdapter = new MockAdapter()
      hookAdapter.getAdapterTableName = () => 'custom_users'
      const t = new AtscriptDbTable(UsersTable, hookAdapter)
      expect(t.tableName).toBe('custom_users')
    })
  })
})
