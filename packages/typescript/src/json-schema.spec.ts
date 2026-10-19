import path from 'path'

import { build } from '@atscript/core'
import { describe, expect, it } from 'vitest'

import { tsPlugin } from './plugin'
import type { TAtscriptAnnotatedType } from './runtime/annotated-type'
import { defineAnnotatedType as $ } from './runtime/annotated-type'
import { buildJsonSchema as $$, fromJsonSchema, mergeJsonSchemas } from './runtime/json-schema'
import { prepareFixtures } from './test-utils'
const wd = path.join(path.dirname(import.meta.url.slice(7)), '..')

// export interface JsonDeep {
//   s: string
//   n: number
//   c: string | number
//   obj: {
//     a: string
//     b: number
//     c: boolean
//   }
//   a: string[]
//   aObj: {
//     a: string
//     b: number
//     c: boolean
//   }[]
//   optional?: string
//   optionalObj?: {
//     a: string
//     b: number
//     c: boolean
//   }
//   deep: {
//     deeper: {
//       deepest: string
//     }
//   }
// }

class JsonDeep {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema: any
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this as unknown as TAtscriptAnnotatedType))
  }
}

$('object', JsonDeep)
  .prop('s', $().designType('string').tags('string').$type)
  .prop('n', $().designType('number').tags('number').$type)
  .prop(
    'c',
    $('union')
      .item($().designType('string').tags('string').$type)
      .item($().designType('number').tags('number').$type).$type
  )
  .prop(
    'obj',
    $('object')
      .prop('a', $().designType('string').tags('string').$type)
      .prop('b', $().designType('number').tags('number').$type)
      .prop('c', $().designType('boolean').tags('boolean').$type).$type
  )
  .prop('a', $('array').of($().designType('string').tags('string').$type).$type)
  .prop(
    'aObj',
    $('array').of(
      $('object')
        .prop('a', $().designType('string').tags('string').$type)
        .prop('b', $().designType('number').tags('number').$type)
        .prop('c', $().designType('boolean').tags('boolean').$type).$type
    ).$type
  )
  .prop('optional', $().designType('string').tags('string').optional().$type)
  .prop(
    'optionalObj',
    $('object')
      .prop('a', $().designType('string').tags('string').$type)
      .prop('b', $().designType('number').tags('number').$type)
      .prop('c', $().designType('boolean').tags('boolean').$type)
      .optional().$type
  )
  .prop(
    'deep',
    $('object').prop(
      'deeper',
      $('object').prop('deepest', $().designType('string').tags('string').$type).$type
    ).$type
  )

const expectedSchema = {
  properties: {
    a: {
      items: {
        type: 'string',
      },
      type: 'array',
    },
    aObj: {
      items: {
        properties: {
          a: {
            type: 'string',
          },
          b: {
            type: 'number',
          },
          c: {
            type: 'boolean',
          },
        },
        required: ['a', 'b', 'c'],
        type: 'object',
      },
      type: 'array',
    },
    c: {
      anyOf: [
        {
          type: 'string',
        },
        {
          type: 'number',
        },
      ],
    },
    deep: {
      properties: {
        deeper: {
          properties: {
            deepest: {
              type: 'string',
            },
          },
          required: ['deepest'],
          type: 'object',
        },
      },
      required: ['deeper'],
      type: 'object',
    },
    n: {
      type: 'number',
    },
    obj: {
      properties: {
        a: {
          type: 'string',
        },
        b: {
          type: 'number',
        },
        c: {
          type: 'boolean',
        },
      },
      required: ['a', 'b', 'c'],
      type: 'object',
    },
    optional: {
      type: 'string',
    },
    optionalObj: {
      properties: {
        a: {
          type: 'string',
        },
        b: {
          type: 'number',
        },
        c: {
          type: 'boolean',
        },
      },
      required: ['a', 'b', 'c'],
      type: 'object',
    },
    s: {
      type: 'string',
    },
  },
  required: ['s', 'n', 'c', 'obj', 'a', 'aObj', 'deep'],
  type: 'object',
}

