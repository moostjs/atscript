import path from 'path'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  annotate,
  cloneRefProp,
  defineAnnotatedType as $,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeObject,
} from '../runtime/annotated-type'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { prepareFixtures } from '../test-utils'

/**
 * Reference: a subclass never takes the allocation-free pre-check nor the literal-union
 * shortcut, so it runs exactly the original error-collecting walk.
 */
class WalkValidator extends Validator {}

// ── fixtures ────────────────────────────────────────────────────────────────

const str = (meta: Record<string, unknown> = {}) => {
  const h = $().designType('string').tags('string')
  for (const [k, v] of Object.entries(meta)) {
    h.annotate(k as any, v, k === 'expect.pattern')
  }
  return h
}
const num = (meta: Record<string, unknown> = {}) => {
  const h = $().designType('number').tags('number')
  for (const [k, v] of Object.entries(meta)) {
    h.annotate(k as any, v)
  }
  return h
}
const bool = (meta: Record<string, unknown> = {}) => {
  const h = $().designType('boolean').tags('boolean')
  for (const [k, v] of Object.entries(meta)) {
    h.annotate(k as any, v)
  }
  return h
}
const lit = (v: string | number | boolean) =>
  $()
    .designType(typeof v as 'string')
    .value(v)
const prim = (designType: any) => $().designType(designType)
const union = (...items: TAtscriptAnnotatedType[]) => {
  const h = $('union')
  for (const i of items) {
    h.item(i)
  }
  return h
}
const obj = (props: Record<string, TAtscriptAnnotatedType>) => {
  const h = $('object')
  for (const [k, v] of Object.entries(props)) {
    h.prop(k, v)
  }
  return h
}
const arr = (of: TAtscriptAnnotatedType, meta: Record<string, unknown> = {}) => {
  const h = $('array').of(of)
  for (const [k, v] of Object.entries(meta)) {
    h.annotate(k as any, v)
  }
  return h
}

function makeOrder() {
  const address = obj({
    street: str({ 'meta.label': 'Street', 'expect.maxLength': 200 }).$type,
    city: str({ 'meta.label': 'City', 'meta.required': true }).$type,
    zip: str({ 'expect.pattern': { pattern: '^\\d{5}$', flags: 'u', message: 'bad zip' } }).$type,
    country: str({ 'expect.minLength': 2, 'expect.maxLength': 2 }).$type,
    line2: str().optional().$type,
  })
  const lineItem = obj({
    sku: str({ 'expect.minLength': 3 }).$type,
    qty: num({ 'expect.int': true, 'expect.min': 1 }).$type,
    price: num({ 'expect.min': 0 }).$type,
    note: str().optional().$type,
  })
  return obj({
    id: str({ 'meta.id': true }).$type,
    name: str({ 'meta.required': true, 'expect.maxLength': 100 }).$type,
    email: str({
      'expect.pattern': { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: 'bad email' },
    }).$type,
    phone: str().optional().$type,
    age: num({ 'expect.int': true, 'expect.min': 0, 'expect.max': 150 }).$type,
    score: num().$type,
    active: bool().$type,
    status: union(lit('draft').$type, lit('active').$type, lit('archived').$type).$type,
    createdAt: num().$type,
    updatedAt: num().optional().$type,
    address: address.$type,
    billing: address.$type,
    tags: arr(str({ 'expect.maxLength': 30 }).$type).$type,
    items: arr(lineItem.$type).$type,
    notes: str({ 'expect.maxLength': 2000 }).optional().$type,
    discount: num({ 'expect.min': 0, 'expect.max': 100 }).optional().$type,
    currency: str({ 'expect.minLength': 3, 'expect.maxLength': 3 }).$type,
    internal: bool().optional().$type,
  }).$type
}

