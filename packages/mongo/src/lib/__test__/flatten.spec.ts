import { beforeAll, describe, expect, it } from 'vitest'
import { AsMongo } from '../as-mongo.js'
import { prepareFixtures } from './test-utils.js'

let mongo = new AsMongo('mongodb+srv://dummy:dummy@test.jd1qx.mongodb.net/test?')

describe('asCollection flatten', () => {
  beforeAll(prepareFixtures)
  it('must flatten correctly', async () => {
    const { FlattenTest } = await import('./fixtures/flatten-test.as.js')
    const c = mongo.getCollection(FlattenTest)
    expect(c.flatMap.has('level0')).toBe(true)
    expect(c.flatMap.has('nested')).toBe(true)
    expect(c.flatMap.has('nested.level1')).toBe(true)
    expect(c.flatMap.has('nested.array1')).toBe(true)
    expect(c.flatMap.has('array0')).toBe(true)
    expect(c.flatMap.has('array0.level1')).toBe(true)
    expect(c.flatMap.has('nested.array1.level2')).toBe(true)
    expect(c.flatMap.has('nested.array1.array2')).toBe(true)
    expect(c.flatMap.has('nested.array1.array2.level3')).toBe(true)
    expect(c.flatMap.has('complexArray')).toBe(true)
    expect(c.flatMap.has('complexArray.field1')).toBe(true)
    expect(c.flatMap.has('complexArray.field2')).toBe(true)
    // @ts-expect-error
    expect(c.flatMap.get('complexArray.field1')?.type?.items).toHaveLength(2)
    // @ts-expect-error
    expect(c.flatMap.get('complexArray.field1')?.type?.items[0]?.type?.designType).toBe('string')
    // @ts-expect-error
    expect(c.flatMap.get('complexArray.field1')?.type?.items[1]?.type?.designType).toBe('number')
  })
})