describe('json-schema', () => {
  it('must render JSON schema properly', async () => {
    expect(JsonDeep.toJsonSchema()).toEqual(expectedSchema)
  })

  it('must pre-render json schema that matches built json schema', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema-deep.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
    })
    const out = await repo.generate({ format: 'js' })
    const content = out[0].content.split('\n').filter(s => s.trim().startsWith('return {'))?.[0]
    const schema = content.trim().slice('return '.length)
    expect(JSON.parse(schema)).toEqual(expectedSchema)
  })

  // Regression: building the bundle schema of a recursive type overflowed the stack.
  it('must pre-render json schema of recursive and shared types (same as built at runtime)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema-recursive.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
    })
    const out = await repo.generate({ format: 'js' })
    const bundled = out[0].content
      .split('\n')
      .filter(s => s.trim().startsWith('return {'))
      .map(s => JSON.parse(s.trim().slice('return '.length)))
    await prepareFixtures({
      rootDir: path.join(wd, 'test/fixtures'),
      entries: ['jsonschema-recursive.as'],
      formats: ['js'],
    })
    const { TreeNode, Holder, Forest, Point, Shape, AliasOfPoint, Pair } = await import(
      path.join(wd, 'test/fixtures/jsonschema-recursive.as.js')
    )
    expect(bundled).toEqual(
      [TreeNode, Holder, Forest, Point, Shape, AliasOfPoint, Pair].map(t => $$(t))
    )
    expect(bundled[0].$defs.TreeNode.properties.children.items).toEqual({
      $ref: '#/$defs/TreeNode',
    })
    // A reference to an alias points at the alias, not at what it unwinds to.
    expect(bundled[6].properties.id.items).toEqual([
      { $ref: '#/$defs/Point' },
      { $ref: '#/$defs/AliasOfPoint' },
    ])
  })

  it('must pre-render json schema of aliases of imported aliases (same as built at runtime)', async () => {
    const dir = path.join(wd, 'test/fixtures/jsonschema-alias')
    const repo = await build({
      rootDir: dir,
      entries: ['uses.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
    })
    const out = await repo.generate({ format: 'js' })
    const bundled = out
      .find(f => f.fileName.endsWith('uses.as.js'))!
      .content.split('\n')
      .filter(s => s.trim().startsWith('return {'))
      .map(s => JSON.parse(s.trim().slice('return '.length)))
    await prepareFixtures({ rootDir: dir, entries: ['target.as', 'uses.as'], formats: ['js'] })
    const { ReAlias, UsesAlias } = await import(path.join(dir, 'uses.as.js'))
    // A lazy (cross-module) reference adopts its target's id once resolved: resolve them all.
    for (const item of UsesAlias.type.props.get('b').type.items) {
      expect(item.type.kind).toBe('object')
    }
    expect(bundled).toEqual([$$(ReAlias), $$(UsesAlias)])
    expect(bundled[0].properties).toEqual({ x: { type: 'number' } })
    expect(bundled[1].properties.b.items).toEqual([
      { $ref: '#/$defs/AliasOfPoint' },
      { $ref: '#/$defs/ReAlias' },
    ])
  })
})

describe('json-schema phantom', () => {
  it('should exclude phantom props from JSON schema', () => {
    const t = $('object')
      .prop('name', $().designType('string').tags('string').$type)
      .prop('info', $().designType('phantom').$type)
      .prop('age', $().designType('number').tags('number').$type)
    const schema = $$(t.$type)
    expect(schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    })
    // Phantom prop should not appear in properties
    expect(schema.properties).not.toHaveProperty('info')
  })
})