const addr = () => ({ street: '1 Main St', city: 'Springfield', zip: '12345', country: 'US' })
const validOrder = (): any => ({
  id: 'ord_1',
  name: 'Big order',
  email: 'john@example.com',
  phone: '+1 555',
  age: 42,
  score: 3.5,
  active: true,
  status: 'archived',
  createdAt: 1_760_000_000_000,
  address: addr(),
  billing: { ...addr(), line2: 'Suite 5' },
  tags: ['a', 'b'],
  items: [
    { sku: 'SKU-1', qty: 2, price: 9.99 },
    { sku: 'SKU-2', qty: 1, price: 19.5, note: 'gift' },
  ],
  currency: 'USD',
})

function makeUnions() {
  const card = obj({
    kind: lit('card').$type,
    number: str({ 'expect.pattern': { pattern: '^\\d{16}$' } }).$type,
  }).$type
  const bank = obj({
    kind: lit('bank').$type,
    iban: str({ 'expect.minLength': { length: 10, message: 'iban too short' } }).$type,
  }).$type
  const cash = obj({ kind: lit('cash').$type }).$type
  const tuple = $('tuple')
    .item(str().$type)
    .item(num({ 'expect.int': true }).$type).$type
  const inter = $('intersection')
    .item(obj({ a: num().$type }).$type)
    .item(obj({ a: num({ 'expect.min': 5 }).$type }).$type).$type
  return obj({
    pay: union(card, bank, cash).$type,
    nullable: union(str({ 'expect.minLength': 2 }).$type, prim('null').$type).$type,
    maybeNum: union(str().$type, num({ 'expect.max': 10 }).$type).$type,
    nested: union(
      union(lit(1).$type, lit(2).$type).$type,
      union(lit('x').$type, bool().$type).$type
    ).$type,
    optEnum: union(lit('a').$type, lit('b').$type).optional().$type,
    pairs: arr(tuple).$type,
    inter,
    objOrList: union(
      arr(num().$type, { 'expect.minLength': 2 }).$type,
      obj({ q: str().$type }).$type
    ).$type,
  }).$type
}
const validUnions = (): any => ({
  pay: { kind: 'bank', iban: 'DE0012345678' },
  nullable: null,
  maybeNum: 7,
  nested: 'x',
  pairs: [
    ['a', 1],
    ['b', 2],
  ],
  inter: { a: 6 },
  objOrList: { q: 'z' },
})

function makeMisc() {
  const phantom = prim('phantom').$type
  return obj({
    dec: prim('decimal').$type,
    anything: prim('any').$type,
    nothing: prim('undefined').optional().$type,
    nul: prim('null').$type,
    nev: prim('never').optional().$type,
    agree: bool({ 'meta.required': { message: 'must agree' } }).$type,
    minObj: num({ 'expect.min': { minValue: 3, message: 'too small' } }).$type,
    maxObj: num({ 'expect.max': { maxValue: 9 } }).$type,
    lenObj: str({ 'expect.minLength': { length: 2 }, 'expect.maxLength': { length: 4 } }).$type,
    filled: str({ 'meta.required': { message: 'fill me' } }).$type,
    twoPatterns: (() => {
      const h = str()
      h.annotate('expect.pattern', { pattern: '^a' }, true)
      h.annotate('expect.pattern', { pattern: 'z$', message: 'no z' }, true)
      return h.$type
    })(),
    // (stateful `g` patterns are covered separately: fast & reference validators would
    // share one cached RegExp and its lastIndex here)
    list: arr(num().$type, { 'expect.minLength': 1, 'expect.maxLength': 3 }).$type,
    grid: arr(arr(num({ 'expect.int': true }).$type).$type).$type,
    hidden: phantom,
  }).$type
}
const validMisc = (): any => ({
  dec: '-12.5',
  anything: { whatever: [1] },
  nul: null,
  agree: true,
  minObj: 3,
  maxObj: 9,
  lenObj: 'abc',
  filled: 'x',
  twoPatterns: 'abz',
  list: [1, 2],
  grid: [[1, 2], [3]],
})

function makeUnique() {
  const item = obj({ k: str().$type, v: num().$type })
  item.$def.props.get('k')!.metadata.set('expect.array.key' as any, true)
  return obj({
    byKey: arr(item.$type, { 'expect.array.uniqueItems': true }).$type,
    whole: arr(num().$type, { 'expect.array.uniqueItems': true }).$type,
  }).$type
}

