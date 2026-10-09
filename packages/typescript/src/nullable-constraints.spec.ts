import path from 'path'

import { build } from '@atscript/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { tsPlugin } from './plugin'
import { defineAnnotatedType as $ } from './runtime/annotated-type'
import { buildJsonSchema, fromJsonSchema } from './runtime/json-schema'
import { Validator, type TValidatorOptions } from './runtime/validator'
import { prepareFixtures } from './test-utils'

/** A subclass never takes the fast pre-check, so it always runs the error-collecting walk. */
class WalkValidator extends Validator {}

const rootDir = path.join(__dirname, '..', 'test', 'fixtures')

let NullableConstraints: any
let RequiredOptional: any
let InlinePrimitives: any
let KeyedNullable: any

beforeAll(async () => {
  await prepareFixtures({ rootDir, entries: ['nullable-constraints.as'] })
  ;({ NullableConstraints, RequiredOptional, InlinePrimitives, KeyedNullable } = await import(
    path.join(rootDir, 'nullable-constraints.as.js')
  ))
})

function validBase(): any {
  return {
    score: 5,
    count: 2,
    level: 0,
    code: 'abc',
    title: 'T',
    tags: ['a'],
    nested: {},
    items: [{ label: 'x' }],
  }
}

/** Validates with the fast-path validator and the walk, asserts parity, returns errors. */
function check(type: any, value: any, opts?: Partial<TValidatorOptions>) {
  const fast = new Validator(type, opts)
  const walk = new WalkValidator(type, opts)
  const ok = fast.validate(structuredClone(value), true)
  expect(walk.validate(structuredClone(value), true)).toBe(ok)
  expect(fast.errors).toEqual(walk.errors)
  return ok ? [] : fast.errors.map(e => `${e.path}: ${e.message}`)
}

describe('union-level constraints on nullable fields', () => {
  it('accepts null and in-range values', () => {
    expect(check(NullableConstraints, validBase())).toEqual([])
    expect(
      check(NullableConstraints, {
        score: null,
        count: null,
        level: null,
        code: null,
        title: null,
        tags: null,
        opt: null,
        nested: { n: null },
        items: [{ label: null }],
      })
    ).toEqual([])
    expect(check(NullableConstraints, { ...validBase(), score: 0, opt: 100 })).toEqual([])
    expect(check(NullableConstraints, { ...validBase(), score: 10, nested: { n: 3 } })).toEqual([])
  })

  it('enforces number bounds and int on number | null', () => {
    expect(check(NullableConstraints, { ...validBase(), score: -1 })).toEqual([
      'score: Expected minimum 0, got -1',
    ])
    expect(check(NullableConstraints, { ...validBase(), score: 11 })).toEqual([
      'score: Expected maximum 10, got 11',
    ])
    expect(check(NullableConstraints, { ...validBase(), opt: 101 })).toEqual([
      'opt: Expected maximum 100, got 101',
    ])
    expect(check(NullableConstraints, { ...validBase(), level: -1 })).toEqual([
      'level: Expected minimum 0, got -1',
    ])
  })

  it('enforces constraints through a nullable alias, with custom messages', () => {
    expect(check(NullableConstraints, { ...validBase(), count: 0 })).toEqual([
      'count: Count must be at least 1',
    ])
    expect(check(NullableConstraints, { ...validBase(), count: 1.5 })).toEqual([
      'count: Expected integer, got 1.5',
    ])
  })

  it('keeps member-level constraints (number.int) on top of union-level ones', () => {
    expect(check(NullableConstraints, { ...validBase(), level: 1.5 })).toEqual([
      expect.stringMatching(/^level: Value does not match any of the allowed types/),
    ])
  })

  it('enforces string constraints on string | null', () => {
    expect(check(NullableConstraints, { ...validBase(), code: 'a' })).toEqual([
      'code: Expected minimum length of 2 characters, got 1 characters',
    ])
    expect(check(NullableConstraints, { ...validBase(), code: 'abcdef' })).toEqual([
      'code: Expected maximum length of 5 characters, got 6 characters',
    ])
    expect(check(NullableConstraints, { ...validBase(), code: 'AB' })).toEqual([
      'code: Value is expected to match pattern "^[a-z]+$"',
    ])
  })

  it('@meta.required on string | null: null passes, a blank string fails', () => {
    expect(check(NullableConstraints, { ...validBase(), title: null })).toEqual([])
    expect(check(NullableConstraints, { ...validBase(), title: '  ' })).toEqual([
      'title: Must not be empty',
    ])
  })

  it('enforces array constraints on T[] | null', () => {
    expect(check(NullableConstraints, { ...validBase(), tags: ['a', 'b', 'c'] })).toEqual([
      'tags: Expected maximum length of 2 items, got 3 items',
    ])
    expect(check(NullableConstraints, { ...validBase(), tags: ['a', 'a'] })).toEqual([
      'tags.1: Duplicate items are not allowed',
    ])
  })

  it('uniqueItems on a nullable array compares by @expect.array.key, also through a nullable alias', () => {
    const dup = [
      { id: 'a', v: 1 },
      { id: 'a', v: 2 },
    ]
    const distinct = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
    ]
    expect(check(KeyedNullable, { direct: null, nested: null })).toEqual([])
    expect(check(KeyedNullable, { direct: distinct, nested: distinct })).toEqual([])
    expect(check(KeyedNullable, { direct: dup, nested: dup })).toEqual([
      'direct.1: Duplicate items are not allowed',
      'nested.1: Duplicate items are not allowed',
    ])
  })

  it('enforces constraints in nested objects and array items', () => {
    expect(check(NullableConstraints, { ...validBase(), nested: { n: 4 } })).toEqual([
      'nested.n: Expected maximum 3, got 4',
    ])
    expect(
      check(NullableConstraints, { ...validBase(), items: [{ label: 'ok' }, { label: 'long' }] })
    ).toEqual(['items.1.label: Expected maximum length of 3 characters, got 4 characters'])
  })

  it('parity holds across validator options', () => {
    const values = [
      validBase(),
      { ...validBase(), score: -1, code: 'A', tags: ['a', 'a'] },
      { ...validBase(), score: undefined },
      { ...validBase(), items: [{ label: 'long' }], nested: { n: 9 } },
      { score: 99 },
    ]
    const optionSets: Array<Partial<TValidatorOptions>> = [
      {},
      { partial: true },
      { partial: 'deep' },
      { unknownProps: 'strip' },
      { errorLimit: 1 },
    ]
    for (const value of values) {
      for (const opts of optionSets) {
        check(NullableConstraints, value, opts)
      }
    }
  })
})

