import { describe, beforeAll, it, expect } from 'vitest'
import { prepareFixtures } from './test-utils'
import { validateMongoIdPlugin, validateMongoUniqueArrayItemsPlugin } from '../validate-plugins.js'
import { ObjectId } from 'mongodb'

const dummyId = 'a'.repeat(24)

describe('mongo validate plugins', () => {
  beforeAll(prepareFixtures)
  it('must pass ObjectId', async () => {
    const { IdPlugin } = await import('./fixtures/plugins.as.js')
    const validator = IdPlugin.validator({
      plugins: [validateMongoIdPlugin],
    })
    expect(() =>
      validator.validate({
        _id: 'a',
      })
    ).toThrowError()
    expect(() =>
      validator.validate({
        _id: dummyId,
      })
    ).not.toThrowError()
    expect(() =>
      validator.validate({
        _id: new ObjectId(),
      })
    ).not.toThrowError()
  })

  it('must validate unique array items on string array', async () => {
    const { UniqueItems } = await import('./fixtures/plugins.as.js')
    const validator = UniqueItems.validator({
      plugins: [validateMongoUniqueArrayItemsPlugin],
    })
    expect(() =>
      validator.validate({
        _id: dummyId,
        str: ['0', '0'],
      })
    ).not.toThrowError()
    expect(() =>
      validator.validate({
        _id: dummyId,
        strUnique: ['0', '0'],
      })
    ).toThrowError()
  })

  it('must validate unique array items on objects array', async () => {
    const { UniqueItems } = await import('./fixtures/plugins.as.js')
    const validator = UniqueItems.validator({
      plugins: [validateMongoUniqueArrayItemsPlugin],
    })
    expect(() =>
      validator.validate({
        _id: dummyId,
        obj: [
          { a: '1', b: 'a' },
          { a: '1', b: 'a' },
        ],
      })
    ).not.toThrowError()
    expect(() =>
      validator.validate({
        _id: dummyId,
        obj: [
          { a: '1', b: 'a' },
          { a: '1', b: 'b' },
        ],
      })
    ).not.toThrowError()
    expect(() =>
      validator.validate({
        _id: dummyId,
        objUnique: [
          { a: '1', b: 'a' },
          { a: '1', b: 'a' },
        ],
      })
    ).toThrowError()
  })

  it('must validate unique array items on objects array with defined key', async () => {
    const { UniqueItems } = await import('./fixtures/plugins.as.js')
    const validator = UniqueItems.validator({
      plugins: [validateMongoUniqueArrayItemsPlugin],
    })

    try {
      validator.validate({
        _id: dummyId,
        kObj: [
          { a: '1', b: 'a' },
          { a: '2', b: 'a' },
        ],
      })
    } catch (e) {
      console.error(e)
    }

    expect(() =>
      validator.validate({
        _id: dummyId,
        kObj: [
          { a: '1', b: 'a' },
          { a: '2', b: 'a' },
        ],
      })
    ).not.toThrowError()
    expect(() =>
      validator.validate({
        _id: dummyId,
        kObj: [
          { a: '1', b: 'a' },
          { a: '1', b: 'a' },
        ],
      })
    ).toThrowError()
    expect(() =>
      validator.validate({
        _id: dummyId,
        kObj: [
          { a: '1', b: 'a' },
          { a: '1', b: 'b' },
        ],
      })
    ).toThrowError()
  })
})