describe('fromJsonSchema', () => {
  describe('basic types', () => {
    it('should convert string type', () => {
      const type = fromJsonSchema({ type: 'string' })
      expect(type.type.kind).toBe('')
      expect((type.type as any).designType).toBe('string')
      expect((type.type as any).tags.has('string')).toBe(true)
    })

    it('should convert number type', () => {
      const type = fromJsonSchema({ type: 'number' })
      expect((type.type as any).designType).toBe('number')
      expect((type.type as any).tags.has('number')).toBe(true)
    })

    it('should convert integer type', () => {
      const type = fromJsonSchema({ type: 'integer' })
      expect((type.type as any).designType).toBe('number')
      expect(type.metadata.get('expect.int')).toBe(true)
    })

    it('should convert boolean type', () => {
      const type = fromJsonSchema({ type: 'boolean' })
      expect((type.type as any).designType).toBe('boolean')
    })

    it('should convert null type', () => {
      const type = fromJsonSchema({ type: 'null' })
      expect((type.type as any).designType).toBe('null')
    })

    it('should convert literal/const', () => {
      const type = fromJsonSchema({ const: 42 })
      expect((type.type as any).designType).toBe('number')
      expect((type.type as any).value).toBe(42)
    })

    it('should convert string const', () => {
      const type = fromJsonSchema({ const: 'hello' })
      expect((type.type as any).designType).toBe('string')
      expect((type.type as any).value).toBe('hello')
    })

    it('should convert empty schema to any', () => {
      const type = fromJsonSchema({})
      expect((type.type as any).designType).toBe('any')
    })

    it('should convert enum to union of literals', () => {
      const type = fromJsonSchema({ enum: ['a', 'b', 'c'] })
      expect(type.type.kind).toBe('union')
      expect((type.type as any).items).toHaveLength(3)
      expect((type.type as any).items[0].type.value).toBe('a')
      expect((type.type as any).items[1].type.value).toBe('b')
      expect((type.type as any).items[2].type.value).toBe('c')
    })
  })

  describe('complex types', () => {
    it('should convert object with properties and required', () => {
      const type = fromJsonSchema({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'number' } },
        required: ['name'],
      })
      expect(type.type.kind).toBe('object')
      const props = (type.type as any).props as Map<string, TAtscriptAnnotatedType>
      expect(props.size).toBe(2)
      expect(props.get('name')!.optional).toBeFalsy()
      expect(props.get('age')!.optional).toBe(true)
    })

    it('should convert nested objects', () => {
      const type = fromJsonSchema({
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
        required: ['address'],
      })
      const address = (type.type as any).props.get('address')!
      expect(address.type.kind).toBe('object')
      expect(address.type.props.get('city')!.type.designType).toBe('string')
    })

    it('should convert array', () => {
      const type = fromJsonSchema({ type: 'array', items: { type: 'string' } })
      expect(type.type.kind).toBe('array')
      expect((type.type as any).of.type.designType).toBe('string')
    })

    it('should convert tuple', () => {
      const type = fromJsonSchema({
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
        additionalItems: false,
      })
      expect(type.type.kind).toBe('tuple')
      expect((type.type as any).items).toHaveLength(2)
      expect((type.type as any).items[0].type.designType).toBe('string')
      expect((type.type as any).items[1].type.designType).toBe('number')
    })

    it('should convert union (anyOf)', () => {
      const type = fromJsonSchema({ anyOf: [{ type: 'string' }, { type: 'number' }] })
      expect(type.type.kind).toBe('union')
      expect((type.type as any).items).toHaveLength(2)
    })

    it('should convert intersection (allOf)', () => {
      const type = fromJsonSchema({
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
          { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
        ],
      })
      expect(type.type.kind).toBe('intersection')
      expect((type.type as any).items).toHaveLength(2)
    })

    it('should convert oneOf as union', () => {
      const type = fromJsonSchema({ oneOf: [{ type: 'string' }, { type: 'boolean' }] })
      expect(type.type.kind).toBe('union')
      expect((type.type as any).items).toHaveLength(2)
    })
  })

  describe('constraints', () => {
    it('should convert string minLength/maxLength', () => {
      const type = fromJsonSchema({ type: 'string', minLength: 3, maxLength: 100 })
      expect(type.metadata.get('expect.minLength')).toEqual({ length: 3 })
      expect(type.metadata.get('expect.maxLength')).toEqual({ length: 100 })
    })

    it('should convert string pattern', () => {
      const type = fromJsonSchema({ type: 'string', pattern: '^[a-z]+$' })
      expect(type.metadata.get('expect.pattern')).toEqual([{ pattern: '^[a-z]+$' }])
    })

    it('should convert string multiple patterns via allOf', () => {
      const type = fromJsonSchema({
        type: 'string',
        allOf: [{ pattern: '^[a-z]' }, { pattern: '[0-9]$' }],
      })
      expect(type.metadata.get('expect.pattern')).toEqual([
        { pattern: '^[a-z]' },
        { pattern: '[0-9]$' },
      ])
    })

    it('should convert number minimum/maximum', () => {
      const type = fromJsonSchema({ type: 'number', minimum: 0, maximum: 100 })
      expect(type.metadata.get('expect.min')).toEqual({ minValue: 0 })
      expect(type.metadata.get('expect.max')).toEqual({ maxValue: 100 })
    })

    it('should convert exclusiveMinimum/exclusiveMaximum (2020-12 numeric form)', () => {
      const type = fromJsonSchema({ type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 })
      expect(type.metadata.get('expect.exclusiveMin')).toEqual({ exclusiveMinValue: 0 })
      expect(type.metadata.get('expect.exclusiveMax')).toEqual({ exclusiveMaxValue: 1 })
      expect(type.metadata.get('expect.min')).toBeUndefined()
      const v = type.validator()
      expect(v.validate(0.5, true)).toBe(true)
      expect(v.validate(0, true)).toBe(false)
      expect(v.validate(1, true)).toBe(false)
    })

    it('should keep both inclusive and exclusive numeric bounds', () => {
      const type = fromJsonSchema({
        type: 'number',
        minimum: 3,
        exclusiveMinimum: 5,
        maximum: 10,
        exclusiveMaximum: 8,
      })
      expect(type.metadata.get('expect.min')).toEqual({ minValue: 3 })
      expect(type.metadata.get('expect.exclusiveMin')).toEqual({ exclusiveMinValue: 5 })
      expect(type.metadata.get('expect.max')).toEqual({ maxValue: 10 })
      expect(type.metadata.get('expect.exclusiveMax')).toEqual({ exclusiveMaxValue: 8 })
      const v = type.validator()
      expect([5, 5.1, 7.9, 8].map(x => v.validate(x, true))).toEqual([false, true, true, false])
    })

    it('should convert draft-4 boolean exclusiveMinimum/exclusiveMaximum', () => {
      const type = fromJsonSchema({
        type: 'integer',
        minimum: 0,
        exclusiveMinimum: true,
        maximum: 10,
        exclusiveMaximum: true,
      })
      expect(type.metadata.get('expect.exclusiveMin')).toEqual({ exclusiveMinValue: 0 })
      expect(type.metadata.get('expect.exclusiveMax')).toEqual({ exclusiveMaxValue: 10 })
      expect(type.metadata.get('expect.min')).toBeUndefined()
      expect(type.metadata.get('expect.max')).toBeUndefined()
      const inclusive = fromJsonSchema({ type: 'number', minimum: 0, exclusiveMinimum: false })
      expect(inclusive.metadata.get('expect.min')).toEqual({ minValue: 0 })
      expect(inclusive.metadata.get('expect.exclusiveMin')).toBeUndefined()
    })

    it('should convert integer with constraints', () => {
      const type = fromJsonSchema({ type: 'integer', minimum: 1, maximum: 10 })
      expect(type.metadata.get('expect.int')).toBe(true)
      expect(type.metadata.get('expect.min')).toEqual({ minValue: 1 })
      expect(type.metadata.get('expect.max')).toEqual({ maxValue: 10 })
    })

    it('should convert array minItems/maxItems', () => {
      const type = fromJsonSchema({
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 5,
      })
      expect(type.metadata.get('expect.minLength')).toEqual({ length: 1 })
      expect(type.metadata.get('expect.maxLength')).toEqual({ length: 5 })
    })
  })

  describe('round-trip with buildJsonSchema', () => {
    it('should round-trip the expectedSchema', () => {
      const restored = fromJsonSchema(expectedSchema)
      const reSchema = $$(restored)
      // required array order may differ since JSON object key order is not guaranteed
      const normalize = (s: any) => {
        const copy = JSON.parse(JSON.stringify(s))
        const sortRequired = (obj: any) => {
          if (obj?.required) {
            obj.required = [...obj.required].sort()
          }
          if (obj?.properties) {
            for (const v of Object.values(obj.properties)) {
              sortRequired(v)
            }
          }
          if (obj?.items && !Array.isArray(obj.items)) {
            sortRequired(obj.items)
          }
        }
        sortRequired(copy)
        return copy
      }
      expect(normalize(reSchema)).toEqual(normalize(expectedSchema))
    })

    it('should round-trip primitives with constraints', () => {
      const schema = { type: 'string', minLength: 3, maxLength: 100, pattern: '^[a-z]+$' }
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    })

    it('should round-trip number with constraints', () => {
      const schema = { type: 'number', minimum: 0, maximum: 100 }
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    })

    it('should round-trip integer', () => {
      const schema = { type: 'integer', minimum: 1 }
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    })

    it('should round-trip array with constraints', () => {
      const schema = { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 10 }
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    })

    it('should round-trip union', () => {
      const schema = { anyOf: [{ type: 'string' }, { type: 'number' }] }
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    })

    it('should round-trip intersection', () => {
      const schema = {
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
          { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
        ],
      }
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    })

    it('should round-trip tuple', () => {
      const schema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
        additionalItems: false,
      }
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    })
  })

  describe('validator integration', () => {
    it('should produce types that validate correctly', () => {
      const type = fromJsonSchema({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'number' } },
        required: ['name', 'age'],
      })
      const validator = type.validator()
      expect(validator.validate({ name: 'Alice', age: 30 }, true)).toBe(true)
      expect(validator.validate({ name: 'Alice', age: '30' }, true)).toBe(false)
      expect(validator.validate({ name: 'Alice' }, true)).toBe(false)
    })

    it('should validate with constraints', () => {
      const type = fromJsonSchema({ type: 'string', minLength: 3 })
      const validator = type.validator()
      expect(validator.validate('hello', true)).toBe(true)
      expect(validator.validate('hi', true)).toBe(false)
    })

    it('should validate integer constraint', () => {
      const type = fromJsonSchema({ type: 'integer' })
      const validator = type.validator()
      expect(validator.validate(42, true)).toBe(true)
      expect(validator.validate(3.14, true)).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should throw on unresolvable $ref', () => {
      expect(() => fromJsonSchema({ $ref: '#/definitions/Foo' })).toThrow(/Unresolvable \$ref/)
    })
  })
})

