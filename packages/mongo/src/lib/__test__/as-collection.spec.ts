// oxlint-disable max-lines
import { describe, it, expect, beforeAll } from 'vitest'
import { AsMongo } from '../../lib/as-mongo'
import { prepareFixtures } from './test-utils'

let mongo = new AsMongo('mongodb+srv://dummy:dummy@test.jd1qx.mongodb.net/test?')

describe('[mongo] AsCollection with structures', () => {
  beforeAll(prepareFixtures)
  it('prepares simple patch query', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.preparePatch({
        name: 'John Doe',
        age: 25,
      }).updateFilter
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
      }).updateFilter
    ).toEqual({
      $set: { 'name': 'John Doe', 'age': 25, 'contacts.email': 'test@email.com' },
    })
  })

  it('prepares simple patch replacing nested object with replace strategy', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      () =>
        c.preparePatch({
          address: { line1: '123 Main St' },
        }).updateFilter
    ).toThrow() // replace strategy is not deep partial
    expect(
      c.preparePatch({
        name: 'John Doe',
        age: 25,
        address: { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
      }).updateFilter
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
      }).updateFilter
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
  it('prepares simple patch for deeply nested structure with mixed strategies', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.preparePatch({
        nested: {
          nested1: { a: 5 },
          nested2: { c: 5 },
        },
      }).updateFilter
    ).toEqual({
      $set: {
        'nested.nested1': { a: 5 },
        'nested.nested2.c': 5,
      },
    })
  })
})

