import { ObjectId } from 'mongodb'
import { describe, it, expect, beforeAll, vi } from 'vitest'

import { AsMongo } from '../as-mongo'
import { buildMongoFilter } from '../mongo-filter'
import { prepareFixtures } from './test-utils'

const mongo = new AsMongo('mongodb+srv://dummy:dummy@test.jd1qx.mongodb.net/test?')

describe('[mongo] @meta.id, auto-increment, and _id as PK', () => {
  beforeAll(prepareFixtures)

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
      const hexStr = 'a'.repeat(24)
      const fieldType = table.flatMap.get('_id')!
      const result = adapter.prepareId(hexStr, fieldType)
      expect(result).toBeInstanceOf(ObjectId)
      expect(result.toString()).toBe(hexStr)
    })

    it('prepareId should convert string to number for id field', () => {
      const fieldType = table.flatMap.get('id')!
      const result = adapter.prepareId('42', fieldType)
      expect(result).toBe(42)
    })

    describe('findById', () => {
      it('should find by ObjectId string (_id primary key path)', async () => {
        const hexStr = 'a'.repeat(24)
        const expectedDoc = { _id: new ObjectId(hexStr), id: 1, title: 'test', completed: false }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        const result = await table.findById(hexStr)

        expect(findOneSpy).toHaveBeenCalledOnce()
        const query = findOneSpy.mock.calls[0][0]
        // The filter should have _id as ObjectId (check via toString)
        expect(query.filter._id).toBeDefined()
        expect(query.filter._id.toString()).toBe(hexStr)
        expect(result).toEqual(expectedDoc)

        findOneSpy.mockRestore()
      })

      it('should fallback to unique prop for numeric id string', async () => {
        const expectedDoc = { _id: new ObjectId(), id: 5, title: 'test', completed: false }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)

        // "5" is not a valid ObjectId → prepareId throws → pkValid = false → fallback to uniqueProps
        const result = await table.findById('5')

        expect(findOneSpy).toHaveBeenCalledOnce()
        const query = findOneSpy.mock.calls[0][0]
        // Should use $or with unique props, id coerced to number
        expect(query.filter.$or).toBeDefined()
        expect(query.filter.$or).toEqual([{ id: 5 }])
        expect(result).toEqual(expectedDoc)

        findOneSpy.mockRestore()
      })

      it('should return null when not found', async () => {
        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(null)

        const result = await table.findById('b'.repeat(24))
        expect(result).toBeNull()

        findOneSpy.mockRestore()
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
      it('should find by ObjectId string (_id primary key path)', async () => {
        const hexStr = 'c'.repeat(24)
        const expectedDoc = { _id: new ObjectId(hexStr), code: 'X1', name: 'Item' }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        const result = await table.findById(hexStr)

        const query = findOneSpy.mock.calls[0][0]
        expect(query.filter._id).toBeDefined()
        expect(query.filter._id.toString()).toBe(hexStr)
        expect(result).toEqual(expectedDoc)

        findOneSpy.mockRestore()
      })

      it('should fallback to unique prop for string code', async () => {
        const expectedDoc = { _id: new ObjectId(), code: 'ABC', name: 'Item' }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        // "ABC" is not a valid ObjectId → fallback to uniqueProps
        const result = await table.findById('ABC')

        const query = findOneSpy.mock.calls[0][0]
        expect(query.filter.$or).toEqual([{ code: 'ABC' }])
        expect(result).toEqual(expectedDoc)

        findOneSpy.mockRestore()
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
        const hexStr = 'd'.repeat(24)
        const expectedDoc = { _id: new ObjectId(hexStr), name: 'Test' }

        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(expectedDoc)
        const result = await table.findById(hexStr)

        const query = findOneSpy.mock.calls[0][0]
        expect(query.filter._id).toBeDefined()
        expect(query.filter._id.toString()).toBe(hexStr)
        expect(result).toEqual(expectedDoc)

        findOneSpy.mockRestore()
      })

      it('should return null for invalid ObjectId (no unique fallback)', async () => {
        const findOneSpy = vi.spyOn(adapter, 'findOne').mockResolvedValue(null)

        // "bad" is not a valid ObjectId and there are no uniqueProps
        const result = await table.findById('bad')

        // prepareId throws → pkValid=false → no uniqueProps → returns null
        expect(result).toBeNull()
        expect(findOneSpy).not.toHaveBeenCalled()

        findOneSpy.mockRestore()
      })
    })
  })

  describe('buildMongoFilter with ObjectId', () => {
    it('should preserve ObjectId as leaf value in equality filter', () => {
      const oid = new ObjectId('a'.repeat(24))
      const result = buildMongoFilter({ _id: oid } as any)
      expect(result).toEqual({ _id: oid })
      expect(result._id).toBeInstanceOf(ObjectId)
    })

    it('should handle ObjectId in $or filter', () => {
      const oid = new ObjectId('b'.repeat(24))
      const result = buildMongoFilter({ $or: [{ _id: oid }, { id: 5 }] } as any)
      expect(result.$or).toEqual([{ _id: oid }, { id: 5 }])
    })

    it('should handle mixed ObjectId and primitive filters', () => {
      const oid = new ObjectId('c'.repeat(24))
      const result = buildMongoFilter({ _id: oid, name: 'test' } as any)
      // Two equality conditions → $and
      expect(result.$and).toEqual([{ _id: oid }, { name: 'test' }])
    })
  })
})