describe('discriminated unions', () => {
  it('should emit oneOf with discriminator when all items share a common const prop', () => {
    const cat = $('object')
      .prop('petType', $().designType('string').value('cat').$type)
      .prop('name', $().designType('string').tags('string').$type)

    const dog = $('object')
      .prop('petType', $().designType('string').value('dog').$type)
      .prop('breed', $().designType('string').tags('string').$type)

    const union = $('union').item(cat.$type).item(dog.$type)

    expect($$(union.$type)).toEqual({
      oneOf: [
        {
          type: 'object',
          properties: {
            petType: { const: 'cat', type: 'string' },
            name: { type: 'string' },
          },
          required: ['petType', 'name'],
        },
        {
          type: 'object',
          properties: {
            petType: { const: 'dog', type: 'string' },
            breed: { type: 'string' },
          },
          required: ['petType', 'breed'],
        },
      ],
      discriminator: {
        propertyName: 'petType',
        mapping: {
          cat: '#/oneOf/0',
          dog: '#/oneOf/1',
        },
      },
    })
  })

  it('should fall back to anyOf when union has non-object items', () => {
    const cat = $('object').prop('petType', $().designType('string').value('cat').$type)

    const union = $('union').item(cat.$type).item($().designType('string').tags('string').$type)

    const schema = $$(union.$type)
    expect(schema).toHaveProperty('anyOf')
    expect(schema).not.toHaveProperty('oneOf')
  })

  it('should fall back to anyOf when no common const prop exists', () => {
    const a = $('object').prop('name', $().designType('string').tags('string').$type)

    const b = $('object').prop('age', $().designType('number').tags('number').$type)

    const schema = $$($('union').item(a.$type).item(b.$type).$type)
    expect(schema).toHaveProperty('anyOf')
    expect(schema).not.toHaveProperty('oneOf')
  })

  it('should fall back to anyOf when const values are not distinct', () => {
    const a = $('object').prop('kind', $().designType('string').value('same').$type)

    const b = $('object').prop('kind', $().designType('string').value('same').$type)

    const schema = $$($('union').item(a.$type).item(b.$type).$type)
    expect(schema).toHaveProperty('anyOf')
    expect(schema).not.toHaveProperty('oneOf')
  })

  it('should fall back to anyOf for single-item union', () => {
    const cat = $('object').prop('petType', $().designType('string').value('cat').$type)

    const schema = $$($('union').item(cat.$type).$type)
    expect(schema).toHaveProperty('anyOf')
    expect(schema).not.toHaveProperty('oneOf')
  })

  it('should pick the one qualifying candidate when multiple const props exist', () => {
    // Both items have 'kind' with distinct values AND 'version' with same value
    const a = $('object')
      .prop('kind', $().designType('string').value('a').$type)
      .prop('version', $().designType('number').value(1).$type)
      .prop('data', $().designType('string').tags('string').$type)

    const b = $('object')
      .prop('kind', $().designType('string').value('b').$type)
      .prop('version', $().designType('number').value(1).$type)
      .prop('data', $().designType('number').tags('number').$type)

    const schema = $$($('union').item(a.$type).item(b.$type).$type)
    expect(schema).toHaveProperty('oneOf')
    expect(schema.discriminator).toEqual({
      propertyName: 'kind',
      mapping: { a: '#/oneOf/0', b: '#/oneOf/1' },
    })
  })

  it('should fall back to anyOf when multiple candidate props qualify', () => {
    // Both 'kind' and 'type' have distinct values across items — ambiguous
    const a = $('object')
      .prop('kind', $().designType('string').value('a').$type)
      .prop('type', $().designType('string').value('x').$type)

    const b = $('object')
      .prop('kind', $().designType('string').value('b').$type)
      .prop('type', $().designType('string').value('y').$type)

    const schema = $$($('union').item(a.$type).item(b.$type).$type)
    expect(schema).toHaveProperty('anyOf')
    expect(schema).not.toHaveProperty('oneOf')
  })

  it('should round-trip a discriminated union through fromJsonSchema', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          properties: {
            petType: { const: 'cat', type: 'string' },
            name: { type: 'string' },
          },
          required: ['petType', 'name'],
        },
        {
          type: 'object',
          properties: {
            petType: { const: 'dog', type: 'string' },
            breed: { type: 'string' },
          },
          required: ['petType', 'breed'],
        },
      ],
      discriminator: {
        propertyName: 'petType',
        mapping: {
          cat: '#/oneOf/0',
          dog: '#/oneOf/1',
        },
      },
    }
    const type = fromJsonSchema(schema)
    const rebuilt = $$(type)
    expect(rebuilt).toEqual(schema)
  })
})