function makeRecord() {
  return $('object')
    .prop('fixed', num().$type)
    .propPattern(/^x-/, str({ 'expect.maxLength': 3 }).$type)
    .propPattern(/^x-n/, num().$type).$type
}

function makeTree() {
  const tree = $('object')
  tree.prop('name', str({ 'expect.minLength': 1 }).$type)
  tree.prop('children', arr(tree.$type).optional().$type)
  return tree.$type
}

// ── random value generation ─────────────────────────────────────────────────

function rng(seed: number) {
  // mulberry32 — the int32 / uint32 coercions are intentional
  // oxlint-disable unicorn/prefer-math-trunc
  return () => {
    seed = (seed + 0x6d_2b_79_f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  // oxlint-enable unicorn/prefer-math-trunc
}

const POOL: unknown[] = [
  '',
  '   ',
  'a',
  'ab',
  'abc',
  'abz',
  'x'.repeat(31),
  '12345',
  '1234',
  '1234567890123456',
  'john@example.com',
  'nope',
  'draft',
  'archived',
  'card',
  'bank',
  'cash',
  'x',
  'US',
  'USD',
  '2024-01-15',
  '2024-01-15T10:00:00Z',
  '01/15/2024',
  '-1.5',
  '1e3',
  0,
  -1,
  1,
  1.5,
  2,
  3,
  5,
  6,
  9,
  10,
  11,
  42,
  150,
  151,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  true,
  false,
  null,
  undefined,
  [],
  {},
  ['a'],
  [1, 2],
  [1, 2, 3, 4],
  ['a', 1, 2],
  { a: 1 },
  { kind: 'cash' },
  { kind: 'card', number: '1234567890123456' },
]

const fromPool = (r: () => number) => structuredClone(POOL[Math.floor(r() * POOL.length)])

function genFromType(def: TAtscriptAnnotatedType, r: () => number, depth = 0): unknown {
  if (r() < 0.08) {
    return fromPool(r)
  }
  if (def.optional && r() < 0.15) {
    return r() < 0.5 ? undefined : null
  }
  const t = def.type as any
  switch (t.kind) {
    case '': {
      if (t.value !== undefined) {
        return t.value
      }
      return fromPool(r)
    }
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, p] of t.props as Map<string, TAtscriptAnnotatedType>) {
        if (depth > 3 && p.optional) {
          continue
        }
        const v = genFromType(p, r, depth + 1)
        if (v !== undefined || r() < 0.3) {
          out[k] = v
        }
      }
      if (r() < 0.1) {
        out[r() < 0.5 ? 'extra' : 'x-n1'] = r() < 0.5 ? 1 : 'v'
      }
      return out
    }
    case 'array': {
      const n = depth > 3 ? 0 : Math.floor(r() * 4)
      return Array.from({ length: n }, () => genFromType(t.of, r, depth + 1))
    }
    case 'tuple': {
      return t.items.map((i: TAtscriptAnnotatedType) => genFromType(i, r, depth + 1))
    }
    case 'union': {
      return genFromType(t.items[Math.floor(r() * t.items.length)], r, depth)
    }
    case 'intersection': {
      return genFromType(t.items[0], r, depth)
    }
  }
  return undefined
}

/** Replaces / deletes / adds a random node in a (valid) value. */
function mutate(value: any, r: () => number): any {
  if (typeof value !== 'object' || value === null || r() < 0.2) {
    return fromPool(r)
  }
  const keys = Object.keys(value)
  if (keys.length === 0 || r() < 0.08) {
    value[r() < 0.5 ? 'extra' : 'x-n1'] = 1
    return value
  }
  const k = keys[Math.floor(r() * keys.length)]
  if (r() < 0.15 && !Array.isArray(value)) {
    delete value[k]
  } else {
    value[k] = mutate(value[k], r)
  }
  return value
}

const OPTION_SETS: Array<Partial<TValidatorOptions>> = [
  {},
  { unknownProps: 'ignore' },
  { unknownProps: 'strip' },
  { partial: true },
  { partial: 'deep' },
  { partial: true, unknownProps: 'strip' },
  { errorLimit: 1 },
  { errorLimit: 3, unknownProps: 'strip' },
]

