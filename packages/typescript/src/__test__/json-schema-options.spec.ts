import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { TTsPluginOptions } from '../plugin'
import { buildJsonSchema, fromJsonSchema, mergeJsonSchemas } from '../runtime/json-schema'
import type { TJsonSchemaOptions } from '../runtime/json-schema'
import { prepareFixtures } from '../test-utils'

const fixture = path.join(__dirname, 'fixtures/json-schema-options/options.as')
const dirs: string[] = []

/** `options.as` compiled with `tsPluginOptions` (in a directory of its own), and its JS text. */
async function compile(tsPluginOptions: TTsPluginOptions) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-json-schema-options-'))
  dirs.push(dir)
  copyFileSync(fixture, path.join(dir, 'options.as'))
  await prepareFixtures({ rootDir: dir, entries: ['options.as'], formats: ['js'], tsPluginOptions })
  const file = path.join(dir, 'options.as.js')
  return { m: await import(file), js: readFileSync(file, 'utf8') }
}

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('buildJsonSchema options', () => {
  let m: Record<string, any>

  beforeAll(async () => {
    ;({ m } = await compile({}))
  })

  describe('annotations (default: on)', () => {
    it('@meta.description → description, @meta.label → title on types and fields', () => {
      const schema = buildJsonSchema(m.Order)
      expect(schema.description).toBe('An order')
      expect(schema.properties.nickname).toEqual({
        description: 'Nickname',
        type: ['string', 'null'],
      })
      expect(schema.$defs.Address.title).toBe('Shipping address')
      expect(schema.$defs.Address.description).toBe('Where an order goes')
      expect(schema.$defs.Address.properties.city).toEqual({ title: 'City', type: 'string' })
    })

    it('a field’s own description beside a `$ref` (allOf); an inherited one only on the $defs entry', () => {
      const schema = buildJsonSchema(m.Order)
      expect(schema.properties.shipTo).toEqual({
        allOf: [{ $ref: '#/$defs/Address' }],
        description: 'Delivery address',
      })
      expect(schema.properties.billTo).toEqual({
        anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }],
      })
    })

    it('an optional field keeps its title beside the `anyOf` that adds null', () => {
      expect(buildJsonSchema(m.Order).properties.priority).toEqual({
        anyOf: [{ type: 'number', enum: [1, 2, 3] }, { type: 'null' }],
        title: 'Priority',
      })
    })

    it('an optional field with its own notes: the reference alone beside null (no lone allOf)', () => {
      const schema = buildJsonSchema(m.Order)
      expect(schema.properties.altAddress).toEqual({
        anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }],
        title: 'Alternative',
        description: 'Second address',
      })
    })

    it('annotations: false leaves them out', () => {
      const text = JSON.stringify(buildJsonSchema(m.Order, { annotations: false }))
      expect(text).not.toContain('"description"')
      expect(text).not.toContain('"title"')
      expect(buildJsonSchema(m.Order, { annotations: false }).properties.shipTo).toEqual({
        $ref: '#/$defs/Address',
      })
    })

    it('fromJsonSchema reads them back as @meta.description / @meta.label', () => {
      const type = fromJsonSchema(buildJsonSchema(m.Order))
      expect(type.metadata.get('meta.description')).toBe('An order')
      const back = buildJsonSchema(type)
      expect(back.properties.status.description).toBe('Order state')
      expect(JSON.stringify(back)).toContain('"title":"Shipping address"')
      expect(back.properties.shipTo.description).toBe('Delivery address')
    })
  })

  describe('enums (default: on)', () => {
    it('a union of literals → { type, enum }', () => {
      const schema = buildJsonSchema(m.Order)
      expect(schema.properties.status).toEqual({
        description: 'Order state',
        type: 'string',
        enum: ['active', 'blocked'],
      })
      expect(schema.properties.maybe).toEqual({ type: ['string', 'null'], enum: ['x', 'y', null] })
      expect(buildJsonSchema(m.Status)).toEqual({ type: 'string', enum: ['active', 'blocked'] })
    })

    it('a discriminated union stays oneOf', () => {
      expect(buildJsonSchema(m.Order).properties.pet.oneOf).toHaveLength(2)
    })

    it('enums: false keeps the anyOf of const schemas', () => {
      expect(buildJsonSchema(m.Status, { enums: false })).toEqual({
        anyOf: [
          { const: 'active', type: 'string' },
          { const: 'blocked', type: 'string' },
        ],
      })
    })

    it('an enum reads back as the same union', () => {
      const type = fromJsonSchema(buildJsonSchema(m.Order))
      for (const value of ['active', 'blocked', 'other', 1]) {
        const v = {
          status: value,
          maybe: null,
          shipTo: { city: 'x' },
          tags: [],
          pet: { kind: 'cat' },
        }
        expect(type.validator().validate(v, true)).toBe(m.Order.validator().validate(v, true))
      }
    })
  })

  describe('closed (default: off)', () => {
    it('adds additionalProperties: false to every object schema', () => {
      const schema = buildJsonSchema(m.Order, { closed: true })
      expect(schema.additionalProperties).toBe(false)
      expect(schema.$defs.Address.additionalProperties).toBe(false)
      expect(schema.$defs.Dog.additionalProperties).toBe(false)
      expect(schema.properties.note.additionalProperties).toBe(false)
    })

    it('is off by default', () => {
      expect(JSON.stringify(buildJsonSchema(m.Order))).not.toContain('additionalProperties')
    })
  })

  it('mergeJsonSchemas passes the options on', () => {
    const merged = mergeJsonSchemas([m.Order], { closed: true, annotations: false })
    expect(merged.schemas.Order.additionalProperties).toBe(false)
    expect(merged.$defs.Address.additionalProperties).toBe(false)
    expect(merged.$defs.Address.title).toBeUndefined()
  })
})

describe('jsonSchemaOptions plugin option: toJsonSchema() equals buildJsonSchema(type, options)', () => {
  const OPTIONS: Array<TJsonSchemaOptions | undefined> = [
    undefined,
    { closed: true },
    { closed: true, annotations: false, enums: false },
  ]
  for (const jsonSchemaOptions of OPTIONS) {
    for (const jsonSchema of ['bundle', 'lazy', false] as const) {
      it(`jsonSchema: ${String(jsonSchema)}, ${JSON.stringify(jsonSchemaOptions)}`, async () => {
        const { m: mod, js } = await compile({ jsonSchema, jsonSchemaOptions })
        // (`jsonSchema: false`: only the `@emit.jsonSchema` type has a schema)
        const names = jsonSchema === false ? ['Emitted'] : ['Order', 'Address', 'Emitted']
        for (const name of names) {
          expect(mod[name].toJsonSchema()).toEqual(buildJsonSchema(mod[name], jsonSchemaOptions))
        }
        if (jsonSchemaOptions?.closed) {
          expect(mod.Emitted.toJsonSchema().additionalProperties).toBe(false)
        }
        // (default options are not written into the generated code)
        expect(js.includes('"closed":true')).toBe(!!jsonSchemaOptions?.closed)
      })
    }
  }
})
