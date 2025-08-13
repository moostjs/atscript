import { describe, expect, it } from 'vitest'
import { defineAnnotatedType as $, TAtscriptAnnotatedType } from './annotated-type'
import { buildJsonSchema as $$ } from './json-schema'
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
  static _jsonSchema
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
      plugins: [tsPlugin({ preRenderJsonSchema: true })],
    })
    const out = await repo.generate({ format: 'js' })
    const content = out[0].content
      .split('\n')
      .filter(s => s.trim().startsWith('static _jsonSchema = {'))?.[0]
    const schema = content.trim().slice('static _jsonSchema = '.length)
    expect(JSON.parse(schema)).toEqual(expectedSchema)
  })
})
