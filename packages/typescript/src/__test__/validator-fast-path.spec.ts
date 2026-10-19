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
/** Constraints annotated on the union itself (`@expect.min 0` on `number | null`). */
function makeUnionConstraints() {
  const nul = () => prim('null').$type
  const item = obj({
    label: union(str().$type, nul())
      .annotate('expect.maxLength', { length: 3 })
      .annotate('meta.required', true).$type,
  }).$type
  return obj({
    score: union(num().$type, nul())
      .annotate('expect.min', { minValue: 0 })
      .annotate('expect.max', { maxValue: 10 })
      .annotate('expect.int', true).$type,
    code: union(str().$type, nul())
      .annotate('expect.minLength', { length: 2 })
      .annotate('expect.pattern', { pattern: '^[a-z]+$' }, true).$type,
    tags: union(arr(str().$type).$type, nul())
      .annotate('expect.maxLength', { length: 2 })
      .annotate('expect.array.uniqueItems', {}).$type,
    level: union(lit(1).$type, lit(5).$type, lit(9).$type).annotate('expect.max', { maxValue: 5 })
      .$type,
    agree: union(bool().$type, nul()).annotate('meta.required', true).$type,
    opt: union(num().$type, nul()).annotate('expect.max', { maxValue: 3 }).optional().$type,
    ratio: union(num().$type, nul())
      .annotate('expect.exclusiveMin', { exclusiveMinValue: 0 })
      .annotate('expect.exclusiveMax', { exclusiveMaxValue: 1 }).$type,
    reqOpt: str({ 'meta.required': true }).optional().$type,
    reqOptNullable: union(str().$type, nul()).annotate('meta.required', true).optional().$type,
    reqBool: bool({ 'meta.required': { message: 'tick it' } }).optional().$type,
    items: arr(item).$type,
  }).$type
}
const validUnionConstraints = (): any => ({
  score: 3,
  code: 'ab',
  tags: ['a'],
  level: 5,
  agree: true,
  opt: 2,
  ratio: 0.5,
  reqOpt: 'x',
  reqOptNullable: null,
  reqBool: true,
  items: [{ label: 'abc' }, { label: null }],
})
/** Union-level constraints in nested unions, intersections, tuples, arrays and mixed unions. */
function makeUnionConstraintsNested() {
  const nul = () => prim('null').$type
  const keyed = obj({
    id: str({ 'expect.array.key': true }).$type,
    v: num().$type,
  }).$type
  return obj({
    // metadata at both union levels
    nested: union(
      union(num().$type, str().$type).annotate('expect.max', { maxValue: 10 }).$type,
      nul()
    )
      .annotate('expect.min', { minValue: 1 })
      .annotate('expect.minLength', { length: 2 }).$type,
    anyOrNull: union(prim('any').$type, nul()).annotate('expect.minLength', { length: 2 }).$type,
    litOrNum: union(lit(100).$type, num().$type, nul()).annotate('expect.max', { maxValue: 5 })
      .$type,
    both: $('intersection')
      .item(union(num().$type, nul()).annotate('expect.min', { minValue: 0 }).$type)
      .item(union(num().$type, nul()).annotate('expect.max', { maxValue: 5 }).$type).$type,
    pair: $('tuple')
      .item(union(num().$type, nul()).annotate('expect.int', true).$type)
      .item(union(str().$type, nul()).annotate('expect.maxLength', { length: 2 }).$type).$type,
    list: arr(union(str().$type, nul()).annotate('expect.minLength', { length: 1 }).$type, {
      'expect.maxLength': { length: 3 },
    }).$type,
    keyedList: union(arr(keyed).$type, nul()).annotate('expect.array.uniqueItems', {}).$type,
    keyedNested: union(union(arr(keyed).$type, nul()).$type, prim('undefined').$type).annotate(
      'expect.array.uniqueItems',
      {}
    ).$type,
    mixed: union(num().$type, str().$type, bool().$type)
      .annotate('meta.required', true)
      .annotate('expect.min', { minValue: 1 }).$type,
    reqUndef: union(bool().$type, prim('undefined').$type)
      .annotate('meta.required', true)
      .optional().$type,
  }).$type
}
const validUnionConstraintsNested = (): any => ({
  nested: 5,
  anyOrNull: 'ab',
  litOrNum: 100,
  both: 3,
  pair: [1, 'ab'],
  list: ['a', null],
  keyedList: [
    { id: 'a', v: 1 },
    { id: 'b', v: 1 },
  ],
  keyedNested: [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ],
  mixed: 'x',
  reqUndef: true,
})
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
    exMinObj: num({ 'expect.exclusiveMin': { exclusiveMinValue: 0, message: 'positive' } }).$type,
    exMaxObj: num({ 'expect.exclusiveMax': { exclusiveMaxValue: 1 } }).$type,
    exBoth: num({ 'expect.exclusiveMin': 0, 'expect.exclusiveMax': 10, 'expect.int': true }).$type,
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
  exMinObj: 0.5,
  exMaxObj: 0.5,
  exBoth: 5,
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

