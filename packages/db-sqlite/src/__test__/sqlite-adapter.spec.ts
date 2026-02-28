import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { AtscriptDbTable } from '@atscript/utils-db'

import { SqliteAdapter } from '../sqlite-adapter'
import { BetterSqlite3Driver } from '../better-sqlite3-driver'

import { prepareFixtures } from './test-utils'

// Populated by beforeAll after fixtures are compiled
let UsersTable: any
let NoTableAnnotation: any

describe('SqliteAdapter + AtscriptDbTable', () => {
  let driver: BetterSqlite3Driver
  let adapter: SqliteAdapter
  let table: AtscriptDbTable

  beforeAll(async () => {
    await prepareFixtures()
    const fixtures = await import('./fixtures/test-table.as.js')
    UsersTable = fixtures.UsersTable
    NoTableAnnotation = fixtures.NoTableAnnotation
  })

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:')
    adapter = new SqliteAdapter(driver)
    table = new AtscriptDbTable(UsersTable, adapter)
  })

  afterEach(() => {
    driver.close()
  })

  // ── Schema operations ──────────────────────────────────────────────────

  describe('ensureTable', () => {
    it('should create the table', async () => {
      await table.ensureTable()

      // Verify table exists via PRAGMA
      const tables = driver.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
      )
      expect(tables.length).toBe(1)
    })

    it('should create columns matching the type definition', async () => {
      await table.ensureTable()

      const columns = driver.all<{ name: string; type: string; notnull: number }>(
        `PRAGMA table_info("users")`
      )
      const colNames = columns.map(c => c.name)

      // Physical column name for email is "email_address" (from @db.column)
      expect(colNames).toContain('id')
      expect(colNames).toContain('email_address')
      expect(colNames).toContain('name')
      expect(colNames).toContain('createdAt')
      expect(colNames).toContain('status')
      expect(colNames).toContain('bio')

      // displayName should NOT exist (@db.ignore)
      expect(colNames).not.toContain('displayName')
    })

    it('should set the primary key', async () => {
      await table.ensureTable()

      const columns = driver.all<{ name: string; pk: number }>(
        `PRAGMA table_info("users")`
      )
      const pkCol = columns.find(c => c.pk === 1)
      expect(pkCol?.name).toBe('id')
    })

    it('should be idempotent', async () => {
      await table.ensureTable()
      await table.ensureTable() // should not throw
    })
  })

  describe('syncIndexes', () => {
    it('should create indexes from @db.index annotations', async () => {
      await table.ensureTable()
      await table.syncIndexes()

      const indexes = driver.all<{ name: string }>(
        `PRAGMA index_list("users")`
      )
      const indexNames = indexes.map(i => i.name)

      // Index names use the full key format: atscript__<type>__<name>
      expect(indexNames).toContain('atscript__unique__email_idx')
      expect(indexNames).toContain('atscript__plain__name_idx')
      expect(indexNames).toContain('atscript__plain__created_idx')
      // fulltext indexes are skipped for basic SQLite
    })

    it('should create unique indexes for @db.index.unique', async () => {
      await table.ensureTable()
      await table.syncIndexes()

      const indexes = driver.all<{ name: string; unique: number }>(
        `PRAGMA index_list("users")`
      )
      const emailIdx = indexes.find(i => i.name === 'atscript__unique__email_idx')
      expect(emailIdx?.unique).toBe(1)
    })

    it('should be idempotent', async () => {
      await table.ensureTable()
      await table.syncIndexes()
      await table.syncIndexes() // should not throw or duplicate
    })
  })

  // ── CRUD operations ────────────────────────────────────────────────────

  describe('insertOne', () => {
    beforeEach(async () => {
      await table.ensureTable()
    })

    it('should insert a record and return the ID', async () => {
      const result = await table.insertOne({
        id: 1,
        email: 'john@example.com',
        name: 'John',
        createdAt: 1000,
        status: 'active',
      } as any)
      expect(result.insertedId).toBeDefined()
    })

    it('should apply column mapping (@db.column)', async () => {
      await table.insertOne({
        id: 1,
        email: 'john@example.com',
        name: 'John',
        createdAt: 1000,
        status: 'active',
      } as any)

      // Read raw row — email should be stored as email_address
      const row = driver.get<Record<string, unknown>>(
        `SELECT * FROM users WHERE id = 1`
      )
      expect(row?.email_address).toBe('john@example.com')
      expect(row?.email).toBeUndefined()
    })

    it('should strip ignored fields (@db.ignore)', async () => {
      await table.insertOne({
        id: 1,
        email: 'john@example.com',
        name: 'John',
        createdAt: 1000,
        status: 'active',
        displayName: 'Johnny',
      } as any)

      const row = driver.get<Record<string, unknown>>(
        `SELECT * FROM users WHERE id = 1`
      )
      expect(row?.displayName).toBeUndefined()
    })

    it('should apply default values (@db.default.value)', async () => {
      await table.insertOne({
        id: 1,
        email: 'john@example.com',
        name: 'John',
        createdAt: 1000,
      } as any)

      const row = driver.get<Record<string, unknown>>(
        `SELECT * FROM users WHERE id = 1`
      )
      expect(row?.status).toBe('active')
    })
  })

  describe('insertMany', () => {
    beforeEach(async () => {
      await table.ensureTable()
    })

    it('should insert multiple records in a transaction', async () => {
      const result = await table.insertMany([
        { id: 1, email: 'a@example.com', name: 'A', createdAt: 1000, status: 'active' },
        { id: 2, email: 'b@example.com', name: 'B', createdAt: 2000, status: 'active' },
      ] as any[])

      expect(result.insertedCount).toBe(2)

      const count = await table.count({})
      expect(count).toBe(2)
    })
  })

  describe('findOne', () => {
    beforeEach(async () => {
      await table.ensureTable()
      await table.insertOne({
        id: 1,
        email: 'john@example.com',
        name: 'John',
        createdAt: 1000,
        status: 'active',
      } as any)
    })

    it('should find a record by filter', async () => {
      const result = await table.findOne({ id: 1 })
      expect(result).not.toBeNull()
      expect((result as any).name).toBe('John')
    })

    it('should return null when not found', async () => {
      const result = await table.findOne({ id: 999 })
      expect(result).toBeNull()
    })
  })

  describe('findMany', () => {
    beforeEach(async () => {
      await table.ensureTable()
      await table.insertMany([
        { id: 1, email: 'a@x.com', name: 'Alice', createdAt: 1000, status: 'active' },
        { id: 2, email: 'b@x.com', name: 'Bob', createdAt: 2000, status: 'inactive' },
        { id: 3, email: 'c@x.com', name: 'Charlie', createdAt: 3000, status: 'active' },
      ] as any[])
    })

    it('should find records matching filter', async () => {
      const results = await table.findMany({ status: 'active' })
      expect(results.length).toBe(2)
    })

    it('should respect limit option', async () => {
      const results = await table.findMany({}, { limit: 2 })
      expect(results.length).toBe(2)
    })

    it('should respect skip option', async () => {
      const results = await table.findMany({}, { limit: 2, skip: 1 })
      expect(results.length).toBe(2)
    })

    it('should respect sort option', async () => {
      const results = await table.findMany({}, { sort: { createdAt: -1 } })
      expect((results[0] as any).name).toBe('Charlie')
      expect((results[2] as any).name).toBe('Alice')
    })

    it('should handle $or filter', async () => {
      const results = await table.findMany({
        $or: [{ name: 'Alice' }, { name: 'Charlie' }],
      })
      expect(results.length).toBe(2)
    })

    it('should handle $gt filter', async () => {
      const results = await table.findMany({ createdAt: { $gt: 1500 } })
      expect(results.length).toBe(2)
    })

    it('should handle $in filter', async () => {
      const results = await table.findMany({
        name: { $in: ['Alice', 'Bob'] },
      })
      expect(results.length).toBe(2)
    })
  })

  describe('count', () => {
    beforeEach(async () => {
      await table.ensureTable()
      await table.insertMany([
        { id: 1, email: 'a@x.com', name: 'Alice', createdAt: 1000, status: 'active' },
        { id: 2, email: 'b@x.com', name: 'Bob', createdAt: 2000, status: 'active' },
        { id: 3, email: 'c@x.com', name: 'Charlie', createdAt: 3000, status: 'inactive' },
      ] as any[])
    })

    it('should count all records', async () => {
      expect(await table.count()).toBe(3)
    })

    it('should count records matching filter', async () => {
      expect(await table.count({ status: 'active' })).toBe(2)
    })
  })

  describe('updateMany', () => {
    beforeEach(async () => {
      await table.ensureTable()
      await table.insertMany([
        { id: 1, email: 'a@x.com', name: 'Alice', createdAt: 1000, status: 'active' },
        { id: 2, email: 'b@x.com', name: 'Bob', createdAt: 2000, status: 'active' },
      ] as any[])
    })

    it('should update matching records', async () => {
      const result = await table.updateMany(
        { status: 'active' },
        { status: 'suspended' }
      )
      expect(result.modifiedCount).toBe(2)

      const rows = await table.findMany({ status: 'suspended' })
      expect(rows.length).toBe(2)
    })
  })

  describe('deleteOne', () => {
    beforeEach(async () => {
      await table.ensureTable()
      await table.insertOne({
        id: 1,
        email: 'john@example.com',
        name: 'John',
        createdAt: 1000,
        status: 'active',
      } as any)
    })

    it('should delete a record by primary key', async () => {
      const result = await table.deleteOne(1)
      expect(result.deletedCount).toBe(1)

      const row = await table.findOne({ id: 1 })
      expect(row).toBeNull()
    })
  })

  describe('deleteMany', () => {
    beforeEach(async () => {
      await table.ensureTable()
      await table.insertMany([
        { id: 1, email: 'a@x.com', name: 'Alice', createdAt: 1000, status: 'inactive' },
        { id: 2, email: 'b@x.com', name: 'Bob', createdAt: 2000, status: 'inactive' },
        { id: 3, email: 'c@x.com', name: 'Charlie', createdAt: 3000, status: 'active' },
      ] as any[])
    })

    it('should delete matching records', async () => {
      const result = await table.deleteMany({ status: 'inactive' })
      expect(result.deletedCount).toBe(2)

      const count = await table.count()
      expect(count).toBe(1)
    })
  })

  // ── Driver swappability ────────────────────────────────────────────────

  describe('driver swappability', () => {
    it('should work with a custom TSqliteDriver implementation', async () => {
      // Create a minimal mock driver that wraps BetterSqlite3Driver
      const innerDriver = new BetterSqlite3Driver(':memory:')
      const calls: string[] = []

      const customDriver = {
        run(sql: string, params?: unknown[]) {
          calls.push(`run: ${sql.slice(0, 30)}`)
          return innerDriver.run(sql, params)
        },
        all<T>(sql: string, params?: unknown[]): T[] {
          calls.push(`all: ${sql.slice(0, 30)}`)
          return innerDriver.all<T>(sql, params)
        },
        get<T>(sql: string, params?: unknown[]): T | null {
          calls.push(`get: ${sql.slice(0, 30)}`)
          return innerDriver.get<T>(sql, params)
        },
        exec(sql: string) {
          calls.push(`exec: ${sql.slice(0, 30)}`)
          return innerDriver.exec(sql)
        },
        close() {
          calls.push('close')
          innerDriver.close()
        },
      }

      const customAdapter = new SqliteAdapter(customDriver)
      const customTable = new AtscriptDbTable(UsersTable, customAdapter)

      await customTable.ensureTable()
      await customTable.insertOne({
        id: 1,
        email: 'test@example.com',
        name: 'Test',
        createdAt: 1000,
        status: 'active',
      } as any)

      const result = await customTable.findOne({ id: 1 })
      expect(result).not.toBeNull()
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.some(c => c.startsWith('exec:'))).toBe(true)
      expect(calls.some(c => c.startsWith('run:'))).toBe(true)
      expect(calls.some(c => c.startsWith('get:'))).toBe(true)

      customDriver.close()
    })
  })

  // ── NoTableAnnotation fallback ─────────────────────────────────────────

  describe('NoTableAnnotation fallback', () => {
    it('should use interface name when @db.table is missing', () => {
      const d = new BetterSqlite3Driver(':memory:')
      const a = new SqliteAdapter(d)
      const t = new AtscriptDbTable(NoTableAnnotation, a)
      expect(t.tableName).toBe('NoTableAnnotation')
      d.close()
    })
  })
})
