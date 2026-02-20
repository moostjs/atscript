import { ObjectId } from 'mongodb'
// oxlint-disable max-lines
import { describe, it, expect, beforeAll } from 'vitest'

import { AsMongo } from '../../lib/as-mongo'
import { prepareFixtures } from './test-utils'

const mongo = new AsMongo('mongodb+srv://dummy:dummy@test.jd1qx.mongodb.net/test?')

describe('[mongo] AsCollection with structures', () => {
  beforeAll(prepareFixtures)
  it('[INSERT] checks _id as ObjectId', async () => {
    const { MinimalCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(MinimalCollection)
    expect(() =>
      c.prepareInsert({
        _id: new ObjectId(),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      c.prepareInsert({
        _id: 'a'.repeat(24),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      c.prepareInsert({
        _id: 'a', // bad ObjectId
        name: 'John Doe',
      })
    ).toThrowError()
    expect(() =>
      c.prepareInsert({
        // allow ObjectId to be empty for autogeneration
        name: 'John Doe',
      })
    ).not.toThrowError()
  })
  it('[INSERT] checks _id as string', async () => {
    const { MinimalCollectionString } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(MinimalCollectionString)
    expect(() =>
      c.prepareInsert({
        _id: new ObjectId(),
        name: 'John Doe',
      })
    ).toThrowError()
    expect(() =>
      c.prepareInsert({
        _id: 'a'.repeat(24),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      c.prepareInsert({
        name: 'John Doe',
      })
    ).toThrowError()
  })

  it('[UPDATE] checks _id as ObjectId', async () => {
    const { MinimalCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(MinimalCollection)
    expect(() =>
      c.prepareReplace({
        _id: new ObjectId(),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      c.prepareReplace({
        _id: 'a'.repeat(24),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      c.prepareReplace({
        _id: 'a', // bad ObjectId
        name: 'John Doe',
      })
    ).toThrowError()
    expect(() =>
      // @ts-expect-error
      c.prepareReplace({
        name: 'John Doe',
      })
    ).toThrowError()
  })
  it('[UPDATE] checks _id as string', async () => {
    const { MinimalCollectionString } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(MinimalCollectionString)
    expect(() =>
      c.prepareReplace({
        _id: new ObjectId(),
        name: 'John Doe',
      })
    ).toThrowError()
    expect(() =>
      c.prepareReplace({
        _id: 'a'.repeat(24),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      // @ts-expect-error
      c.prepareReplace({
        name: 'John Doe',
      })
    ).toThrowError()
  })

  it('[MERGE] checks _id as ObjectId', async () => {
    const { MinimalCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(MinimalCollection)
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      c.prepareUpdate({
        _id: 'a'.repeat(24),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      c.prepareUpdate({
        _id: 'a', // bad ObjectId

        name: 'John Doe',
      })
    ).toThrowError()
    expect(() =>
      // @ts-expect-error
      c.prepareUpdate({
        name: 'John Doe',
      })
    ).toThrowError()
  })
  it('[MERGE] checks _id as string', async () => {
    const { MinimalCollectionString } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(MinimalCollectionString)
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        name: 'John Doe',
      })
    ).toThrowError()
    expect(() =>
      c.prepareUpdate({
        _id: 'a'.repeat(24),
        name: 'John Doe',
      })
    ).not.toThrowError()
    expect(() =>
      // @ts-expect-error
      c.prepareUpdate({
        name: 'John Doe',
      })
    ).toThrowError()
  })

  it('prepares simple patch query', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.prepareUpdate({
        _id: new ObjectId(),
        name: 'John Doe',
        age: 25,
      }).updateFilter
    ).toEqual([
      {
        $set: { name: 'John Doe', age: 25 },
      },
    ])
  })

  it('prepares simple patch with merge object', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.prepareUpdate({
        _id: new ObjectId(),
        name: 'John Doe',
        age: 25,
        contacts: { email: 'test@email.com' },
      }).updateFilter
    ).toEqual([
      {
        $set: { 'name': 'John Doe', 'age': 25, 'contacts.email': 'test@email.com' },
      },
    ])
  })

  it('prepares simple patch replacing nested object with replace strategy', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      () =>
        c.prepareUpdate({
          _id: new ObjectId(),
          address: { line1: '123 Main St' },
        }).updateFilter
    ).toThrowError() // replace strategy is not deep partial
    expect(
      c.prepareUpdate({
        _id: new ObjectId(),
        name: 'John Doe',
        age: 25,
        address: { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
      }).updateFilter
    ).toEqual([
      {
        $set: {
          name: 'John Doe',
          age: 25,
          address: { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
        },
      },
    ])
  })
  it('prepares simple patch replacing nested object with replace strategy and merging nested object with merge strategy', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.prepareUpdate({
        _id: new ObjectId(),
        name: 'John Doe',
        age: 25,
        address: { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
        contacts: { email: 'test@email.com' },
      }).updateFilter
    ).toEqual([
      {
        $set: {
          'name': 'John Doe',
          'age': 25,
          // replacing address
          'address': { line1: '123 Main St', city: 'New York', state: 'New York', zip: '12332' },
          // merging contacts
          'contacts.email': 'test@email.com',
        },
      },
    ])
  })
  it('prepares simple patch for deeply nested structure with mixed strategies', async () => {
    const { SimpleCollection } = await import('./fixtures/simple-collection.as.js')
    const c = mongo.getCollection(SimpleCollection)
    expect(
      c.prepareUpdate({
        _id: new ObjectId(),
        nested: {
          nested1: { a: 5 },
          nested2: { c: 5 },
        },
      }).updateFilter
    ).toEqual([
      {
        $set: {
          'nested.nested1': { a: 5 },
          'nested.nested2.c': 5,
        },
      },
    ])
  })
})

describe('[mongo] AsCollection with arrays', () => {
  beforeAll(prepareFixtures)
  it('[PRIMITIVE] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.prepareUpdate({
      _id: new ObjectId(),
      primitive: {
        $replace: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "primitive": [
              "a",
              "b",
            ],
          },
        },
      ]
    `)
  })

  it('[COMPLEX PRIMITIVE] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.prepareUpdate({
      _id: new ObjectId(),
      primitiveComplex: {
        $replace: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "primitiveComplex": [
              "a",
              "b",
            ],
          },
        },
      ]
    `)
  })

  it('[PRIMITIVE] append array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.prepareUpdate({
      _id: new ObjectId(),
      primitive: {
        $insert: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "primitive": {
              "$concatArrays": [
                {
                  "$ifNull": [
                    "$primitive",
                    [],
                  ],
                },
                [
                  "a",
                  "b",
                ],
              ],
            },
          },
        },
      ]
    `)
  })

  it('[PRIMITIVE] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.prepareUpdate({
      _id: new ObjectId(),
      primitive: {
        $update: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "primitive": {
              "$setUnion": [
                {
                  "$ifNull": [
                    "$primitive",
                    [],
                  ],
                },
                [
                  "a",
                  "b",
                ],
              ],
            },
          },
        },
      ]
    `)
  })

  it('[PRIMITIVE] remove array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)
    const result = c.prepareUpdate({
      _id: new ObjectId(),
      primitive: {
        $remove: ['a', 'b'],
      },
    }).updateFilter

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "primitive": {
              "$setDifference": [
                {
                  "$ifNull": [
                    "$primitive",
                    [],
                  ],
                },
                [
                  "a",
                  "b",
                ],
              ],
            },
          },
        },
      ]
    `)
  })

  // Array with key
  it('[OBJECT_WITH_KEY] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$replace" always requires all required fields to be present
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKey: {
          $replace: [
            // @ts-expect-error
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

    const result = c.prepareUpdate({
      _id: new ObjectId(),
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

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withKey": [
              {
                "attribute": "123",
                "key1": "1",
                "key2": "2",
                "value": "a",
              },
            ],
          },
        },
      ]
    `)
  })

  it('[OBJECT_WITH_KEY] append array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$insert" always requires all required fields to be present
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKey: {
          $insert: [
            // @ts-expect-error
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

    const result = c.prepareUpdate({
      _id: new ObjectId(),
      withKey: {
        $insert: [
          {
            key1: '1',
            key2: '2',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    }).updateFilter

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withKey": {
              "$reduce": {
                "in": {
                  "$let": {
                    "in": {
                      "$concatArrays": [
                        {
                          "$filter": {
                            "as": "el",
                            "cond": {
                              "$not": {
                                "$and": [
                                  {
                                    "$eq": [
                                      "$$el.key1",
                                      "$$cand.key1",
                                    ],
                                  },
                                  {
                                    "$eq": [
                                      "$$el.key2",
                                      "$$cand.key2",
                                    ],
                                  },
                                ],
                              },
                            },
                            "input": "$$acc",
                          },
                        },
                        [
                          "$$cand",
                        ],
                      ],
                    },
                    "vars": {
                      "acc": "$$value",
                      "cand": "$$this",
                    },
                  },
                },
                "initialValue": {
                  "$ifNull": [
                    "$withKey",
                    [],
                  ],
                },
                "input": [
                  {
                    "attribute": "123",
                    "key1": "1",
                    "key2": "2",
                    "value": "a",
                  },
                ],
              },
            },
          },
        },
      ]
    `)
  })

  it('[OBJECT_WITH_KEY] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$update" + replace strategy => all required fields must be present
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKey: {
          $update: [
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
      .prepareUpdate({
        _id: new ObjectId(),
        withKey: {
          $update: [
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

    expect(result[1]).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withKey": {
              "$reduce": {
                "in": {
                  "$map": {
                    "as": "el",
                    "in": {
                      "$cond": [
                        {
                          "$and": [
                            {
                              "$eq": [
                                "$$el.key1",
                                "$$this.key1",
                              ],
                            },
                            {
                              "$eq": [
                                "$$el.key2",
                                "$$this.key2",
                              ],
                            },
                          ],
                        },
                        "$$this",
                        "$$el",
                      ],
                    },
                    "input": "$$value",
                  },
                },
                "initialValue": {
                  "$ifNull": [
                    "$withKey",
                    [],
                  ],
                },
                "input": [
                  {
                    "attribute": "555",
                    "key1": "1",
                    "key2": "2",
                    "value": "a",
                  },
                  {
                    "attribute": "666",
                    "key1": "3",
                    "key2": "4",
                    "value": "b",
                  },
                ],
              },
            },
          },
        },
      ]
    `)
    expect(result[2]).toMatchInlineSnapshot(`{}`)
  })

  it('[OBJECT_WITH_KEY] remove array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$remove" with keys => only keys are required
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKey: {
          $remove: [
            {
              key1: '1',
              key2: '2',
            },
          ],
        },
      })
    ).not.toThrowError()

    const result = c
      .prepareUpdate({
        _id: new ObjectId(),
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

    expect(result[1]).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withKey": {
              "$let": {
                "in": {
                  "$filter": {
                    "as": "el",
                    "cond": {
                      "$not": {
                        "$anyElementTrue": {
                          "$map": {
                            "as": "r",
                            "in": {
                              "$and": [
                                {
                                  "$eq": [
                                    "$$el.key1",
                                    "$$r.key1",
                                  ],
                                },
                                {
                                  "$eq": [
                                    "$$el.key2",
                                    "$$r.key2",
                                  ],
                                },
                              ],
                            },
                            "input": "$$rem",
                          },
                        },
                      },
                    },
                    "input": {
                      "$ifNull": [
                        "$withKey",
                        [],
                      ],
                    },
                  },
                },
                "vars": {
                  "rem": [
                    {
                      "attribute": "555",
                      "key1": "1",
                      "key2": "2",
                    },
                    {
                      "key1": "3",
                      "key2": "4",
                    },
                  ],
                },
              },
            },
          },
        },
      ]
    `)
    expect(result[2]).toEqual({})
  })

  it('[OBJECT_WITH_KEY_MERGE_STRATEGY] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$update" + merge strategy => only keys required
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKeyMerge: {
          $update: [
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
      .prepareUpdate({
        _id: new ObjectId(),
        withKeyMerge: {
          $update: [
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

    expect(result[1]).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withKeyMerge": {
              "$reduce": {
                "in": {
                  "$map": {
                    "as": "el",
                    "in": {
                      "$cond": [
                        {
                          "$and": [
                            {
                              "$eq": [
                                "$$el.key1",
                                "$$this.key1",
                              ],
                            },
                            {
                              "$eq": [
                                "$$el.key2",
                                "$$this.key2",
                              ],
                            },
                          ],
                        },
                        {
                          "$mergeObjects": [
                            "$$el",
                            "$$this",
                          ],
                        },
                        "$$el",
                      ],
                    },
                    "input": "$$value",
                  },
                },
                "initialValue": {
                  "$ifNull": [
                    "$withKeyMerge",
                    [],
                  ],
                },
                "input": [
                  {
                    "attribute": "555",
                    "key1": "1",
                    "key2": "2",
                  },
                  {
                    "attribute": "666",
                    "key1": "3",
                    "key2": "4",
                  },
                ],
              },
            },
          },
        },
      ]
    `)
    expect(result[2]).toMatchInlineSnapshot(`{}`)
  })

  // Array without key
  it('[OBJECT_WITHOUT_KEY] replace array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$replace" always all required fields must be present
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKeyMerge: {
          $replace: [
            // @ts-expect-error
            {
              key1: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c.prepareUpdate({
      _id: new ObjectId(),
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

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withoutKey": [
              {
                "attribute": "123",
                "key": "1",
                "value": "a",
              },
            ],
          },
        },
      ]
    `)
  })

  it('[OBJECT_WITHOUT_KEY] append array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$insert" always all required fields must be present
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKeyMerge: {
          $insert: [
            // @ts-expect-error
            {
              key1: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c.prepareUpdate({
      _id: new ObjectId(),
      withoutKey: {
        $insert: [
          {
            key: '1',
            value: 'a',
            attribute: '123',
          },
        ],
      },
    }).updateFilter

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withoutKey": {
              "$concatArrays": [
                {
                  "$ifNull": [
                    "$withoutKey",
                    [],
                  ],
                },
                [
                  {
                    "attribute": "123",
                    "key": "1",
                    "value": "a",
                  },
                ],
              ],
            },
          },
        },
      ]
    `)
  })

  it('[OBJECT_WITHOUT_KEY] merge array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$update" + without key => all required fields must be present
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKeyMerge: {
          $update: [
            {
              key1: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c
      .prepareUpdate({
        _id: new ObjectId(),
        withoutKey: {
          $update: [
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

    expect(result[1]).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withoutKey": {
              "$setUnion": [
                {
                  "$ifNull": [
                    "$withoutKey",
                    [],
                  ],
                },
                [
                  {
                    "key": "1",
                    "value": "555",
                  },
                  {
                    "key": "2",
                    "value": "666",
                  },
                ],
              ],
            },
          },
        },
      ]
    `)
    expect(result[2]).toEqual({})
  })

  it('[OBJECT_WITHOUT_KEY] remove array', async () => {
    const { ArraysCollection } = await import('./fixtures/arrays-collection.as.js')
    const c = mongo.getCollection(ArraysCollection)

    // "$remove" without key => all required fields must be present
    expect(() =>
      c.prepareUpdate({
        _id: new ObjectId(),
        withKeyMerge: {
          $remove: [
            {
              key1: '1',
              // missing required props
            },
          ],
        },
      })
    ).toThrowError()

    const result = c
      .prepareUpdate({
        _id: new ObjectId(),
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

    expect(result[1]).toMatchInlineSnapshot(`
      [
        {
          "$set": {
            "withoutKey": {
              "$setDifference": [
                {
                  "$ifNull": [
                    "$withoutKey",
                    [],
                  ],
                },
                [
                  {
                    "key": "1",
                    "value": "555",
                  },
                  {
                    "key": "2",
                    "value": "666",
                  },
                ],
              ],
            },
          },
        },
      ]
    `)
    expect(result[2]).toEqual({})
  })
})
