import { beforeAll, describe, expect, it } from 'vitest'

import { AnnotationSpec } from '../annotations'
import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { PluginManager } from '../plugin/plugin-manager'

/*
 * The `value` argument kind: a string, number or boolean literal. A number / boolean must fit
 * the annotated field's type; a string fits any field.
 */

const plugin = {
  name: 'value-test',
  config() {
    return {
      annotations: {
        x: {
          default: new AnnotationSpec({
            nodeType: ['prop'],
            argument: { name: 'value', type: 'value' },
          }),
        },
      },
    }
  },
}

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  docConfig = await new PluginManager({ plugins: [plugin] }).getDocConfig()
})

function errors(source: string) {
  const doc = new AtscriptDoc('file:///proj/test.as', docConfig)
  doc.update(source)
  return doc
    .getDiagMessages()
    .filter(m => m.severity === 1)
    .map(m => m.message)
}

describe('`value` annotation argument', () => {
  it('accepts a number for a number field, a boolean for a boolean field', () => {
    expect(
      errors(`interface A {
  @x.default 0
  count: number
  @x.default -1.5
  ratio: number.double
  @x.default 3
  level?: number.int | null
  @x.default true
  on: boolean
  @x.default 1
  kind: 1 | 2
}`)
    ).toEqual([])
  })

  it('accepts a string for any field', () => {
    expect(
      errors(`interface A {
  @x.default 'active'
  status: string
  @x.default '0'
  count: number
  @x.default '{"a":1}'
  data: { a: number }
}`)
    ).toEqual([])
  })

  it('accepts any literal for an `unknown` field', () => {
    expect(
      errors(`interface A {
  @x.default 0
  a: unknown
  @x.default false
  b: unknown
}`)
    ).toEqual([])
  })

  it('refuses a number or boolean that does not fit the field type', () => {
    expect(
      errors(`interface A {
  @x.default 0
  name: string
  @x.default true
  count: number
  @x.default true
  price: decimal
}`)
    ).toEqual([
      '@x.default at argument #1 ("value"): a number does not fit the field\'s type (string).',
      '@x.default at argument #1 ("value"): a boolean does not fit the field\'s type (number).',
      '@x.default at argument #1 ("value"): a boolean does not fit the field\'s type (decimal).',
    ])
  })

  it('accepts a number on a decimal field', () => {
    expect(
      errors(`interface A {
  @x.default 0
  price: decimal
  @x.default 12.50
  total?: decimal | null
}`)
    ).toEqual([])
  })

  it('reads a scalar merge as the merged type', () => {
    expect(
      errors(`type Int = number & number.int
type Any = unknown & number
interface A {
  @x.default 1
  a: number & number.int
  @x.default 2
  b: Int
  @x.default 3
  c: Any
  @x.default 4
  d: unknown & number
  @x.default 'x'
  e: Int
}`)
    ).toEqual([])
    expect(
      errors(`interface A {
  @x.default true
  a: number & number.int
  @x.default 1
  b: unknown & string
}`)
    ).toEqual([
      '@x.default at argument #1 ("value"): a boolean does not fit the field\'s type (number).',
      '@x.default at argument #1 ("value"): a number does not fit the field\'s type (string).',
    ])
  })

  it('checks the field an annotate entry names', () => {
    expect(
      errors(`interface A { name: string, count: number }
annotate A {
  @x.default 0
  count
  @x.default 0
  name
}`)
    ).toEqual([
      '@x.default at argument #1 ("value"): a number does not fit the field\'s type (string).',
    ])
  })

  it('refuses other tokens', () => {
    expect(
      errors(`interface A {
  @x.default yes
  on: boolean
}`)
    ).toEqual(['@x.default at argument #1 ("value") must be one of [true, false]'])
  })
})
