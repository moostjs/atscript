import { describe, expect, it } from 'vitest'
import { defineAnnotatedType as $, TAtscriptAnnotatedType } from './annotated-type'
import { buildJsonSchema as $$, fromJsonSchema } from './json-schema'
import { AnnotationSpec, build } from '@atscript/core'
import { tsPlugin } from './plugin'
import path from 'path'
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
    const content = out[0].content
      .split('\n')
      .filter(s => s.trim().startsWith('return {'))?.[0]
    const schema = content.trim().slice('return '.length)
    expect(JSON.parse(schema)).toEqual(expectedSchema)
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

    it('should convert integer with constraints', () => {
      const type = fromJsonSchema({ type: 'integer', minimum: 1, maximum: 10 })
      expect(type.metadata.get('expect.int')).toBe(true)
      expect(type.metadata.get('expect.min')).toEqual({ minValue: 1 })
      expect(type.metadata.get('expect.max')).toEqual({ maxValue: 10 })
    })

    it('should convert array minItems/maxItems', () => {
      const type = fromJsonSchema({ type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 })
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
          if (obj?.required) obj.required = [...obj.required].sort()
          if (obj?.properties) {
            for (const v of Object.values(obj.properties)) sortRequired(v)
          }
          if (obj?.items && !Array.isArray(obj.items)) sortRequired(obj.items)
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
    it('should throw on $ref', () => {
      expect(() => fromJsonSchema({ $ref: '#/definitions/Foo' })).toThrow(
        /\$ref is not supported/
      )
    })
  })
})