describe('built-in primitive extensions as union members / array elements', () => {
  const valid = () => ({
    contact: 'a@b.co',
    emails: ['a@b.co'],
    ints: [1],
    pair: [1, 'a@b.co'],
    aliased: 'a@b.co',
    aliasedList: ['a@b.co'],
  })

  it('keep their built-in constraints', () => {
    expect(check(InlinePrimitives, valid())).toEqual([])
    expect(check(InlinePrimitives, { ...valid(), contact: null })).toEqual([])
    expect(check(InlinePrimitives, { ...valid(), contact: 'nope' })).toEqual([
      expect.stringMatching(/^contact: Value does not match any of the allowed types/),
    ])
    expect(check(InlinePrimitives, { ...valid(), emails: ['nope'] })).toEqual([
      'emails.0: Invalid email format.',
    ])
    expect(check(InlinePrimitives, { ...valid(), ints: [1, 1.5] })).toEqual([
      'ints.1: Expected integer, got 1.5',
    ])
    expect(check(InlinePrimitives, { ...valid(), pair: [1.5, 'a@b.co'] })).toEqual([
      'pair.0: Expected integer, got 1.5',
    ])
    expect(check(InlinePrimitives, { ...valid(), aliasedList: ['nope'] })).toEqual([
      'aliasedList.0: Invalid email format.',
    ])
  })

  it('appear in the JSON schema', () => {
    const p = buildJsonSchema(InlinePrimitives).properties
    expect(p.ints.items).toEqual({ type: 'integer' })
    expect(p.emails.items.pattern).toBeDefined()
    expect(p.contact.anyOf[0].pattern).toBeDefined()
    expect(p.aliased.anyOf[0].pattern).toBe(p.contact.anyOf[0].pattern)
    expect(p.aliasedList.items.pattern).toBe(p.contact.anyOf[0].pattern)
  })
})

