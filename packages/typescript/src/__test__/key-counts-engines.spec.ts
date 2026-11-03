import { describe, expect, it } from 'vitest'

import { boundCheck, compileType } from '../../test/compiled-engine'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { WalkValidator } from '../test-utils'

/*
 * `@expect.minKeys` / `@expect.maxKeys` count the keys the result keeps: every own key with
 * `unknownProps: 'ignore'`; the declared (and pattern-matched) keys with 'strip' and 'error'. A
 * failed count is reported and the props are still checked. The interpreted pre-check, a compiled
 * check and the walk decide every value the same (and strip the same keys).
 */

const num = () => $().designType('number')
const str = () => $().designType('string')
const lit = (v: string) => $().designType('string').value(v)
const obj = (props: Record<string, TAtscriptAnnotatedType>) => {
  const h = $('object')
  for (const [k, v] of Object.entries(props)) {
    h.prop(k, v)
  }
  return h
}
const union = (...items: TAtscriptAnnotatedType[]) => {
  const h = $('union')
  for (const item of items) {
    h.item(item)
  }
  return h
}
const counts = (h: ReturnType<typeof $>, min?: number, max?: number) => {
  if (min !== undefined) {
    h.annotate('expect.minKeys', { count: min })
  }
  if (max !== undefined) {
    h.annotate('expect.maxKeys', { count: max })
  }
  return h
}
const ab = () => obj({ a: num().optional().$type, b: num().optional().$type })

const TYPES: Record<string, () => TAtscriptAnnotatedType> = {
  fixed: () => counts(ab(), 1, 1).$type,
  record: () => counts($('object').propPattern(/^[a-z]$/, num().$type), 1, 1).$type,
  steer: () =>
    obj({
      v: union(
        counts(ab(), undefined, 1).$type,
        obj({ a: num().optional().$type, b: num().optional().$type, c: num().optional().$type })
          .$type
      ).$type,
    }).$type,
  unionLevel: () => counts(union(ab().$type, $().designType('null').$type), 1, 1).$type,
  arrayOf: () => $('array').of(counts(ab(), 1, 1).$type).$type,
  optionalProp: () => obj({ p: counts(ab(), 1, 1).optional().$type }).$type,
  tuple: () => $('tuple').item(counts(ab(), 1, 1).$type).$type,
  discriminated: () =>
    union(
      counts(obj({ k: lit('x').$type, a: num().optional().$type, b: num().optional().$type }), 2, 2)
        .$type,
      obj({ k: lit('y').$type, a: num().optional().$type, b: num().optional().$type }).$type
    ).$type,
  stripSteer: () =>
    union(
      counts(obj({ a: num().optional().$type }), undefined, 1).$type,
      obj({ a: num().optional().$type, z: str().optional().$type }).$type
    ).$type,
  withPhantom: () =>
    counts(obj({ a: num().optional().$type, ph: $().designType('phantom').$type }), 1, 1).$type,
}

const VALUES: Array<[string, () => unknown]> = [
  ['{}', () => ({})],
  ['{a}', () => ({ a: 1 })],
  ['{a,b}', () => ({ a: 1, b: 2 })],
  ['{a:undefined}', () => ({ a: undefined })],
  ['{a:undefined,b}', () => ({ a: undefined, b: 2 })],
  ['{a:"x",b}', () => ({ a: 'x', b: 2 })],
  ['{z}', () => ({ z: 1 })],
  ['{a,z}', () => ({ a: 1, z: 1 })],
  ['{a,z:"s"}', () => ({ a: 1, z: 's' })],
  ['{a,b,z}', () => ({ a: 1, b: 2, z: 1 })],
  ['{k:x,a}', () => ({ k: 'x', a: 1 })],
  ['{k:x,a,b}', () => ({ k: 'x', a: 1, b: 2 })],
  ['{k:x,a,z}', () => ({ k: 'x', a: 1, z: 1 })],
  ['{k:y}', () => ({ k: 'y' })],
  ['{k:y,a,z}', () => ({ k: 'y', a: 1, z: 1 })],
  ['{ph,a}', () => ({ ph: 1, a: 1 })],
  ['proto', () => Object.create({ a: 1 })],
  ['null', () => null],
  ['[]', () => []],
  ['"x"', () => 'x'],
]