describe('$defs and $ref', () => {
  it('should extract named object union items into $defs', () => {
    const cat = $('object')
      .prop('petType', $().designType('string').value('cat').$type)
      .prop('name', $().designType('string').tags('string').$type)
      .id('Cat')

    const dog = $('object')
      .prop('petType', $().designType('string').value('dog').$type)
      .prop('breed', $().designType('string').tags('string').$type)
      .id('Dog')

    const union = $('union').item(cat.$type).item(dog.$type)

    const schema = $$(union.$type)

    expect(schema.$defs).toEqual({
      Cat: {
        type: 'object',
        properties: {
          petType: { const: 'cat', type: 'string' },
          name: { type: 'string' },
        },
        required: ['petType', 'name'],
      },
      Dog: {
        type: 'object',
        properties: {
          petType: { const: 'dog', type: 'string' },
          breed: { type: 'string' },
        },
        required: ['petType', 'breed'],
      },
    })
    expect(schema.oneOf).toEqual([{ $ref: '#/$defs/Cat' }, { $ref: '#/$defs/Dog' }])
  })

  it('should produce discriminator mapping with $ref paths for named types', () => {
    const cat = $('object')
      .prop('petType', $().designType('string').value('cat').$type)
      .prop('name', $().designType('string').tags('string').$type)
      .id('Cat')

    const dog = $('object')
      .prop('petType', $().designType('string').value('dog').$type)
      .prop('breed', $().designType('string').tags('string').$type)
      .id('Dog')

    const union = $('union').item(cat.$type).item(dog.$type)
    const schema = $$(union.$type)

    expect(schema.discriminator).toEqual({
      propertyName: 'petType',
      mapping: {
        cat: '#/$defs/Cat',
        dog: '#/$defs/Dog',
      },
    })
  })

  it('should NOT extract root type into $defs', () => {
    const obj = $('object').prop('name', $().designType('string').tags('string').$type).id('MyObj')

    const schema = $$(obj.$type)
    expect(schema.$defs).toBeUndefined()
    expect(schema.type).toBe('object')
    expect(schema.properties).toBeDefined()
  })

  it('should deduplicate shared types in $defs', () => {
    // Create a shared Address type
    const address = $('object')
      .prop('street', $().designType('string').tags('string').$type)
      .id('Address')

    // Two object types referencing the same Address
    const person = $('object').prop('home', address.$type).prop('work', address.$type).id('Person')

    const schema = $$(person.$type)

    // Address should appear once in $defs
    expect(Object.keys(schema.$defs!)).toEqual(['Address'])
    // Both props should be $ref
    expect(schema.properties.home).toEqual({ $ref: '#/$defs/Address' })
    expect(schema.properties.work).toEqual({ $ref: '#/$defs/Address' })
  })

  it('should keep types without id inline', () => {
    const cat = $('object').prop('name', $().designType('string').tags('string').$type)
    // no .id() call

    const dog = $('object').prop('breed', $().designType('string').tags('string').$type)
    // no .id() call

    const union = $('union').item(cat.$type).item(dog.$type)
    const schema = $$(union.$type)

    expect(schema.$defs).toBeUndefined()
    expect(schema.anyOf).toBeDefined()
    expect(schema.anyOf[0].type).toBe('object')
  })

  it('should resolve $ref in fromJsonSchema', () => {
    const schema = {
      $defs: {
        Cat: {
          type: 'object',
          properties: {
            petType: { const: 'cat', type: 'string' },
            name: { type: 'string' },
          },
          required: ['petType', 'name'],
        },
      },
      oneOf: [{ $ref: '#/$defs/Cat' }],
    }

    const type = fromJsonSchema(schema)
    expect(type.type.kind).toBe('union')
    const items = (type.type as any).items
    expect(items).toHaveLength(1)
    expect(items[0].type.kind).toBe('object')
    expect(items[0].type.props.has('petType')).toBe(true)
    expect(items[0].type.props.has('name')).toBe(true)
  })

  it('should round-trip schema with $defs through fromJsonSchema', () => {
    const cat = $('object')
      .prop('petType', $().designType('string').value('cat').$type)
      .prop('name', $().designType('string').tags('string').$type)
      .id('Cat')

    const dog = $('object')
      .prop('petType', $().designType('string').value('dog').$type)
      .prop('breed', $().designType('string').tags('string').$type)
      .id('Dog')

    const union = $('union').item(cat.$type).item(dog.$type)
    const schema = $$(union.$type)

    // Round-trip: the rebuilt schema won't have $defs because fromJsonSchema
    // doesn't preserve ids, but the structure should be equivalent
    const type = fromJsonSchema(schema)
    const rebuilt = $$(type)

    // Without ids, the rebuilt schema should have inline objects (no $defs)
    expect(rebuilt.oneOf || rebuilt.anyOf).toBeDefined()
    const items = rebuilt.oneOf || rebuilt.anyOf
    expect(items).toHaveLength(2)
  })
})