describe('@meta.required on optional fields', () => {
  it('allows omitting the field', () => {
    expect(check(RequiredOptional, {})).toEqual([])
    expect(check(RequiredOptional, { child: {} })).toEqual([])
  })

  it('rejects null with the @meta.required message', () => {
    expect(check(RequiredOptional, { name: null })).toEqual(['name: Must not be empty'])
    expect(check(RequiredOptional, { agreed: null })).toEqual(['agreed: Accept the terms'])
    expect(check(RequiredOptional, { child: { note: null } })).toEqual([
      'child.note: Must not be empty',
    ])
  })

  it('still rejects blank strings and false', () => {
    expect(check(RequiredOptional, { name: ' ' })).toEqual(['name: Must not be empty'])
    expect(check(RequiredOptional, { agreed: false })).toEqual(['agreed: Accept the terms'])
  })

  it('accepts null when the type is explicitly nullable, and on optional fields without @meta.required', () => {
    expect(check(RequiredOptional, { nullableName: null, plain: null })).toEqual([])
    expect(check(RequiredOptional, { nullableName: '' })).toEqual([
      'nullableName: Must not be empty',
    ])
  })

  it('partial validation: omitted is fine, null is not', () => {
    for (const partial of [true, 'deep'] as const) {
      expect(check(RequiredOptional, { name: undefined }, { partial })).toEqual([])
      expect(check(RequiredOptional, { name: null }, { partial })).toEqual([
        'name: Must not be empty',
      ])
    }
  })
})

describe('JSON schema for union-level constraints', () => {
  it('puts the constraints on the matching non-null anyOf members', () => {
    const schema = buildJsonSchema(NullableConstraints)
    const p = schema.properties
    expect(p.score).toEqual({
      anyOf: [{ type: 'number', minimum: 0, maximum: 10 }, { type: 'null' }],
    })
    expect(p.count).toEqual({ anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] })
    expect(p.level).toEqual({ anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] })
    expect(p.code).toEqual({
      anyOf: [
        { type: 'string', minLength: 2, maxLength: 5, pattern: '^[a-z]+$' },
        { type: 'null' },
      ],
    })
    expect(p.title).toEqual({ anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] })
    expect(p.tags).toEqual({
      anyOf: [{ type: 'array', items: { type: 'string' }, maxItems: 2 }, { type: 'null' }],
    })
    expect(p.nested.properties.n).toEqual({
      anyOf: [{ type: 'number', maximum: 3 }, { type: 'null' }],
    })
    expect(p.items.items.properties.label).toEqual({
      anyOf: [{ type: 'string', maxLength: 3 }, { type: 'null' }],
    })
  })

  it('the build-time (bundled) schema matches the runtime one', async () => {
    const repo = await build({
      rootDir,
      entries: ['nullable-constraints.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
    })
    const out = await repo.generate({ format: 'js' })
    const content = out[0].content
    const runtime = [NullableConstraints, InlinePrimitives].map(t => buildJsonSchema(t))
    const bundled = content
      .split('\n')
      .filter(l => l.trim().startsWith('return {'))
      .map(l => JSON.parse(l.trim().slice('return '.length)))
    for (const schema of runtime) {
      expect(bundled).toContainEqual(schema)
    }
  })

  it('leaves literal members alone, like the validator', () => {
    // `.as` rejects constraints on literal unions; only a hand-built type gets here.
    const t = $('union')
      .item($().designType('number').value(9).$type)
      .item($().designType('number').$type)
      .annotate('expect.max', { maxValue: 5 }).$type
    expect(buildJsonSchema(t)).toEqual({
      anyOf: [
        { const: 9, type: 'number' },
        { type: 'number', maximum: 5 },
      ],
    })
    expect(new Validator(t).validate(9, true)).toBe(true)
  })

  it('round-trips through fromJsonSchema with the same validation', () => {
    const schema = buildJsonSchema(NullableConstraints)
    const restored = fromJsonSchema(schema)
    const v = new Validator(restored)
    expect(v.validate(validBase(), true)).toBe(true)
    expect(v.validate({ ...validBase(), score: 11 }, true)).toBe(false)
    expect(v.validate({ ...validBase(), code: 'AB' }, true)).toBe(false)
    expect(v.validate({ ...validBase(), score: null, code: null }, true)).toBe(true)
  })
})