/** The value at the position the type checks. */
function wrap(name: string, v: () => unknown): () => unknown {
  switch (name) {
    case 'steer': {
      return () => ({ v: v() })
    }
    case 'arrayOf': {
      return () => [v(), { a: 1 }]
    }
    case 'optionalProp': {
      return () => ({ p: v() })
    }
    case 'tuple': {
      return () => [v()]
    }
    default: {
      return v
    }
  }
}

const OPTS: Array<Partial<TValidatorOptions>> = []
for (const unknownProps of ['error', 'strip', 'ignore'] as const) {
  for (const partial of [false, true, 'deep'] as const) {
    OPTS.push({ unknownProps, partial })
  }
  OPTS.push({ unknownProps, errorLimit: 1 })
}

describe('key counts: the pre-check, compiled checks and the walk agree', () => {
  it('every type × value × option set', () => {
    const diffs: string[] = []
    for (const [name, make] of Object.entries(TYPES)) {
      const walkType = make()
      const fastType = make()
      const compiledType = make()
      compileType(compiledType)
      expect(boundCheck(compiledType), name).not.toBeNull()
      for (const [label, mk] of VALUES) {
        const value = wrap(name, mk)
        for (const opts of OPTS) {
          const w = value()
          const f = value()
          const c = value()
          const walk = new WalkValidator(walkType, opts).validate(w, true)
          const fast = new Validator(fastType, opts).validate(f, true)
          const compiled = new Validator(compiledType, opts).validate(c, true)
          const at = `${name} ${label} ${JSON.stringify(opts)}`
          if (fast !== walk || JSON.stringify(f) !== JSON.stringify(w)) {
            diffs.push(`${at}: pre-check ${fast}, walk ${walk}`)
          }
          if (compiled !== walk || JSON.stringify(c) !== JSON.stringify(w)) {
            diffs.push(`${at}: compiled ${compiled}, walk ${walk}`)
          }
        }
      }
    }
    expect(diffs).toEqual([])
  })
})

describe('key counts: the keys the result keeps', () => {
  const t = () => counts(obj({ a: num().optional().$type }), 1, 1).$type

  it("'strip' counts the declared keys", () => {
    const value = { a: 1, z: 1 }
    expect(new Validator(t(), { unknownProps: 'strip' }).validate(value, true)).toBe(true)
    expect(value).toEqual({ a: 1 })
    const v = new Validator(t(), { unknownProps: 'strip' })
    const unknownOnly = { z: 1 }
    expect(v.validate(unknownOnly, true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: '', code: 'MIN_KEYS', params: { min: 1, actual: 0 } }])
    expect(unknownOnly).toEqual({ z: 1 })
  })

  it("'ignore' counts every own key", () => {
    const v = new Validator(t(), { unknownProps: 'ignore' })
    expect(v.validate({ z: 1 }, true)).toBe(true)
    expect(v.validate({ a: 1, z: 1 }, true)).toBe(false)
    expect(v.errors).toMatchObject([{ code: 'MAX_KEYS', params: { max: 1, actual: 2 } }])
  })

  it("'error' counts the declared keys: an unknown key is its own error", () => {
    const v = new Validator(t())
    expect(v.validate({ a: 1, z: 1 }, true)).toBe(false)
    expect(v.errors.map(e => [e.path, e.code])).toEqual([['z', 'UNEXPECTED_PROPERTY']])
    expect(v.validate({ z: 1 }, true)).toBe(false)
    expect(v.errors.map(e => [e.path, e.code])).toEqual([
      ['', 'MIN_KEYS'],
      ['z', 'UNEXPECTED_PROPERTY'],
    ])
  })

  it('pattern props are counted as declared', () => {
    const rec = counts($('object').propPattern(/^[a-z]$/, num().$type), undefined, 1).$type
    const v = new Validator(rec, { unknownProps: 'strip' })
    const value = { a: 1, Z: 1 }
    expect(v.validate(value, true)).toBe(true)
    expect(value).toEqual({ a: 1 })
  })

  it('a failed count is reported with the errors of the props', () => {
    const v = new Validator(counts(ab(), 2).$type)
    expect(v.validate({ a: 'x' }, true)).toBe(false)
    expect(v.errors.map(e => [e.path, e.code])).toEqual([
      ['', 'MIN_KEYS'],
      ['a', 'TYPE'],
    ])
    // the error limit: the count only
    const first = new Validator(counts(ab(), 2).$type, { errorLimit: 1 })
    expect(first.validate({ a: 'x' }, true)).toBe(false)
    expect(first.errors.map(e => e.code)).toEqual(['MIN_KEYS'])
  })
})
