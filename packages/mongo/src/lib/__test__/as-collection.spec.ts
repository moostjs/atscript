import { describe, it, expect, beforeAll } from 'vitest'
import { AsMongo } from '../../lib/as-mongo'
import { prepareFixtures } from './test-utils'

let mongo = new AsMongo('mongodb+srv://dummy:dummy@test.jd1qx.mongodb.net/test?')

describe('[mongo] AsCollection', () => {
  beforeAll(prepareFixtures)
  it('prepares simple patch query', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.preparePatch({
        name: 'John Doe',
        age: 25,
      })
    ).toEqual({
      $set: { name: 'John Doe', age: 25 },
    })
  })

  it('prepares simple patch with merge object', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.preparePatch({
        name: 'John Doe',
        age: 25,
        contacts: { email: 'test@email.com' },
      })
    ).toEqual({
      $set: { 'name': 'John Doe', 'age': 25, 'contacts.email': 'test@email.com' },
    })
  })

  it('prepares simple patch replacing nested object with replace strategy', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(() =>
      c.preparePatch({
        address: { line1: '123 Main St' },
      })
    ).toThrow() // replace strategy is not deep partial
    expect(
      c.preparePatch({
        name: 'John Doe',
        age: 25,
        address: { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
      })
    ).toEqual({
      $set: {
        name: 'John Doe',
        age: 25,
        address: { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
      },
    })
  })
  it('prepares simple patch replacing nested object with replace strategy and merging nested object with merge strategy', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.preparePatch({
        name: 'John Doe',
        age: 25,
        address: { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
        contacts: { email: 'test@email.com' },
      })
    ).toEqual({
      $set: {
        'name': 'John Doe',
        'age': 25,
        // replacing address
        'address': { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
        // merging contacts
        'contacts.email': 'test@email.com',
      },
    })
  })
})
