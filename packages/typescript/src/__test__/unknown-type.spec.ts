import path from 'path'

import { build } from '@atscript/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { createDataFromAnnotatedType } from '../runtime/default-value'
import { fromJsonSchema } from '../runtime/json-schema'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'
import { prepareFixtures } from '../test-utils'

/*
 * `unknown`: any value. The validator does not check it, JSON Schema gives `{}`, TypeScript
 * `unknown`. Merged with a scalar it is that scalar. Runs in both validator engines.
 */

const rootDir = path.join(__dirname, 'fixtures', 'unknown-type')

let Payload: TAtscriptAnnotatedType
let Json: TAtscriptAnnotatedType

beforeAll(async () => {
  await prepareFixtures({
    rootDir,
    entries: ['model.as'],
    formats: ['js'],
    tsPluginOptions: { jsonSchema: 'lazy' },
  })
  ;({ Payload, Json } = await import(path.join(rootDir, 'model.as.js')))
})

const BASE = { data: 1, list: [], either: 'x', alias: null, narrowed: { v: 's' } }
const valid = (value: unknown) => Payload.validator().validate(value, true)

describe('unknown type', () => {
  it.each([null, 0, 'text', true, [1, 'a'], { a: { b: [null] } }])('accepts %j', v => {
    expect(valid({ ...BASE, data: v, extra: v, list: [v, v], either: v, alias: v })).toBe(true)
    expect(Json.validator().validate(v, true)).toBe(true)
  })

  it('still requires a required field', () => {
    const { data: _data, ...rest } = BASE
    expect(valid(rest)).toBe(false)
    const validator = Payload.validator()
    validator.validate(rest, true)
    expect(validator.errors[0]).toMatchObject({
      path: 'data',
      message: 'Expected unknown, got undefined',
      code: 'TYPE',
    })
    // (`undefined` is never a value: not in a list of `unknown` either)
    expect(valid({ ...BASE, list: [1, undefined] })).toBe(false)
    const { extra: _extra, ...withoutExtra } = { ...BASE, extra: 1 }
    expect(valid(withoutExtra)).toBe(true)
  })

  it('merged with a scalar is that scalar', () => {
    expect(valid({ ...BASE, narrowed: { v: 1 } })).toBe(false)
  })

  it('is `{}` in JSON Schema', () => {
    const schema = Payload.toJsonSchema() as any
    expect(schema.properties.data).toEqual({})
    expect(schema.properties.list).toEqual({ type: 'array', items: {} })
    expect(schema.required).toContain('data')
    expect(schema.required).not.toContain('extra')
  })

  it('default data of a required `unknown` field is `null`, and valid', () => {
    const data = createDataFromAnnotatedType(Payload) as Record<string, unknown>
    expect(data.data).toBeNull()
    expect(data.alias).toBeNull()
    expect(Payload.validator().validate(data, true)).toBe(true)
    // (a JSON Schema `{}` property: any value)
    const fromSchema = fromJsonSchema({
      type: 'object',
      properties: { a: {}, b: { type: 'string' } },
      required: ['a', 'b'],
    })
    const made = createDataFromAnnotatedType(fromSchema)
    expect(made).toEqual({ a: null, b: '' })
    expect(fromSchema.validator().validate(made, true)).toBe(true)
  })

  it('survives serialization', () => {
    const copy = deserializeAnnotatedType(serializeAnnotatedType(Payload))
    expect(copy.validator().validate({ ...BASE, data: { any: 'thing' } }, true)).toBe(true)
  })

  it('is TypeScript `unknown`', async () => {
    const repo = await build({ rootDir, entries: ['model.as'], plugins: [tsPlugin()] })
    const files = await repo.generate({ format: 'dts' })
    const dts = files.find(f => f.fileName.endsWith('model.as.d.ts'))!.content
    expect(dts).toContain('export type Json = unknown')
    expect(dts).toContain('  data: unknown\n')
    expect(dts).toContain('  extra?: unknown\n')
    expect(dts).toContain('  list: unknown[]\n')
  })
})