/**
 * Validates clones of `value` with the fast and the reference validator and expects identical
 * results, errors and mutations. `onFast` sees the fast validator and its input before it runs.
 */
function compare(
  def: TAtscriptAnnotatedType,
  opts: Partial<TValidatorOptions>,
  value: unknown,
  onFast?: (fast: Validator, input: unknown) => void
) {
  const fast = new Validator(def, opts)
  const walk = new WalkValidator(def, opts)
  const a = structuredClone(value)
  const b = structuredClone(value)
  onFast?.(fast, a)
  const r1 = run(fast, a)
  const r2 = run(walk, b)
  expect(r1).toBe(r2)
  expect(fast.errors).toEqual(walk.errors)
  // strip mutates the input; the mutation must match too
  expect(a).toEqual(b)
  return r1
}

/** The node at `path` inside `value`. */
function at(value: any, path: Array<string | number>): any {
  let node = value
  for (const k of path) {
    node = node[k]
  }
  return node
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
      const node = at(v, p.slice(0, -1))
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
    const node = at(v, p)
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

// The randomized suites are seeded (deterministic) and bounded; each runs ~0.5–2.5 s, so the
// default 5 s timeout is too tight on a loaded machine.
describe('Validator fast path — equivalence with the full walk', { timeout: 30_000 }, () => {
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
  it('union-level constraints and optional @meta.required: randomized', () =>
    fuzz(makeUnionConstraints(), validUnionConstraints, 8))
  it('union-level constraints in nested / intersected / tupled / mixed unions: randomized', () =>
    fuzz(makeUnionConstraintsNested(), validUnionConstraintsNested, 9))
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

  it('literal mismatch reports null-prototype objects instead of throwing', () => {
    const validator = new Validator(union(lit('a').$type, lit('b').$type).$type)
    expect(validator.validate(Object.create(null), true)).toBe(false)
    expect(validator.errors[0].message).toContain('allowed types')
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
  it('exclusive bounds at the boundary match the walk (scalar, array item, union-level)', () => {
    const bounded = () =>
      num({ 'expect.exclusiveMin': { exclusiveMinValue: 0 }, 'expect.exclusiveMax': 5 })
    const defs = [
      bounded().$type,
      arr(bounded().$type).$type,
      obj({ a: bounded().$type }).$type,
      union(num({ 'expect.min': { minValue: 5 } }).$type, prim('null').$type).annotate(
        'expect.exclusiveMin',
        { exclusiveMinValue: 5 }
      ).$type,
    ]
    const values = [-1, -0, 0, 0.5, 4.9, 5, 5.1, Number.NaN, Number.POSITIVE_INFINITY, null]
    for (const def of defs) {
      for (const v of values) {
        for (const value of [v, [v], { a: v }]) {
          expect([value, new Validator(def).validate(value, true)]).toEqual([
            value,
            new WalkValidator(def).validate(value, true),
          ])
        }
      }
    }
    expect(new Validator(defs[0]).validate(-0, true)).toBe(false)
    expect(new Validator(defs[3]).validate(5, true)).toBe(false)
  })

  it('exclusive bound objects mutated in place', () => {
    const t = obj({
      n: num({
        'expect.exclusiveMin': { exclusiveMinValue: 1 },
        'expect.exclusiveMax': { exclusiveMaxValue: 10 },
      }).$type,
    }).$type
    const v = new Validator(t)
    expect(v.validate({ n: 5 }, true)).toBe(true)
    ;(prop(t, 'n').metadata.get('expect.exclusiveMax') as any).exclusiveMaxValue = 5
    expect(v.validate({ n: 5 }, true)).toBe(false)
    prop(t, 'n').metadata.set('expect.exclusiveMax', { exclusiveMaxValue: 6 })
    expect(v.validate({ n: 5 }, true)).toBe(true)
    prop(t, 'n').metadata.set('expect.exclusiveMin', { exclusiveMinValue: 5 })
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
  // Compiled plans are cached per type node (shared by all validators): every kind of
  // in-place change after a plan was built must still be picked up on the next call.
  it('existing annotation replaced (same metadata size)', () => {
    check(t => prop(t, 'name').metadata.set('expect.maxLength', 3), validOrder(), false)
  })
  it('existing annotation replaced on a number / array / boolean', () => {
    const v = validOrder()
    v.active = false
    check(t => prop(t, 'age').metadata.set('expect.min', { minValue: 50 }), validOrder(), false)
    check(t => prop(t, 'tags').metadata.set('expect.maxLength', 1), validOrder(), false)
    check(t => prop(t, 'active').metadata.set('meta.required', true), v, false)
  })
  it('@expect.array.uniqueItems added to an array', () => {
    const v = validOrder()
    v.tags = ['a', 'a']
    check(t => annotate(prop(t, 'tags').metadata, 'expect.array.uniqueItems', {} as any), v, false)
  })
  it('pattern entry mutated in place', () => {
    check(
      t => ((prop(t, 'email').metadata.get('expect.pattern') as any)[0].pattern = '^x'),
      validOrder(),
      false
    )
  })
  it('prop node replaced under the same key', () => {
    check(t => t.type.props.set('name', num().$type), validOrder(), false)
  })
  it('metadata map replaced', () => {
    check(
      t => (prop(t, 'name').metadata = new Map([['expect.maxLength', 3]]) as any),
      validOrder(),
      false
    )
  })
  it('type replaced / literal value changed', () => {
    const v = validOrder()
    check(t => ((prop(t, 'score') as any).type = str().$type.type), v, false)
    check(t => ((prop(t, 'status').type as any).items[2].type.value = 'gone'), v, false)
  })
  it('union item replaced in place (same length)', () => {
    const v = validOrder()
    check(t => ((prop(t, 'status').type as any).items[2] = lit('other').$type), v, false)
  })
  it('prop patterns added to a compiled object (plan falls back to the live check)', () => {
    const t = makeOrder() as TObj
    const v = new Validator(t, { unknownProps: 'ignore' })
    const value = { ...validOrder(), address: { ...addr(), 'x-a': 1 } }
    expect(v.validate(structuredClone(value), true)).toBe(true)
    ;(prop(t, 'address').type as any).propsPatterns.push({ pattern: /^x-/, def: str().$type })
    expect(v.validate(structuredClone(value), true)).toBe(false)
    const walk = new WalkValidator(t, { unknownProps: 'ignore' })
    expect(walk.validate(structuredClone(value), true)).toBe(false)
    expect(v.errors).toEqual(walk.errors)
  })
  // Array items go through compiled plans: the same kinds of change inside `items[]`.
  describe('inside array items (compiled plans)', () => {
    const item = (t: TObj) => (prop(t, 'items').type as any).of as TObj
    it('annotation added / replaced / removed', () => {
      check(
        t => annotate(prop(item(t), 'sku').metadata, 'expect.maxLength', 2),
        validOrder(),
        false
      )
      check(t => prop(item(t), 'sku').metadata.set('expect.minLength', 10), validOrder(), false)
      const v = validOrder()
      v.items[0].qty = 0
      check(t => prop(item(t), 'qty').metadata.delete('expect.min'), v, true)
    })
    it('constraint object mutated in place', () => {
      const t = arr(obj({ n: num({ 'expect.min': { minValue: 1 } }).$type }).$type).$type
      const v = new Validator(t)
      expect(v.validate([{ n: 5 }, { n: 6 }], true)).toBe(true)
      const n = ((t.type as any).of as TObj).type.props.get('n')!
      ;(n.metadata.get('expect.min') as any).minValue = 6
      expect(v.validate([{ n: 5 }, { n: 6 }], true)).toBe(false)
      expect(v.errors).toEqual([{ path: '0.n', message: 'Expected minimum 6, got 5' }])
    })
    it('prop added / replaced / removed / turned phantom / optional toggled', () => {
      check(t => item(t).type.props.set('extra', str().$type), validOrder(), false)
      check(t => item(t).type.props.set('sku', num().$type), validOrder(), false)
      check(t => item(t).type.props.delete('note'), validOrder(), false)
      check(t => ((prop(item(t), 'sku').type as any).designType = 'phantom'), validOrder(), false)
      check(
        t => (prop(item(t), 'note').optional = false),
        { ...validOrder(), items: [{ sku: 'SKU-1', qty: 2, price: 9.99 }] },
        false
      )
    })
    it('metadata map / type replaced, array `of` replaced', () => {
      check(
        t => (prop(item(t), 'sku').metadata = new Map([['expect.maxLength', 2]]) as any),
        validOrder(),
        false
      )
      check(t => ((prop(item(t), 'price') as any).type = str().$type.type), validOrder(), false)
      check(t => ((prop(t, 'tags').type as any).of = num().$type), validOrder(), false)
      check(
        t => (prop(t, 'tags').type as any).of.metadata.set('expect.maxLength', 0),
        validOrder(),
        false
      )
    })
  })
  it('a plan built by one validator is honoured by validators with other options', () => {
    const t = makeOrder()
    const value = { ...validOrder(), extra: 1, address: { ...addr(), extra: 2 } }
    for (const opts of OPTION_SETS) {
      compare(t, opts, value)
    }
    for (const opts of [...OPTION_SETS].reverse()) {
      compare(t, opts, value)
      compare(t, opts, validOrder())
    }
  })
  it('recursive types reuse their plan through the cycle', () => {
    const node = $('object')
    node.prop('name', str({ 'expect.minLength': 1 }).$type)
    node.prop('children', arr(node.$type).optional().$type)
    const tree = (depth: number): any => ({
      name: `n${depth}`,
      children: depth > 0 ? [tree(depth - 1), tree(depth - 1)] : undefined,
    })
    const v = new Validator(node.$type)
    expect(v.validate(tree(6), true)).toBe(true)
    const bad = tree(6)
    bad.children[1].children[0].children[1].name = ''
    compare(node.$type, {}, bad)
    annotate(
      (node.$type.type as TAtscriptTypeObject).props.get('name')!.metadata,
      'expect.minLength',
      3
    )
    expect(v.validate(tree(6), true)).toBe(false)
    compare(node.$type, {}, tree(6))
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

// The pre-check handles unknown keys itself: 'strip' records the walk's deletions and
// performs them on a pass, 'error' fails early outside unions.
describe('Validator fast path — unknown props (strip / error)', { timeout: 30_000 }, () => {
  const MODES: Array<Partial<TValidatorOptions>> = [
    { unknownProps: 'strip' },
    { unknownProps: 'error' },
    { unknownProps: 'ignore' },
    { unknownProps: 'strip', partial: 'deep' },
    { unknownProps: 'strip', errorLimit: 1 },
    { unknownProps: 'error', errorLimit: 2 },
  ]

  function makeModel() {
    const nul = prim('null').$type
    const geo = obj({ lat: num().$type, lng: num().$type }).$type
    const field = obj({ key: str({ 'expect.minLength': 1 }).$type, value: str().$type }).$type
    const address = obj({
      street: str({ 'expect.minLength': 1 }).$type,
      zip: str({ 'expect.pattern': { pattern: '^\\d{5}$' } }).$type,
      geo: $().refTo(geo).optional().$type,
      hidden: prim('phantom').$type,
    }).$type
    const item = obj({
      sku: str({ 'expect.minLength': 2 }).$type,
      qty: num({ 'expect.int': true, 'expect.min': 1 }).$type,
      meta: obj({ color: str().optional().$type, fields: arr(field).$type }).optional().$type,
    }).$type
    const card = obj({
      kind: lit('card').$type,
      number: str({ 'expect.pattern': { pattern: '^\\d{16}$' } }).$type,
      holder: obj({ name: str({ 'expect.minLength': 1 }).$type }).$type,
    }).$type
    const paypal = obj({
      kind: lit('paypal').$type,
      email: str().$type,
      extra: obj({ note: str().optional().$type }).optional().$type,
    }).$type
    return obj({
      id: str().$type,
      address,
      billing: $().refTo(address).optional().$type,
      items: arr(item).$type,
      pay: union(card, paypal).$type,
      payments: arr(union(card, paypal, nul).$type).$type,
      where: union(geo, nul).$type,
      both: $('intersection')
        .item(obj({ a: num().$type }).$type)
        .item(obj({ b: str().optional().$type }).$type).$type,
      pair: $('tuple').item(geo).item(field).$type,
      grid: arr(arr(field).$type).$type,
      tree: makeTree(),
    }).$type
  }
  const valid = (): any => ({
    id: 'x',
    address: { street: 'Main', zip: '12345', geo: { lat: 1, lng: 2 } },
    billing: { street: 'Oak', zip: '54321' },
    items: [
      { sku: 'ab', qty: 1, meta: { color: 'red', fields: [{ key: 'k', value: 'v' }] } },
      { sku: 'cd', qty: 2 },
    ],
    pay: { kind: 'card', number: '1234567890123456', holder: { name: 'J' } },
    payments: [{ kind: 'paypal', email: 'e', extra: { note: 'n' } }, null],
    where: { lat: 3, lng: 4 },
    both: { a: 1 },
    pair: [
      { lat: 5, lng: 6 },
      { key: 'p', value: 'q' },
    ],
    grid: [[{ key: 'g', value: 'h' }], []],
    tree: { name: 'r', children: [{ name: 'c' }] },
  })

  /** Every plain object inside `value` (depth-first, including `value`). */
  function objects(value: unknown, out: Array<Record<string, unknown>> = []) {
    if (typeof value === 'object' && value !== null) {
      if (!Array.isArray(value)) {
        out.push(value as Record<string, unknown>)
      }
      for (const v of Object.values(value)) {
        objects(v, out)
      }
    }
    return out
  }

  /** Adds unknown keys (incl. the phantom prop's name) to random objects at any depth. */
  function sprinkle(value: unknown, r: () => number) {
    for (const o of objects(value)) {
      if (r() < 0.35) {
        const key = r() < 0.15 ? 'hidden' : `x${Math.floor(r() * 3)}`
        o[key] = r() < 0.7 ? 1 : { nested: true }
      }
    }
    return value
  }

  /** Makes two places share one object (the walk then sees one visit's strips in the other). */
  function alias(value: any, r: () => number) {
    const all = paths(value).filter(p => {
      const node = at(value, p)
      return typeof node === 'object' && node !== null && !Array.isArray(node)
    })
    if (all.length < 2) {
      return value
    }
    const from = all[Math.floor(r() * all.length)]
    const to = all[Math.floor(r() * all.length)]
    const src = at(value, from)
    const dst = at(value, to.slice(0, -1))
    if (!objects(src).includes(dst)) {
      dst[to.at(-1)!] = src
    }
    return value
  }

  const stats = { fastStrips: 0, walks: 0 }

  /** {@link compare}, also counting passes the pre-check alone decided with strips. */
  function compareCounting(
    def: TAtscriptAnnotatedType,
    opts: Partial<TValidatorOptions>,
    value: unknown
  ) {
    let spy: { mock: { calls: unknown[] } } | undefined
    let input: unknown
    const result = compare(def, opts, value, (fast, a) => {
      spy = vi.spyOn(fast as any, 'validateSafe')
      input = a
    })
    if (spy!.mock.calls.length > 0) {
      stats.walks++
    } else if (opts.unknownProps === 'strip' && JSON.stringify(input) !== JSON.stringify(value)) {
      stats.fastStrips++
    }
    return result
  }

  it('randomized: unknown keys at every depth, mixed with failures and aliasing', () => {
    const Model = makeModel()
    const r = rng(11)
    let passed = 0
    let failed = 0
    for (let i = 0; i < 600; i++) {
      const pick = r()
      let value: any = pick < 0.25 ? genFromType(Model, r) : valid()
      sprinkle(value, r)
      if (pick >= 0.25 && pick < 0.55) {
        value = mutate(value, r)
      }
      if (r() < 0.15) {
        alias(value, r)
      }
      for (const opts of MODES) {
        if (compareCounting(Model, opts, value) === true) {
          passed++
        } else {
          failed++
        }
      }
    }
    expect(passed).toBeGreaterThan(300)
    expect(failed).toBeGreaterThan(300)
    // the pre-check really decides strip passes with (top-level) unknown keys (no walk)
    expect(stats.fastStrips).toBeGreaterThan(0)
  })

  it('systematic: one unknown key on each object of a valid value', () => {
    const Model = makeModel()
    const base = valid()
    const count = objects(base).length
    for (let n = 0; n < count; n++) {
      for (const extra of [1, { nested: 1 }]) {
        const value = valid()
        objects(value)[n].junk = extra
        for (const opts of MODES) {
          compare(Model, opts, value)
        }
        // plus a failure elsewhere: nothing may be stripped
        const bad = structuredClone(value)
        bad.id = 1
        for (const opts of MODES) {
          compare(Model, opts, bad)
        }
      }
    }
  })

  it('strip passes without the walk when only the top-level object has unknown keys', () => {
    const t = obj({
      id: str().$type,
      hidden: prim('phantom').$type,
      items: arr(obj({ x: num().$type }).$type).$type,
    }).$type
    const v = new Validator(t, { unknownProps: 'strip' })
    const spy = vi.spyOn(v as any, 'validateSafe')
    const value: any = { extra: 1, id: 'a', hidden: { x: 1 }, items: [{ x: 1 }], more: 2 }
    const reference = structuredClone(value)
    expect(v.validate(value)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    expect(new WalkValidator(t, { unknownProps: 'strip' }).validate(reference)).toBe(true)
    expect(value).toEqual(reference)
    expect(Object.keys(value)).toEqual(['id', 'items'])
  })

  it('nested unknown keys are stripped by the walk', () => {
    const v = new Validator(makeModel(), { unknownProps: 'strip' })
    const spy = vi.spyOn(v as any, 'validateSafe')
    const value = valid()
    value.extra = 1
    value.address.geo.alt = 3
    value.items[0].meta.fields[0].note = 'n'
    value.pay.holder.title = 'Dr'
    value.tree.children[0].y = 1
    const reference = structuredClone(value)
    expect(v.validate(value)).toBe(true)
    expect(spy).toHaveBeenCalled()
    expect(new WalkValidator(makeModel(), { unknownProps: 'strip' }).validate(reference)).toBe(true)
    expect(value).toEqual(reference)
    // (the intersection's second member strips the first member's `a`, as the walk does)
    expect(value).toEqual({ ...valid(), both: {} })
  })

  // A deferred nested strip would be observable by later reads that reach the stripped
  // object without being it: a prototype, a proxy, an accessor.
  it('later reads through a prototype / proxy / accessor see the walk’s nested strips', () => {
    const named = obj({ name: str().$type }).$type
    const cases: Array<[TAtscriptAnnotatedType, () => any]> = [
      // `x` inherits `extra` from the stripped `a`
      [
        obj({ a: named, x: obj({ extra: str().$type }).$type }).$type,
        () => {
          const a = { name: 'a', extra: 'e' }
          return { a, x: Object.create(a) }
        },
      ],
      // the root inherits `b` from `a`, stripped while visiting the root's first prop
      [
        obj({ a: obj({ x: str().$type }).$type, b: str().$type }).$type,
        () => {
          const p: any = { x: '1', b: 'hi' }
          const v = Object.create(p)
          v.a = p
          return v
        },
      ],
      // a trap-free proxy of the stripped object
      [
        obj({ a: named, x: obj({ name: str().$type, extra: str().$type }).$type }).$type,
        () => {
          const a = { name: 'a', extra: 'e' }
          return { a, x: new Proxy(a, {}) }
        },
      ],
      // a pure accessor reading the stripped key
      [
        obj({ a: named, x: str().$type }).$type,
        () => {
          const v: any = { a: { name: 'a', extra: 'e' } }
          Object.defineProperty(v, 'x', { enumerable: false, get: () => v.a.extra })
          return v
        },
      ],
      // the stripped object is the last array item, read again through a proxy later
      [
        obj({ list: arr(named).$type, x: obj({ name: str().$type, extra: str().$type }).$type })
          .$type,
        () => {
          const a = { name: 'a', extra: 'e' }
          return { list: [{ name: 'b' }, a], x: new Proxy(a, {}) }
        },
      ],
    ]
    for (const [t, make] of cases) {
      const a = make()
      const b = make()
      const r1 = run(new Validator(t, { unknownProps: 'strip' }), a)
      const r2 = run(new WalkValidator(t, { unknownProps: 'strip' }), b)
      expect(r1).toBe(r2)
      expect(r1).toBe(false)
      expect({ ...a }).toEqual({ ...b })
    }
  })

  it('a top-level intersection / union strips the root like the walk', () => {
    const inter = $('intersection')
      .item(obj({ a: num().$type }).$type)
      .item(union(obj({ a: num().optional().$type }).$type, prim('any').$type).$type)
      .item(prim('any').$type).$type
    const un = union(
      obj({ k: lit(1).$type, a: num().$type }).$type,
      $('intersection')
        .item(obj({ k: lit(2).$type }).$type)
        .item(prim('string').$type).$type,
      prim('any').$type
    ).$type
    for (const t of [inter, un]) {
      for (const value of [
        { a: 1 },
        { a: 1, z: 2 },
        { k: 1, a: 1, z: 1 },
        { k: 2, a: 1 },
        { k: 2, z: 1 },
      ]) {
        for (const opts of MODES) {
          compare(t, opts, value)
        }
      }
    }
  })

  it('a failing value is left untouched for the walk (which strips passing nested objects)', () => {
    const t = obj({ a: obj({ x: num().$type }).$type, b: num().$type }).$type
    const fast = new Validator(t, { unknownProps: 'strip' })
    const value: any = { a: { x: 1, junk: 1 }, b: 'no', junk: 2 }
    expect(fast.validate(value, true)).toBe(false)
    // the walk strips `a` (it passed), not the failing root
    expect(value).toEqual({ a: { x: 1 }, b: 'no', junk: 2 })
  })

  it('aliased objects, intersections and cycles see the walk’s earlier strips', () => {
    const inner = obj({ x: num().$type }).$type
    const wider = obj({ x: num().$type, y: num().$type }).$type
    const shared: any = { x: 1, y: 2 }
    // stripped as `inner` first, then read as `wider` (y is gone in the walk)
    compare(obj({ a: inner, b: wider }).$type, { unknownProps: 'strip' }, { a: shared, b: shared })
    compare(obj({ b: wider, a: inner }).$type, { unknownProps: 'strip' }, { b: shared, a: shared })
    // same object twice in an array
    compare(arr(inner).$type, { unknownProps: 'strip' }, [shared, shared])
    // intersection members visit one object in turn
    const inter = $('intersection')
      .item(obj({ a: num().$type }).$type)
      .item(obj({ b: str().optional().$type }).$type).$type
    for (const value of [{ a: 1, b: 'x' }, { a: 1, b: 2 }, { a: 1 }, { a: 1, c: 1 }]) {
      for (const opts of MODES) {
        compare(inter, opts, value)
      }
    }
    // a nested visit of the same object strips keys its outer visit still reads
    const cyc = obj({ a: inner, b: str().$type }).$type
    const loop: any = { b: 's', x: 1 }
    loop.a = loop
    for (const opts of MODES) {
      compare(cyc, opts, loop)
    }
  })

  it('a rejected union branch keeps its nested strips for the next branches', () => {
    const t = union(
      obj({ n: obj({ x: num().$type }).$type, k: lit(1).$type }).$type,
      obj({ n: obj({ x: num().$type, y: num().$type }).$type, k: lit(2).$type }).$type,
      obj({ n: obj({ x: num().$type, y: num().optional().$type }).$type, k: lit(2).$type }).$type
    ).$type
    for (const value of [
      { n: { x: 1, y: 2 }, k: 2 },
      { n: { x: 1, y: 2 }, k: 1 },
      { n: { x: 1, y: 2, z: 3 }, k: 2, w: 1 },
      { n: { x: 1 }, k: 2 },
    ]) {
      for (const opts of MODES) {
        compare(t, opts, value)
      }
    }
  })

  it('with errorLimit, a rejected branch may stop before nested objects it would strip', () => {
    // branch 1 fails on `k` first: with errorLimit 1 the walk never reaches (nor strips) `n`
    const t = union(
      obj({ k: lit(1).$type, n: obj({ x: num().$type }).$type }).$type,
      obj({ k: lit(2).$type, n: prim('any').$type }).$type
    ).$type
    for (const errorLimit of [1, 10]) {
      compare(t, { unknownProps: 'strip', errorLimit }, { k: 2, n: { x: 1, junk: 1 } })
    }
  })

  it('an unknown key in a union branch does not skip a later throwing prop', () => {
    const t = union(
      obj({ a: str().$type, b: str({ 'expect.pattern': { pattern: '(' } }).$type }).$type,
      obj({ a: str().$type, b: str().$type, junk: num().$type }).$type
    ).$type
    const value = { a: 'x', b: 'y', junk: 1 }
    expect(() => new WalkValidator(t).validate(value, true)).toThrow()
    expect(() => new Validator(t).validate(value, true)).toThrow()
  })

  it('a validate() re-entered mid-check (getter) keeps the outer strips', () => {
    // The root's first intersection member records its top-level strip; the second member's
    // `type` getter then runs a nested 'strip' validate() before the outer call completes.
    const nested = new Validator(obj({ x: num().$type }).$type, { unknownProps: 'strip' })
    const reentering = prim('any').$type
    const anyType = reentering.type
    let reentered = 0
    Object.defineProperty(reentering, 'type', {
      get: () => {
        reentered++
        // a failing nested call must not drop the outer call's pending strips
        nested.validate({ x: 'no', junk: 1 }, true)
        return anyType
      },
    })
    const t = $('intersection')
      .item(obj({ a: num().$type }).$type)
      .item(reentering).$type
    const fast = new Validator(t, { unknownProps: 'strip' })
    const spy = vi.spyOn(fast as any, 'validateSafe')
    const a = { a: 1, junk: 1 }
    const b = { a: 1, junk: 1 }
    reentered = 0
    expect(fast.validate(a, true)).toBe(
      new WalkValidator(t, { unknownProps: 'strip' }).validate(b, true)
    )
    expect(reentered).toBeGreaterThan(0)
    expect(a).toEqual(b)
    expect(a).toEqual({ a: 1 })
    // the outer pass was decided (and stripped) by the pre-check
    expect(spy).not.toHaveBeenCalled()
  })

  it('a non-deletable nested unknown key throws like the walk', () => {
    const t = obj({ a: obj({ x: num().$type }).$type, b: obj({ y: num().$type }).$type }).$type
    const make = () => ({
      a: { x: 1, junk: 1 },
      b: Object.freeze({ y: 1, junk: 2 }),
    })
    const a = make()
    const b = make()
    expect(run(new Validator(t, { unknownProps: 'strip' }), a)).toBe(
      run(new WalkValidator(t, { unknownProps: 'strip' }), b)
    )
    expect(a).toEqual(b)
    expect(a.a).toEqual({ x: 1 })
  })

  it('props added / removed / turned phantom after the first validate are honoured', () => {
    type TObj = TAtscriptAnnotatedType<TAtscriptTypeObject>
    const item = () => obj({ a: num().$type, b: num().optional().$type }).$type as TObj
    const changes: Array<(t: TObj) => void> = [
      t => t.type.props.set('c', num().optional().$type),
      t => t.type.props.delete('b'),
      t => ((t.type.props.get('b')!.type as any).designType = 'phantom'),
    ]
    for (const change of changes) {
      for (const wrap of [(i: TObj) => i, (i: TObj) => arr(i).$type]) {
        const it = item()
        const t = wrap(it)
        const list = t !== it
        const value = () => (list ? [{ a: 1, b: 2, c: 3 }] : { a: 1, b: 2, c: 3 })
        const fast = new Validator(t, { unknownProps: 'strip' })
        const first = value()
        fast.validate(first, true)
        change(it)
        const a = value()
        const b = value()
        expect(fast.validate(a, true)).toBe(
          new WalkValidator(t, { unknownProps: 'strip' }).validate(b, true)
        )
        expect(a).toEqual(b)
      }
    }
  })
})
