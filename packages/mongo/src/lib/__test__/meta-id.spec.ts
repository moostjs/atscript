import { ObjectId } from 'mongodb'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

import { AsMongo } from '../as-mongo'
import { buildMongoFilter } from '../mongo-filter'
import { prepareFixtures } from './test-utils'

const mongo = new AsMongo('mongodb+srv://dummy:dummy@test.jd1qx.mongodb.net/test?')

const HEX_A = 'a'.repeat(24)
const HEX_B = 'b'.repeat(24)
const HEX_C = 'c'.repeat(24)
const HEX_D = 'd'.repeat(24)

describe('[mongo] @meta.id, auto-increment, and _id as PK', () => {
  beforeAll(prepareFixtures)
  afterEach(() => vi.restoreAllMocks())

  describe('TodoCollection (ObjectId _id + numeric @meta.id with increment)', () => {
    let table: ReturnType<typeof mongo.getTable>
    let adapter: ReturnType<typeof mongo.getAdapter>

    beforeAll(async () => {
      const { TodoCollection } = await import('./fixtures/meta-id-collection.as.js')
      table = mongo.getTable(TodoCollection)
      adapter = mongo.getAdapter(TodoCollection)
    })

    it('should have _id as the only primary key', () => {
      expect(table.primaryKeys).toEqual(['_id'])
    })

    it('should have _id in flatMap', () => {
      expect(table.flatMap.has('_id')).toBe(true)
    })

    it('should have id as a unique prop (not a primary key)', () => {
      expect(table.uniqueProps.has('id')).toBe(true)
      expect(table.primaryKeys).not.toContain('id')
    })

    it('should track increment fields', () => {
      expect(adapter['_incrementFields'].has('id')).toBe(true)
    })

    it('should have __pk unique index for @meta.id field', () => {
      const mongoIndexes = adapter['_mongoIndexes']
      let pkIndex: any
      for (const idx of mongoIndexes.values()) {
        if (idx.name === '__pk' && idx.type === 'unique') {
          pkIndex = idx
          break
        }
      }
      expect(pkIndex).toBeDefined()
      expect(pkIndex.fields).toHaveProperty('id', 1)
    })

    it('should have default values for completed', () => {
      expect(table.defaults.has('completed')).toBe(true)
    })

    it('should make id optional in insert validator (has default fn)', () => {
      const v = table.getValidator('insert')!
      expect(v.validate({ title: 'test' })).toBe(true)
    })

    it('should accept explicit id in insert validator', () => {
      const v = table.getValidator('insert')!
      expect(v.validate({ id: 5, title: 'test' })).toBe(true)
    })

    it('prepareId should convert string to ObjectId for _id', () => {
      const fieldType = table.flatMap.get('_id')!
      const result = adapter.prepareId(HEX_A, fieldType)
      expect(result).toBeInstanceOf(ObjectId)
      expect((result as ObjectId).toString()).toBe(HEX_A)
    })

    it('prepareId should convert string to number for id field', () => {
      const fieldType = table.flatMap.get('id')!
      const result = adapter.prepareId('42', fieldType)
      expect(result).toBe(42)
    })

    describe('findById', () => {
      it('should find by ObjectId string (_id primary key path)', async () => {
        const expectedDoc = { _id: new ObjectId(HEX_A), id: 1, title: 'test', completed: false }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        const result = await table.findById(HEX_A)

        expect(findOneSpy).toHaveBeenCalledOnce()
        const query = findOneSpy.mock.calls[0][0]
        // The filter should have _id as ObjectId (check via toString)
        expect((query.filter as any)._id).toBeDefined()
        expect((query.filter as any)._id.toString()).toBe(HEX_A)
        expect(result).toEqual(expectedDoc)

      })

      it('should resolve numeric id string to unique prop', async () => {
        const expectedDoc = { _id: new ObjectId(), id: 5, title: 'test', completed: false }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)

        // "5" is not a valid ObjectId → PK skipped; "5" is numeric → coerced to number for unique id field
        const result = await table.findById('5')

        expect(findOneSpy).toHaveBeenCalledOnce()
        const query = findOneSpy.mock.calls[0][0]
        // Only unique prop matches (PK failed ObjectId parse, string incompatible with number)
        expect(query.filter).toEqual({ id: 5 })
        expect(result).toEqual(expectedDoc)

      })

      it('should return null when not found', async () => {
        vi.spyOn(adapter, 'findOne').mockResolvedValue(null)

        const result = await table.findById(HEX_B)
        expect(result).toBeNull()
      })
    })
  })

  describe('ItemCollection (ObjectId _id + string @meta.id, no increment)', () => {
    let table: ReturnType<typeof mongo.getTable>
    let adapter: ReturnType<typeof mongo.getAdapter>

    beforeAll(async () => {
      const { ItemCollection } = await import('./fixtures/meta-id-collection.as.js')
      table = mongo.getTable(ItemCollection)
      adapter = mongo.getAdapter(ItemCollection)
    })

    it('should have _id as the only primary key', () => {
      expect(table.primaryKeys).toEqual(['_id'])
    })

    it('should have code as a unique prop', () => {
      expect(table.uniqueProps.has('code')).toBe(true)
      expect(table.primaryKeys).not.toContain('code')
    })

    it('should not track any increment fields', () => {
      expect(adapter['_incrementFields'].size).toBe(0)
    })

    it('prepareId should convert string to string for code field', () => {
      const fieldType = table.flatMap.get('code')!
      const result = adapter.prepareId('ABC-123', fieldType)
      expect(result).toBe('ABC-123')
    })

    describe('findById', () => {
      it('should query both PK and unique prop for ObjectId-compatible string', async () => {
        const expectedDoc = { _id: new ObjectId(HEX_C), code: 'X1', name: 'Item' }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        const result = await table.findById(HEX_C)

        const query = findOneSpy.mock.calls[0][0]
        // Both _id (ObjectId) and code (string) are type-compatible → $or
        const filter = query.filter as any
        expect(filter.$or).toBeDefined()
        expect(filter.$or[0]._id).toBeDefined()
        expect(filter.$or[0]._id.toString()).toBe(HEX_C)
        expect(filter.$or[1]).toEqual({ code: HEX_C })
        expect(result).toEqual(expectedDoc)

      })

      it('should resolve non-ObjectId string to unique prop', async () => {
        const expectedDoc = { _id: new ObjectId(), code: 'ABC', name: 'Item' }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        // "ABC" is not a valid ObjectId → PK skipped; code: string matches
        const result = await table.findById('ABC')

        const query = findOneSpy.mock.calls[0][0]
        // Only unique prop matches (PK failed ObjectId parse)
        expect(query.filter).toEqual({ code: 'ABC' })
        expect(result).toEqual(expectedDoc)

      })
    })
  })

  describe('MinimalCollection (ObjectId _id only, no @meta.id)', () => {
    let table: ReturnType<typeof mongo.getTable>
    let adapter: ReturnType<typeof mongo.getAdapter>

    beforeAll(async () => {
      const { MinimalCollection } = await import('./fixtures/simple-collection.as.js')
      table = mongo.getTable(MinimalCollection)
      adapter = mongo.getAdapter(MinimalCollection)
    })

    it('should have _id as the only primary key', () => {
      expect(table.primaryKeys).toEqual(['_id'])
    })

    it('should have no unique props', () => {
      expect(table.uniqueProps.size).toBe(0)
    })

    describe('findById', () => {
      it('should find by ObjectId string', async () => {
        const expectedDoc = { _id: new ObjectId(HEX_D), name: 'Test' }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        const result = await table.findById(HEX_D)

        const query = findOneSpy.mock.calls[0][0]
        expect((query.filter as any)._id).toBeDefined()
        expect((query.filter as any)._id.toString()).toBe(HEX_D)
        expect(result).toEqual(expectedDoc)

      })

      it('should return null for invalid ObjectId (no unique fallback)', async () => {
        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(null)

        // "bad" is not a valid ObjectId and there are no uniqueProps
        const result = await table.findById('bad')

        // prepareId throws → pkValid=false → no uniqueProps → returns null
        expect(result).toBeNull()
        expect(findOneSpy).not.toHaveBeenCalled()

      })
    })
  })

  describe('buildMongoFilter with ObjectId', () => {
    it('should preserve ObjectId as leaf value in equality filter', () => {
      const oid = new ObjectId(HEX_A)
      const result = buildMongoFilter({ _id: oid } as any)
      expect(result).toEqual({ _id: oid })
      expect(result._id).toBeInstanceOf(ObjectId)
    })

    it('should handle ObjectId in $or filter', () => {
      const oid = new ObjectId(HEX_B)
      const result = buildMongoFilter({ $or: [{ _id: oid }, { id: 5 }] } as any)
      expect(result.$or).toEqual([{ _id: oid }, { id: 5 }])
    })

    it('should handle mixed ObjectId and primitive filters', () => {
      const oid = new ObjectId(HEX_C)
      const result = buildMongoFilter({ _id: oid, name: 'test' } as any)
      // Two equality conditions → $and
      expect(result.$and).toEqual([{ _id: oid }, { name: 'test' }])
    })
  })
})