describe('mergeJsonSchemas', () => {
  it('should merge multiple schemas with shared $defs', () => {
    const cat = $('object').prop('name', $().designType('string').tags('string').$type).id('Cat')

    const dog = $('object').prop('breed', $().designType('string').tags('string').$type).id('Dog')

    const pets = $('union').item(cat.$type).item(dog.$type).id('Pets')
    const order = $('object').prop('id', $().designType('number').tags('number').$type).id('Order')

    const merged = mergeJsonSchemas([pets.$type, order.$type])

    expect(merged.schemas.Pets).toBeDefined()
    expect(merged.schemas.Order).toBeDefined()
    // Cat and Dog should be in shared $defs
    expect(merged.$defs.Cat).toBeDefined()
    expect(merged.$defs.Dog).toBeDefined()
    // Pets schema should not have its own $defs
    expect(merged.schemas.Pets.$defs).toBeUndefined()
  })

  it('should throw when a type has no id', () => {
    const noId = $('object').prop('name', $().designType('string').tags('string').$type)

    expect(() => mergeJsonSchemas([noId.$type])).toThrow(/all types must have an id/)
  })
})

describe('json-schema zero bounds', () => {
  it('emits 0 bounds given in the bare-number form', () => {
    const n = $()
      .designType('number')
      .annotate('expect.min', 0 as any)
      .annotate('expect.max', 0 as any)
    expect($$(n.$type)).toEqual({ type: 'number', minimum: 0, maximum: 0 })
    const s = $()
      .designType('string')
      .annotate('expect.minLength', 0 as any)
      .annotate('expect.maxLength', 0 as any)
    expect($$(s.$type)).toEqual({ type: 'string', minLength: 0, maxLength: 0 })
    const a = $('array')
      .of($().designType('string').$type)
      .annotate('expect.minLength', 0 as any)
      .annotate('expect.maxLength', 0 as any)
    expect($$(a.$type)).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 0,
      maxItems: 0,
    })
  })

  it('emits exclusive bounds (object and bare-number forms)', () => {
    const n = $()
      .designType('number')
      .annotate('expect.exclusiveMin', { exclusiveMinValue: 0 })
      .annotate('expect.exclusiveMax', 5 as any)
    expect($$(n.$type)).toEqual({ type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 5 })
  })

  it('merges exclusive union-level bounds onto members (stricter wins)', () => {
    const t = $('union')
      .item(
        $().designType('number').annotate('expect.exclusiveMin', { exclusiveMinValue: 5 }).$type
      )
      .item($().designType('null').$type)
      .annotate('expect.exclusiveMin', { exclusiveMinValue: 2 })
      .annotate('expect.exclusiveMax', { exclusiveMaxValue: 9 }).$type
    expect($$(t)).toEqual({
      anyOf: [{ type: 'number', exclusiveMinimum: 5, exclusiveMaximum: 9 }, { type: 'null' }],
    })
  })

  it('keeps both an inclusive and an exclusive bound when a union mixes them', () => {
    const t = $('union')
      .item($().designType('number').annotate('expect.min', { minValue: 5 }).$type)
      .item($().designType('null').$type)
      .annotate('expect.exclusiveMin', { exclusiveMinValue: 4 }).$type
    expect($$(t)).toEqual({
      anyOf: [{ type: 'number', minimum: 5, exclusiveMinimum: 4 }, { type: 'null' }],
    })
    const v = t.validator()
    expect([4.5, 5, null].map(x => v.validate(x, true))).toEqual([false, true, true])
  })

  it('round-trips 0 bounds', () => {
    for (const schema of [
      { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 0 },
      { type: 'number', minimum: 0, maximum: 0 },
      { type: 'string', minLength: 0, maxLength: 0 },
      { type: 'array', items: { type: 'number' }, minItems: 0, maxItems: 0 },
    ]) {
      expect($$(fromJsonSchema(schema))).toEqual(schema)
    }
  })
})