function run(v: Validator, x: unknown) {
  try {
    return v.validate(x, true)
  } catch (error) {
    return `threw: ${(error as Error).message}`
  }
}

function compare(def: TAtscriptAnnotatedType, opts: Partial<TValidatorOptions>, value: unknown) {
  const fast = new Validator(def, opts)
  const walk = new WalkValidator(def, opts)
  const a = structuredClone(value)
  const b = structuredClone(value)
  const r1 = run(fast, a)
  const r2 = run(walk, b)
  expect(r1).toBe(r2)
  expect(fast.errors).toEqual(walk.errors)
  // strip mutates the input; the mutation must match too
  expect(a).toEqual(b)
  return r1
}

/** Every path (object key / array index) inside a value, depth-first. */
function paths(value: unknown, prefix: Array<string | number> = []): Array<Array<string | number>> {
  if (typeof value !== 'object' || value === null) {
    return []
  }
  const out: Array<Array<string | number>> = []
  for (const k of Object.keys(value)) {
    const p = [...prefix, Array.isArray(value) ? Number(k) : k]
    out.push(p, ...paths((value as any)[k], p))
  }
  return out
}

/** Systematic single-edit variants of a valid value: each path × each pool value, deletes, extras. */
function singleEdits(valid: () => any): unknown[] {
  const out: unknown[] = [valid()]
  const all = paths(valid())
  for (const p of all) {
    const set = (x: unknown, del = false) => {
      const v = valid()
      let node = v
      for (let i = 0; i < p.length - 1; i++) {
        node = node[p[i]]
      }
      if (del) {
        delete node[p.at(-1)!]
      } else {
        node[p.at(-1)!] = x
      }
      out.push(v)
    }
    for (const x of POOL) {
      set(structuredClone(x))
    }
    set(undefined, true)
  }
  for (const p of [[], ...all]) {
    const v = valid()
    let node = v
    for (const k of p) {
      node = node[k]
    }
    if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      node.extra = 1
      out.push(v)
    }
  }
  return out
}

