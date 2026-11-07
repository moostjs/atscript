import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import { defineAnnotatedType } from '../runtime/annotated-type'
import { dropOptionalNulls } from '../runtime/drop-optional-nulls'
import { buildJsonSchema } from '../runtime/json-schema'
import {
  ANTHROPIC_STRICT,
  decodablePattern,
  OPENAI_STRICT,
  simplePattern,
} from '../runtime/json-schema-strict'
import { Validator } from '../runtime/validator'
import { deepFreeze, prepareFixtures } from '../test-utils'

const rootDir = path.join(__dirname, 'fixtures')

let m: Record<string, any>

beforeAll(async () => {
  await prepareFixtures({ rootDir, entries: ['json-schema-strict.as'] })
  m = await import(path.join(rootDir, 'json-schema-strict.as.js'))
})

describe('buildJsonSchema strict profiles', () => {
  it('OPENAI_STRICT', () => {
    expect(buildJsonSchema(m.Ticket, { strict: OPENAI_STRICT })).toMatchSnapshot()
  })

  it('ANTHROPIC_STRICT', () => {
    expect(buildJsonSchema(m.Ticket, { strict: ANTHROPIC_STRICT })).toMatchSnapshot()
  })

  it('without `strict`: the default schema (allOf, bounds, optional props left out)', () => {
    const schema = buildJsonSchema(m.Ticket)
    expect(schema).toMatchSnapshot()
    expect(schema).toEqual(buildJsonSchema(m.Ticket, { strict: undefined }))
    expect(schema.required).not.toContain('nickname')
    expect(schema.properties.name.allOf).toEqual([{ pattern: '^[a-z]' }, { pattern: '\\S' }])
    expect(schema.properties.tags.uniqueItems).toBe(true)
    expect(schema.properties.shipTo.allOf).toEqual([{ $ref: '#/$defs/Address' }])
  })

  it('OpenAI: every field required, optional ones nullable (inline objects too)', () => {
    const schema = buildJsonSchema(m.Ticket, { strict: OPENAI_STRICT })
    expect(schema.required).toEqual(Object.keys(schema.properties))
    expect(schema.properties.nickname).toEqual({
      description: 'What to call it',
      type: ['string', 'null'],
    })
    expect(schema.properties.billTo).toEqual({
      anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }],
    })
    // (an optional inline object: closed, every field required)
    expect(schema.properties.meta).toMatchObject({
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['a', 'b'],
    })
    expect(schema.properties.meta.properties.a.type).toEqual(['string', 'null'])
    // (optional `@meta.required` fields are nullable too: the model may leave them out)
    expect(schema.properties.title).toEqual({ type: ['string', 'null'], pattern: '\\S' })
    expect(schema.properties.ok).toEqual({
      anyOf: [{ type: 'boolean', const: true }, { type: 'null' }],
    })
    expect(schema.properties.either.anyOf).toContainEqual({ type: 'null' })
    expect(schema.$defs.Address.required).toEqual(['city', 'zip'])
    expect(schema.$defs.Address.properties.zip.type).toEqual(['string', 'null'])
  })

  it('dropOptionalNulls: what the model sends for left-out fields passes the validator', () => {
    const out = {
      name: 'ab',
      nickname: null,
      title: null,
      score: 1,
      tags: ['a'],
      pair: ['a', 'b'],
      meta: { a: null, b: 1 },
      ok: null,
      either: null,
      choice: 1,
      lookbehind: null,
      named: null,
      pet: { kind: 'cat' },
      shipTo: { city: 'c', zip: null },
      billTo: null,
    }
    const validator = new Validator(m.Ticket)
    expect(validator.validate(structuredClone(out), true)).toBe(false)
    expect(validator.errors.map(e => e.path)).toEqual(['title', 'ok', 'either'])
    const dropped = dropOptionalNulls(m.Ticket, structuredClone(out))
    expect(dropped).not.toHaveProperty('title')
    expect(dropped.meta).toEqual({ b: 1 })
    expect(dropped.shipTo).toEqual({ city: 'c' })
    expect(validator.validate(dropped, true)).toBe(true)
  })

  describe('dropOptionalNulls', () => {
    it('a union keeps the null a branch needs (no drops across branches)', () => {
      const value = { a: null, m: 'x' }
      const validator = new Validator(m.NullNeeded)
      expect(validator.validate(value, true)).toBe(true)
      const out = dropOptionalNulls(m.NullNeeded, value)
      expect(out).toBe(value)
      expect(out).toEqual({ a: null, m: 'x' })
      expect(validator.validate(out, true)).toBe(true)
    })

    it('a union drops a key every declaring branch has optional and non-nullable', () => {
      const value = { a: null, m: 'x' }
      expect(new Validator(m.AllOptional).validate(value, true)).toBe(true)
      const out = dropOptionalNulls(m.AllOptional, value)
      expect(out).toEqual({ m: 'x' })
      expect(out).not.toBe(value)
      expect(value).toEqual({ a: null, m: 'x' })
      expect(new Validator(m.AllOptional).validate(out, true)).toBe(true)
    })

    it('keeps null where the type accepts it, drops it otherwise', () => {
      const value = { clear: null, keep: null, other: null }
      const out = dropOptionalNulls(m.Patch, value)
      expect(out).toEqual({ clear: null, other: null })
      expect('keep' in out).toBe(false)
      expect(new Validator(m.Patch).validate(out, true)).toBe(true)
    })

    it('does not mutate, works on frozen input, returns the same reference when nothing changes', () => {
      const value = deepFreeze({
        needed: [{ a: null, m: 'x' }],
        optional: [
          { a: null, m: 'y' },
          { a: 'z', m: 'y' },
        ],
        patch: { clear: null, keep: null, other: null },
      })
      const before = structuredClone(value)
      const out = dropOptionalNulls(m.Bag, value)
      expect(value).toEqual(before)
      expect(out).not.toBe(value)
      expect(out).toEqual({
        needed: [{ a: null, m: 'x' }],
        optional: [{ m: 'y' }, { a: 'z', m: 'y' }],
        patch: { clear: null, other: null },
      })
      // (the untouched parts keep their references)
      expect(out.needed).toBe(value.needed)
      expect(out.optional[1]).toBe(value.optional[1])
      expect(new Validator(m.Bag).validate(out, true)).toBe(true)

      const clean = deepFreeze({
        needed: [{ a: 'q', m: 'x' }],
        optional: [{ k: 'y' }],
        patch: { clear: null, other: null },
      })
      expect(dropOptionalNulls(m.Bag, clean)).toBe(clean)
      expect(dropOptionalNulls(m.Bag, null)).toBeNull()
      expect(dropOptionalNulls(m.Bag, 5)).toBe(5)
    })

    it('an intersection drops a null only when no part accepts it', () => {
      // (the compiler merges intersected interfaces: build the intersection nodes directly)
      const both = (...parts: any[]) => {
        const node = defineAnnotatedType('intersection')
        for (const part of parts) {
          node.item(part)
        }
        return node.$type
      }
      for (const type of [
        both(m.PartPlain, m.PartNullable),
        both(m.PartPlain, m.PartRequiredNullable),
      ]) {
        const value = { x: null }
        expect(dropOptionalNulls(type, value)).toBe(value)
      }
      const type = both(m.PartPlain, m.OptionalA)
      const value = { x: null, a: null, k: 'y' }
      expect(dropOptionalNulls(type, value)).toEqual({ k: 'y' })
      expect(value).toEqual({ x: null, a: null, k: 'y' })
    })

    it('an array of unions is decided per item', () => {
      const out = dropOptionalNulls(m.Bag, {
        needed: [
          { a: null, m: 'x' },
          { a: null, k: 'y' },
          { a: 'v', k: 'y' },
        ],
        optional: [
          { a: null, m: 'x' },
          { a: null, k: 'y' },
        ],
        patch: { other: null },
      })
      // (`{ a: null, k }` fits only `UnionA`, where `a` is optional, but `UnionB` declares `a`)
      expect(out.needed).toEqual([
        { a: null, m: 'x' },
        { a: null, k: 'y' },
        { a: 'v', k: 'y' },
      ])
      expect(out.optional).toEqual([{ m: 'x' }, { k: 'y' }])
    })
  })

  it('Anthropic keeps optional fields optional', () => {
    const schema = buildJsonSchema(m.Ticket, { strict: ANTHROPIC_STRICT })
    expect(schema.required).not.toContain('nickname')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.meta).toMatchObject({ additionalProperties: false, required: ['b'] })
  })

  it('dropped constraints are described', () => {
    const openai = buildJsonSchema(m.Ticket, { strict: OPENAI_STRICT }).properties
    expect(openai.name.pattern).toBe('^[a-z]')
    expect(openai.name.description).toBe(
      'Must not be blank. At least 2 characters. At most 40 characters.'
    )
    expect(openai.tags).toMatchObject({ minItems: 1, maxItems: 5 })
    expect(openai.tags.description).toBe('Items must be unique.')
    expect(openai.meta.description).toBe('At least 1 property.')
    expect(openai.score).toEqual({ type: 'integer', minimum: 0, maximum: 10 })
    // (`\S` kept: no "At least 1 character.")
    expect(openai.title.description).toBeUndefined()
    // (OpenAI: no lookaround; a named group, `\b` in a class and a large bound are fine)
    expect(openai.lookbehind.pattern).toBeUndefined()
    expect(openai.lookbehind.description).toBe('Must match the pattern "(?<!x)y".')
    expect(openai.named.pattern).toBeDefined()

    const anthropic = buildJsonSchema(m.Ticket, { strict: ANTHROPIC_STRICT }).properties
    expect(anthropic.score).toEqual({ type: 'integer', description: 'Minimum 0. Maximum 10.' })
    expect(anthropic.tags).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'Items must be unique. At most 5 items.',
    })
    expect(anthropic.pair.description).toBe('At least 2 items.')
    expect(anthropic.lookbehind.description).toBe('Must match the pattern "(?<!x)y".')
    expect(anthropic.lookbehind.pattern).toBeUndefined()
    // (Anthropic: `{1,500}` is too large)
    expect(anthropic.named.pattern).toBeUndefined()
    expect(anthropic.title).toEqual({ type: 'string', pattern: '\\S' })
    // (`allOf` of patterns is allowed there)
    expect(anthropic.name.allOf).toEqual([{ pattern: '^[a-z]' }, { pattern: '\\S' }])
  })

  it('a reference with notes is inlined with them (no `allOf` beside a `$ref`)', () => {
    for (const strict of [OPENAI_STRICT, ANTHROPIC_STRICT]) {
      const schema = buildJsonSchema(m.Ticket, { strict })
      expect(schema.properties.shipTo).toMatchObject({
        type: 'object',
        title: 'Ship to',
        description: 'Delivery address',
        additionalProperties: false,
      })
      expect(JSON.stringify(schema)).not.toMatch(/"allOf":\[\{"\$ref"/)
      expect(schema.properties.pet.anyOf).toHaveLength(2)
      expect(schema.properties.pet.oneOf).toBeUndefined()
      expect(schema.properties.pet.discriminator).toBeUndefined()
    }
  })

  it('a reference with notes inside its own entry keeps them (beside an `anyOf`)', () => {
    const schema = buildJsonSchema(m.Chain, { strict: OPENAI_STRICT })
    expect(schema.properties.next).toMatchObject({
      type: 'object',
      description: 'The next link\n\nAt least 1 property.',
    })
    expect(schema.$defs.Chain.properties.next).toEqual({
      anyOf: [{ $ref: '#/$defs/Chain' }],
      description: 'The next link\n\nAt least 1 property.',
    })
  })

  it('recursion: allowed for OpenAI, throws for Anthropic', () => {
    const schema = buildJsonSchema(m.Tree, { strict: OPENAI_STRICT })
    expect(schema.properties.children.items).toEqual({ $ref: '#/$defs/Tree' })
    expect(schema.$defs.Tree.required).toEqual(['value', 'children'])
    expect(() => buildJsonSchema(m.Tree, { strict: ANTHROPIC_STRICT })).toThrow(
      'buildJsonSchema (strict: anthropic): recursive type "Tree" is not supported'
    )
  })

  it('shapes a profile can’t take throw', () => {
    expect(() => buildJsonSchema(m.Choice, { strict: OPENAI_STRICT })).toThrow(
      'buildJsonSchema (strict: openai): the root must be an object type'
    )
    expect(() => buildJsonSchema(m.WithRecord, { strict: OPENAI_STRICT })).toThrow(
      'a record (at rec) has no strict schema; use an array of key/value objects'
    )
    expect(() => buildJsonSchema(m.WithRecord, { strict: ANTHROPIC_STRICT })).toThrow(
      'a record (at rec) has no strict schema'
    )
    expect(() => buildJsonSchema(m.WithTuple, { strict: OPENAI_STRICT })).toThrow(
      'a tuple (at pair) has no strict schema'
    )
    expect(() => buildJsonSchema(m.WithUnknown, { strict: ANTHROPIC_STRICT })).toThrow(
      'a value of any type (at data) has no strict schema'
    )
  })

  it('simplePattern (Anthropic) and decodablePattern (OpenAI)', () => {
    for (const p of ['^[a-z]+\\d{2,5}$', '\\S', '(?:a|b)+', '\\\\b', '(?<n>a)', '[\\b]']) {
      expect(simplePattern(p), p).toBe(true)
      expect(decodablePattern(p), p).toBe(true)
    }
    for (const p of ['(?=a)', '(?!a)', '(?<=a)', '(?<!a)', '(a)\\1', '(?<n>a)\\k<n>', '(?i:a)']) {
      expect(simplePattern(p), p).toBe(false)
      expect(decodablePattern(p), p).toBe(false)
    }
    for (const p of ['\\bword', '\\p{L}', 'a{1,500}']) {
      expect(simplePattern(p), p).toBe(false)
      expect(decodablePattern(p), p).toBe(true)
    }
  })
})