describe('[mongo] AsCollection with arrays', () => {
  beforeAll(prepareFixtures)
  it('[PRIMITIVE] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.preparePatch({
      primitive: {
        $replace: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toEqual({
      $set: {
        primitive: ['a', 'b'],
      },
    })
  })

  it('[COMPLEX PRIMITIVE] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.preparePatch({
      primitiveComplex: {
        $replace: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toEqual({
      $set: {
        primitiveComplex: ['a', 'b'],
      },
    })
  })

  it('[PRIMITIVE] append array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.preparePatch({
      primitive: {
        $append: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toEqual({
      $push: {
        primitive: {
          $each: ['a', 'b'],
        },
      },
    })
  })

  it('[PRIMITIVE] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.preparePatch({
      primitive: {
        $merge: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toEqual({
      $addToSet: {
        primitive: {
          $each: ['a', 'b'],
        },
      },
    })
  })

  it('[PRIMITIVE] remove array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.preparePatch({
      primitive: {
        $remove: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toEqual({
      $pullAll: {
        primitive: ['a', 'b'],
      },
    })
  })

  // Array with key
  it('[OBJECT_WITH_KEY] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$replace" always requires all required fields to be present
    expect(() =>
      c.preparePatch({
        withKey: {
          $replace: [
            {
              key1: '1',
              key2: '2',
              // missing required prop "value"
              attribute: '123',
            },
          ],
        },
      })
    ).toThrowError()

    const result = c.preparePatch({
      withKey: {
        $replace: [
          {
            key1: '1',
            key2: '2',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    }).updateFilter

    expect(result).toEqual({
      $set: {
        withKey: [
          {
            key1: '1',
            key2: '2',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    })
  })

  it('[OBJECT_WITH_KEY] append array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$append" always requires all required fields to be present
    expect(() =>
      c.preparePatch({
        withKey: {
          $append: [
            {
              key1: '1',
              key2: '2',
              // missing required prop "value"
              attribute: '123',
            },
          ],
        },
      })
    ).toThrowError()

    const result = c.preparePatch({
      withKey: {
        $append: [
          {
            key1: '1',
            key2: '2',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    }).updateFilter

    expect(result).toEqual({
      $push: {
        withKey: {
          $each: [
            {
              key1: '1',
              key2: '2',
              value: 'a',
              attribute: '123',
            },
          ],
        },
      },
    })
  })

  it('[OBJECT_WITH_KEY] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$merge" + replace strategy => all required fields must be present
    expect(() =>
      c.preparePatch({
        withKey: {
          $merge: [
            {
              key1: '1',
              key2: '2',
              // missing required prop "value"
              attribute: '123',
            },
          ],
        },
      })
    ).toThrowError()

    const result = c
      .preparePatch({
        withKey: {
          $merge: [
            {
              key1: '1',
              key2: '2',
              value: 'a',
              attribute: '555',
            },
            {
              key1: '3',
              key2: '4',
              value: 'b',
              attribute: '666',
            },
          ],
        },
      })
      .toArgs()

    expect(result[1]).toEqual({
      $set: {
        'withKey.$[a0]': {
          key1: '1',
          key2: '2',
          value: 'a',
          attribute: '555',
        },
        'withKey.$[a1]': {
          key1: '3',
          key2: '4',
          value: 'b',
          attribute: '666',
        },
      },
    })
    expect(result[2]).toEqual({
      arrayFilters: [
        {
          'a0.key1': '1',
          'a0.key2': '2',
        },
        {
          'a1.key1': '3',
          'a1.key2': '4',
        },
      ],
    })
  })

  it('[OBJECT_WITH_KEY] remove array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$remove" with keys => only keys are required
    expect(() =>
      c.preparePatch({
        withKey: {
          $remove: [
            {
              key1: '1',
              key2: '2',
              // missing required props
            },
          ],
        },
      })
    ).not.toThrowError()

    const result = c
      .preparePatch({
        withKey: {
          $remove: [
            {
              key1: '1',
              key2: '2',
              attribute: '555',
            },
            {
              key1: '3',
              key2: '4',
            },
          ],
        },
      })
      .toArgs()

    expect(result[1]).toEqual({
      $pull: {
        withKey: {
          $or: [
            {
              key1: '1',
              key2: '2',
            },
            {
              key1: '3',
              key2: '4',
            },
          ],
        },
      },
    })
    expect(result[2]).toEqual({})
  })

  it('[OBJECT_WITH_KEY_MERGE_STRATEGY] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$merge" + merge strategy => only keys required
    expect(() =>
      c.preparePatch({
        withKeyMerge: {
          $merge: [
            {
              key1: '1',
              key2: '2',
              // missing required props
            },
          ],
        },
      })
    ).not.toThrowError()

    const result = c
      .preparePatch({
        withKeyMerge: {
          $merge: [
            {
              key1: '1',
              key2: '2',
              attribute: '555',
            },
            {
              key1: '3',
              key2: '4',
              attribute: '666',
            },
          ],
        },
      })
      .toArgs()

    expect(result[1]).toEqual({
      $set: {
        'withKeyMerge.$[a0].attribute': '555',
        'withKeyMerge.$[a1].attribute': '666',
      },
    })
    expect(result[2]).toEqual({
      arrayFilters: [
        {
          'a0.key1': '1',
          'a0.key2': '2',
        },
        {
          'a1.key1': '3',
          'a1.key2': '4',
        },
      ],
    })
  })

  // Array without key
  it('[OBJECT_WITHOUT_KEY] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$replace" always all required fields must be present
    expect(() =>
      c.preparePatch({
        withKeyMerge: {
          $replace: [
            {
              key: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c.preparePatch({
      withoutKey: {
        $replace: [
          {
            key: '1',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    }).updateFilter

    expect(result).toEqual({
      $set: {
        withoutKey: [
          {
            key: '1',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    })
  })

  it('[OBJECT_WITHOUT_KEY] append array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$append" always all required fields must be present
    expect(() =>
      c.preparePatch({
        withKeyMerge: {
          $append: [
            {
              key: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c.preparePatch({
      withoutKey: {
        $append: [
          {
            key: '1',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    }).updateFilter

    expect(result).toEqual({
      $push: {
        withoutKey: {
          $each: [
            {
              key: '1',
              value: 'a',
              attribute: '123',
            },
          ],
        },
      },
    })
  })

  it('[OBJECT_WITHOUT_KEY] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$merge" + without key => all required fields must be present
    expect(() =>
      c.preparePatch({
        withKeyMerge: {
          $merge: [
            {
              key: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c
      .preparePatch({
        withoutKey: {
          $merge: [
            {
              key: '1',
              value: '555',
            },
            {
              key: '2',
              value: '666',
            },
          ],
        },
      })
      .toArgs()

    expect(result[1]).toEqual({
      $addToSet: {
        withoutKey: {
          $each: [
            {
              key: '1',
              value: '555',
            },
            {
              key: '2',
              value: '666',
            },
          ],
        },
      },
    })
    expect(result[2]).toEqual({})
  })

  it('[OBJECT_WITHOUT_KEY] remove array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$remove" without key => all required fields must be present
    expect(() =>
      c.preparePatch({
        withKeyMerge: {
          $remove: [
            {
              key: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c
      .preparePatch({
        withoutKey: {
          $remove: [
            {
              key: '1',
              value: '555',
            },
            {
              key: '2',
              value: '666',
            },
          ],
        },
      })
      .toArgs()

    expect(result[1]).toEqual({
      $pullAll: {
        withoutKey: [
          {
            key: '1',
            value: '555',
          },
          {
            key: '2',
            value: '666',
          },
        ],
      },
    })
    expect(result[2]).toEqual({})
  })
})