function fuzz(def: TAtscriptAnnotatedType, valid: () => any, seed: number, n = 400) {
  for (const value of singleEdits(valid)) {
    for (const opts of OPTION_SETS) {
      compare(def, opts, value)
    }
  }
  const r = rng(seed)
  let passed = 0
  let failed = 0
  for (let i = 0; i < n; i++) {
    let value: unknown
    const pick = r()
    if (pick < 0.15) {
      value = valid()
    } else if (pick < 0.6) {
      value = valid()
      const m = 1 + Math.floor(r() * 3)
      for (let j = 0; j < m; j++) {
        value = mutate(value, r)
      }
    } else {
      value = genFromType(def, r)
    }
    for (const opts of OPTION_SETS) {
      if (compare(def, opts, value) === true) {
        passed++
      } else {
        failed++
      }
    }
  }
  // make sure both outcomes are exercised
  expect(passed).toBeGreaterThan(n / 10)
  expect(failed).toBeGreaterThan(n / 10)
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('Validator fast path — equivalence with the full walk', () => {
  it('order: hand-written mutations', () => {
    const Order = makeOrder()
    const mutations: Array<(v: any) => void> = [
      () => {},
      v => (v.name = ''),
      v => (v.name = 'x'.repeat(101)),
      v => (v.age = -1),
      v => (v.age = 151),
      v => (v.age = Number.NaN),
      v => (v.age = 1.5),
      v => (v.status = 'nope'),
      v => v.items.push({ sku: 'ab', qty: 1, price: 1 }),
      v => (v.address.zip = '1234'),
      v => delete v.address,
      v => (v.phone = null),
      v => (v.extra = 1),
      v => (v.tags = 'x'),
      v => (v.items[0] = null),
      v => (v.address.city = '   '),
      v => (v.currency = 'US'),
      v => (v.discount = 101),
      v => (v.internal = 'yes'),
      v => (v.email = 'nope'),
      v => (v.billing.extra = true),
      v => (v.items[1].qty = 0),
      v => {
        v.email = 'x'
        v.age = 1.5
        v.items[1].qty = 0
        v.extra = 1
      },
    ]
    for (const m of mutations) {
      const value = validOrder()
      m(value)
      for (const opts of OPTION_SETS) {
        compare(Order, opts, value)
      }
    }
  })

  it('order: randomized', () => fuzz(makeOrder(), validOrder, 1))
  it('unions, tuples, intersections, nullable: randomized', () =>
    fuzz(makeUnions(), validUnions, 2))
  it('misc primitives, patterns, arrays, phantom: randomized', () => fuzz(makeMisc(), validMisc, 3))
  it('props patterns: randomized', () =>
    fuzz(makeRecord(), () => ({ 'fixed': 1, 'x-a': 'ab', 'x-n': 2 }), 4))
  it('recursive type: randomized', () =>
    fuzz(
      makeTree(),
      () => ({ name: 'r', children: [{ name: 'a', children: [] }, { name: 'b' }] }),
      5
    ))

  it('top-level union of objects honours partial at depth 0', () => {
    const t = union(
      obj({ a: num().$type, b: str().$type }).$type,
      obj({ c: bool().$type }).$type
    ).$type
    for (const value of [{ a: 1 }, { b: 'x' }, {}, { c: true }, { a: 'x' }, { d: 1 }]) {
      for (const opts of OPTION_SETS) {
        compare(t, opts, value)
      }
    }
  })

  it('partial applies to depth 0 only — not to root array / tuple items', () => {
    const item = obj({ a: num().$type, b: str().$type }).$type
    const roots = [arr(item).$type, $('tuple').item(item).$type, $('intersection').item(item).$type]
    for (const t of roots) {
      for (const value of [[{ a: 1 }], [{ a: 1, b: 'x' }], { a: 1 }, [{}]]) {
        for (const opts of OPTION_SETS) {
          compare(t, opts, value)
        }
      }
    }
  })

  it('strip inside unions mutates exactly like the walk', () => {
    const t = obj({
      u: union(
        obj({ a: num().$type, n: obj({ x: num().$type }).$type }).$type,
        obj({ b: num().$type }).$type
      ).$type,
    }).$type
    const values = [
      { u: { a: 1, n: { x: 1, junk: 1 } } },
      { u: { b: 1, n: { x: 1, junk: 1 } } },
      { u: { a: 'no', n: { x: 1, junk: 1 }, b: 2 } },
      { u: { b: 2, junk: 1 } },
      { u: { a: 1, n: { x: 1 } }, junk: 1 },
    ]
    for (const value of values) {
      compare(t, { unknownProps: 'strip' }, value)
      compare(t, { unknownProps: 'strip', errorLimit: 1 }, value)
    }
  })

  it('throwing mode raises the same ValidatorError', () => {
    const Order = makeOrder()
    const value = validOrder()
    value.age = 1.5
    value.extra = 1
    const err1 = (() => {
      try {
        new Validator(Order).validate(value)
      } catch (error) {
        return error as Error & { errors: unknown }
      }
    })()
    const err2 = (() => {
      try {
        new WalkValidator(Order).validate(value)
      } catch (error) {
        return error as Error & { errors: unknown }
      }
    })()
    expect(err1?.message).toBe(err2?.message)
    expect(err1?.errors).toEqual(err2?.errors)
  })

  it('unknown kinds / design types still throw like the walk, even behind a union', () => {
    const bad = { __is_atscript_annotated_type: true, type: { kind: 'weird' }, metadata: new Map() }
    const badDt = $().designType('nonsense' as any).$type
    const cases: Array<[TAtscriptAnnotatedType, unknown]> = [
      [union(bad as any, str().$type).$type, 'x'],
      [union(badDt, str().$type).$type, 'x'],
      [obj({ a: badDt }).$type, { a: 'x' }],
      [union(obj({ n: num().$type, a: badDt }).$type, str().$type).$type, { n: 'x', a: 1 }],
    ]
    for (const [t, value] of cases) {
      expect(() => new WalkValidator(t).validate(value, true)).toThrow()
      expect(() => new Validator(t).validate(value, true)).toThrow()
    }
  })

  it('invalid regex in a rejected union branch still throws like the walk', () => {
    const t = union(
      obj({ a: num().$type, b: str({ 'expect.pattern': { pattern: '(' } }).$type }).$type,
      obj({ a: str().$type, b: str().$type }).$type
    ).$type
    // branch 1 fails on `a` (branch 2 would pass), the walk then reaches `b`, the walk then reaches `b` and compiles the bad regex
    expect(() => new WalkValidator(t).validate({ a: 'x', b: 'y' }, true)).toThrow()
    expect(() => new Validator(t).validate({ a: 'x', b: 'y' }, true)).toThrow()
  })

  it('invalid regex in a later item of a rejected array branch still throws like the walk', () => {
    const t = union(
      arr(obj({ a: num().$type, b: str({ 'expect.pattern': { pattern: '[' } }).$type }).$type)
        .$type,
      arr(prim('any').$type).$type
    ).$type
    const value = [1, { a: 1, b: 'y' }]
    expect(() => new WalkValidator(t).validate(value, true)).toThrow()
    expect(() => new Validator(t).validate(value, true)).toThrow()
  })

  it('uniqueItems', () => {
    const t = makeUnique()
    const values = [
      {
        byKey: [
          { k: 'a', v: 1 },
          { k: 'b', v: 1 },
        ],
        whole: [1, 2],
      },
      {
        byKey: [
          { k: 'a', v: 1 },
          { k: 'a', v: 2 },
        ],
        whole: [1, 2],
      },
      { byKey: [], whole: [1, 1] },
    ]
    const results = values.map(value => {
      for (const opts of OPTION_SETS) {
        compare(t, opts, value)
      }
      return new Validator(t).validate(value, true)
    })
    expect(results).toEqual([true, false, false])
  })

  it('never', () => {
    const t = makeMisc()
    for (const opts of OPTION_SETS) {
      compare(t, opts, { ...validMisc(), nev: 1 })
    }
    expect(new Validator(t).validate(validMisc(), true)).toBe(true)
    expect(new Validator(t).validate({ ...validMisc(), nev: 1 }, true)).toBe(false)
  })

  it('stateful (g) patterns keep the walk semantics', () => {
    // distinct pattern strings → distinct cached RegExp objects (lastIndex is shared per regex)
    const fast = new Validator(str({ 'expect.pattern': { pattern: 'ab', flags: 'g' } }).$type)
    const walk = new WalkValidator(
      str({ 'expect.pattern': { pattern: 'a(?:b)', flags: 'g' } }).$type
    )
    const r1 = [fast.validate('ab', true), fast.validate('ab', true), fast.validate('ab', true)]
    const r2 = [walk.validate('ab', true), walk.validate('ab', true), walk.validate('ab', true)]
    expect(r1).toEqual([true, false, true])
    expect(r1).toEqual(r2)
  })

  it('uses the pre-check for valid values and the walk for invalid ones', () => {
    const Order = makeOrder()
    const v = new Validator(Order)
    const spy = vi.spyOn(v as any, 'validateSafe')
    expect(v.validate(validOrder())).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    const bad = validOrder()
    bad.age = 200
    expect(v.validate(bad, true)).toBe(false)
    expect(spy).toHaveBeenCalled()
    expect(v.errors).toEqual([{ path: 'age', message: 'Expected maximum 150, got 200' }])
  })

  it('resets errors on a fast pass after a failed call', () => {
    const v = new Validator(makeOrder())
    const bad = validOrder()
    bad.name = ''
    expect(v.validate(bad, true)).toBe(false)
    const prevErrors = v.errors
    expect(prevErrors).toHaveLength(1)
    expect(v.validate(validOrder(), true)).toBe(true)
    expect(v.errors).toEqual([])
    expect(v.errors).not.toBe(prevErrors)
    expect(prevErrors).toHaveLength(1)
  })

  it('skips the pre-check with plugins, replace, skipList or a partial callback', () => {
    const t = obj({ a: num().$type }).$type
    const plugin = vi.fn(() => undefined)
    const replace = vi.fn((d: TAtscriptAnnotatedType) => d)
    const partial = vi.fn(() => false)
    new Validator(t, { plugins: [plugin] }).validate({ a: 1 })
    new Validator(t, { replace }).validate({ a: 1 })
    new Validator(t, { partial }).validate({ a: 1 })
    expect(plugin).toHaveBeenCalled()
    expect(replace).toHaveBeenCalled()
    expect(partial).toHaveBeenCalled()
    expect(new Validator(t, { skipList: new Set(['a']) }).validate({ a: 'x' }, true)).toBe(true)
  })

  it('subclasses overriding hooks are honoured', () => {
    class Strict extends Validator {
      protected validateNumber() {
        this.error('nope')
        return false
      }
    }
    const t = obj({ a: num().$type, s: union(lit(1).$type, lit(2).$type).$type }).$type
    expect(new Strict(t).validate({ a: 1, s: 2 }, true)).toBe(false)
  })
})

describe('Validator fast path — generated types', () => {
  let DateBox: any
  let SearchQuery: any
  let Level: any
  let MaybeNumber: any
  const rootDir = path.join(__dirname, 'fixtures')

  beforeAll(async () => {
    await prepareFixtures({ rootDir, entries: ['coerce.as', 'date-primitives.as'] })
    ;({ SearchQuery, Level, MaybeNumber } = await import(path.join(rootDir, 'coerce.as.js')))
    ;({ DateBox } = await import(path.join(rootDir, 'date-primitives.as.js')))
  })

  it('dates (pattern alternations)', () => {
    fuzz(DateBox, () => ({ d: '15 January 2024', iso: '2024-01-15T10:00:00.5-05:30' }), 6, 200)
  })
  it('query DTO with decimal, optional nested and arrays', () => {
    fuzz(
      SearchQuery,
      () => ({ offset: 0, limit: 100, active: false, term: 't', price: '1.50', ids: [1, 2] }),
      7,
      200
    )
  })
  it('literal and primitive unions', () => {
    for (const value of [1, 2, 3, 'max', 'min', '1', null, undefined, true, 2.5]) {
      for (const opts of OPTION_SETS) {
        compare(Level, opts, value)
        compare(MaybeNumber, opts, value)
      }
    }
  })
})

describe('Validator fast path — metadata / structure mutated after first validate', () => {
  type TObj = TAtscriptAnnotatedType<TAtscriptTypeObject>
  const prop = (t: TAtscriptAnnotatedType, k: string) => (t as TObj).type.props.get(k)!

  function check(mutateType: (t: TObj) => void, value: any, expectAfter: boolean) {
    const t = makeOrder() as TObj
    const fast = new Validator(t)
    const before = fast.validate(structuredClone(value), true)
    mutateType(t)
    const r = fast.validate(structuredClone(value), true)
    const walk = new WalkValidator(t)
    expect(walk.validate(structuredClone(value), true)).toBe(expectAfter)
    expect(r).toBe(expectAfter)
    expect(fast.errors).toEqual(walk.errors)
    return before
  }

  it('annotate() adds a constraint', () => {
    expect(
      check(t => annotate(prop(t, 'name').metadata, 'expect.maxLength', 3), validOrder(), false)
    ).toBe(true)
  })
  it('metadata.set() adds meta.required', () => {
    const v = validOrder()
    v.id = '  '
    check(t => prop(t, 'id').metadata.set('meta.required', true), v, false)
  })
  it('metadata.delete() removes a constraint', () => {
    const v = validOrder()
    v.age = 200
    expect(check(t => prop(t, 'age').metadata.delete('expect.max'), v, true)).toBe(false)
  })
  it('annotate(asArray) pushes into an existing pattern array in place', () => {
    check(
      t =>
        annotate(
          prop(t, 'email').metadata,
          'expect.pattern',
          { pattern: '^x', message: 'must start with x' } as any,
          true
        ),
      validOrder(),
      false
    )
  })
  it('constraint object mutated in place', () => {
    const t = obj({ n: num({ 'expect.min': { minValue: 1 } }).$type }).$type
    const v = new Validator(t)
    expect(v.validate({ n: 5 }, true)).toBe(true)
    ;(prop(t, 'n').metadata.get('expect.min') as any).minValue = 10
    expect(v.validate({ n: 5 }, true)).toBe(false)
  })
  it('props.set() adds a required prop', () => {
    check(t => t.type.props.set('added', str().$type), validOrder(), false)
  })
  it('props.delete() makes a key unknown', () => {
    check(t => t.type.props.delete('phone'), validOrder(), false)
  })
  it('optional flag toggled', () => {
    check(t => (prop(t, 'phone').optional = false), { ...validOrder(), phone: undefined }, false)
  })
  it('union items.push() widens an enum', () => {
    const v = validOrder()
    v.status = 'paused'
    expect(
      check(t => (prop(t, 'status').type as any).items.push(lit('paused').$type), v, true)
    ).toBe(false)
  })
  it('array `of` replaced', () => {
    check(t => ((prop(t, 'tags').type as any).of = num().$type), validOrder(), false)
  })
  it('prop turned phantom', () => {
    check(t => ((prop(t, 'id').type as any).designType = 'phantom'), validOrder(), false)
  })
  it('cloneRefProp() then annotate the clone', () => {
    check(
      t => {
        cloneRefProp(t.type, 'billing')
        annotate(
          (prop(t, 'billing').type as TAtscriptTypeObject).props.get('city')!.metadata,
          'expect.minLength',
          50
        )
      },
      validOrder(),
      false
    )
  })
  it('propPattern added later', () => {
    const v = validOrder()
    v['x-a'] = 'too long'
    check(t => t.type.propsPatterns.push({ pattern: /^x-/, def: str().$type }), v, true)
  })
  it('lazy ref resolved after the validator was created', () => {
    const box: { target?: TAtscriptAnnotatedType } = {}
    const holder = $('object')
    const ref = $().refTo(() => box.target as any)
    holder.prop('r', ref.$type)
    const v = new Validator(holder.$type)
    box.target = obj({ x: num({ 'expect.min': 2 }).$type }).$type
    expect(v.validate({ r: { x: 3 } }, true)).toBe(true)
    expect(v.validate({ r: { x: 1 } }, true)).toBe(false)
    expect(v.errors).toEqual([{ path: 'r.x', message: 'Expected minimum 2, got 1' }])
  })
})

describe('Validator literal-union shortcut', () => {
  const values = ['draft', 'pending', 'review', 'approved', 'archived']
  const t = obj({ s: union(...values.map(v => lit(v).$type)).$type }).$type

  it('matches every literal and reports misses exactly as before', () => {
    for (const s of [...values, 'zzz', 1, null, undefined, true]) {
      for (const opts of OPTION_SETS) {
        compare(t, opts, { s })
      }
    }
  })

  it('skips the shortcut for optional / phantom items and with plugins', () => {
    const t2 = union(lit('a').$type, lit('b').optional().$type).$type
    for (const value of ['a', 'b', 'c', null, undefined]) {
      compare(t2, {}, value)
    }
    const plugin = vi.fn(() => undefined)
    new Validator(t, { plugins: [plugin] }).validate({ s: 'archived' })
    // plugin sees every branch tried before the match
    expect(plugin.mock.calls.length).toBeGreaterThan(values.length)
  })

  it('walk path (fast pre-check failed elsewhere) still accepts the enum value', () => {
    const t3 = obj({ s: union(...values.map(v => lit(v).$type)).$type, n: num().$type }).$type
    const v = new Validator(t3)
    const spy = vi.spyOn(v as any, 'validatePrimitive')
    expect(v.validate({ s: 'archived', n: 'x' }, true)).toBe(false)
    expect(v.errors).toEqual([{ path: 'n', message: 'Expected number, got string' }])
    // one call for `n` only — the union matched without trying the literal branches
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
