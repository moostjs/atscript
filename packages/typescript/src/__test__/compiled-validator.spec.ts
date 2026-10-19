import { readFileSync } from 'fs'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  boundCheck,
  COMPILED_ENGINE,
  compileType,
  installCompiledEngine,
} from '../../test/compiled-engine'
import {
  annotate,
  createAnnotatedTypeNode,
  defineAnnotatedType as $,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeObject,
} from '../runtime/annotated-type'
import { __setAutoCompile } from '../runtime/compiled-check/registry'
import { invalidateCompiledValidators } from '../runtime/compiled-check/tracking'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { COMPILED_ENV, fastCheckPasses } from '../runtime/validator-fast-check'
import { prepareFixtures } from '../test-utils'

/** Reference: a subclass never takes the pre-check, so it always runs the full walk. */
class WalkValidator extends Validator {}

const rootDir = path.join(__dirname, 'fixtures', 'compiled')

type TObj = TAtscriptAnnotatedType<TAtscriptTypeObject>

let models: Record<string, any>
let shared: Record<string, any>

beforeAll(async () => {
  // Generated checks only: no runtime compilation of what the generator left out.
  __setAutoCompile(null)
  await prepareFixtures({ rootDir, formats: ['js'], tsPluginOptions: { compileValidators: true } })
  models = await import(path.join(rootDir, 'models.as.js'))
  shared = await import(path.join(rootDir, 'shared.as.js'))
})

afterAll(() => {
  if (COMPILED_ENGINE) {
    installCompiledEngine()
  }
})

const OPTION_SETS: Array<Partial<TValidatorOptions>> = [
  {},
  { unknownProps: 'ignore' },
  { unknownProps: 'strip' },
  { partial: true },
  { partial: 'deep' },
  { partial: true, unknownProps: 'strip' },
  { errorLimit: 1 },
]

function run(v: Validator, x: unknown) {
  try {
    return v.validate(x, true)
  } catch (error) {
    return `threw: ${(error as Error).message}`
  }
}

/** Same result, errors and strip mutations as the full walk. */
function compare(def: TAtscriptAnnotatedType, opts: Partial<TValidatorOptions>, value: unknown) {
  const fast = new Validator(def, opts)
  const walk = new WalkValidator(def, opts)
  const a = structuredClone(value)
  const b = structuredClone(value)
  const r1 = run(fast, a)
  const r2 = run(walk, b)
  expect(r1).toBe(r2)
  expect(fast.errors).toEqual(walk.errors)
  expect(a).toEqual(b)
  return r1
}

// ── random values ───────────────────────────────────────────────────────────

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
  '  ',
  'a',
  'abc',
  'US',
  'us',
  'ORD-1',
  'ORD-12',
  'ORD-2',
  'x'.repeat(60),
  'active',
  'blocked',
  'a',
  'b',
  '1.50',
  0,
  -1,
  1,
  1.5,
  3,
  11,
  Number.NaN,
  true,
  false,
  null,
  undefined,
  [],
  {},
  ['a'],
  [1, 2],
  { a: 1 },
]

const pick = (r: () => number) => structuredClone(POOL[Math.floor(r() * POOL.length)])

function gen(def: TAtscriptAnnotatedType, r: () => number, depth = 0): unknown {
  if (r() < 0.06) {
    return pick(r)
  }
  if (def.optional && r() < (depth > 2 ? 0.8 : 0.2)) {
    return r() < 0.5 ? undefined : null
  }
  const t = def.type as any
  switch (t.kind) {
    case '': {
      if (t.value !== undefined) {
        return t.value
      }
      switch (t.designType) {
        case 'string': {
          return ['ORD-12', 'US', 'abcd', 'Main st', 'x'][Math.floor(r() * 5)]
        }
        case 'number': {
          return [1, 2, 5, 0.5][Math.floor(r() * 4)]
        }
        case 'boolean': {
          return r() < 0.7
        }
        case 'decimal': {
          return '2.50'
        }
        case 'null': {
          return null
        }
        default: {
          return pick(r)
        }
      }
    }
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, p] of t.props as Map<string, TAtscriptAnnotatedType>) {
        // A `g` regex keeps `lastIndex` across validators: results depend on call order.
        if ((depth > 3 && p.optional) || k === 'stateful') {
          continue
        }
        const v = gen(p, r, depth + 1)
        if (v !== undefined || r() < 0.3) {
          out[k] = v
        }
      }
      if (r() < 0.1) {
        out.extra = 1
      }
      return out
    }
    case 'array': {
      const n = depth > 3 ? 0 : 1 + Math.floor(r() * 3)
      return Array.from({ length: n }, () => gen(t.of, r, depth + 1))
    }
    case 'tuple': {
      return t.items.map((i: TAtscriptAnnotatedType) => gen(i, r, depth + 1))
    }
    case 'union': {
      return gen(t.items[Math.floor(r() * t.items.length)], r, depth)
    }
    case 'intersection': {
      return gen(t.items[0], r, depth)
    }
    default: {
      return undefined
    }
  }
}

function mutate(value: any, r: () => number): any {
  if (typeof value !== 'object' || value === null || r() < 0.2) {
    return pick(r)
  }
  const keys = Object.keys(value)
  if (keys.length === 0 || r() < 0.08) {
    value.extra = 1
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

/** Seeded parity fuzz against the walk; returns how many values passed. */
function fuzz(def: TAtscriptAnnotatedType, seed: number, n = 300, valid?: () => unknown) {
  const r = rng(seed)
  let passed = 0
  for (let i = 0; i < n; i++) {
    let value = valid && r() < 0.6 ? valid() : gen(def, r)
    if (r() < 0.5) {
      for (let j = 1 + Math.floor(r() * 2); j > 0; j--) {
        value = mutate(value, r)
      }
    }
    for (const opts of OPTION_SETS) {
      if (compare(def, opts, value) === true) {
        passed++
      }
    }
  }
  return passed
}

const validLine = () => ({ sku: 'SKU-1', qty: 2, price: 9.5 })
const validAddress = () => ({ street: '1 Main', city: 'Springfield', country: 'US' })
const validOrder = (): any => ({
  id: 'ORD-12',
  name: 'Order',
  status: 'active',
  address: validAddress(),
  country: 'US',
  tags: ['a'],
  lines: [validLine()],
})

// ── generated modules ───────────────────────────────────────────────────────

describe('compiled validator checks — generated modules', { timeout: 30_000 }, () => {
  const REGISTERED = {
    models: [
      'OrderLine',
      'TreeNode',
      'Json',
      'LocalAlias',
      'LocalAliasOfAlias',
      // aliases of imported types: bound through the imported class's compiled check
      'Alias1',
      'Alias2',
      'Order',
    ],
    shared: ['Country', 'Status', 'Address', 'Category', 'Tags', 'Lone', 'Owner'],
  }

  it('every class whose type the module builds has a compiled check bound to the live type', () => {
    invalidateCompiledValidators()
    for (const [mod, names] of [
      [models, REGISTERED.models],
      [shared, REGISTERED.shared],
    ] as const) {
      for (const name of names) {
        expect([name, boundCheck(mod[name]) !== null]).toEqual([name, true])
      }
    }
  })

  it('the generated code is CSP-safe (no eval / new Function)', () => {
    for (const file of ['models.as.js', 'shared.as.js']) {
      const code = readFileSync(path.join(rootDir, file), 'utf8')
      expect(code).toContain('$cv(')
      expect(code).not.toMatch(/\bnew Function\b|\bFunction\(|\beval\(/)
    }
  })

  it('validate() runs the compiled check: passes without the walk', () => {
    const { Order, OrderLine } = models
    const v = new Validator(Order)
    invalidateCompiledValidators()
    expect(v.validate(validOrder(), true)).toBe(true)
    const walk = vi.spyOn(v as any, 'validateSafe')
    expect(v.validate(validOrder(), true)).toBe(true)
    expect(walk).not.toHaveBeenCalled()
    const bad = validOrder()
    bad.lines[0].qty = 0
    expect(v.validate(bad, true)).toBe(false)
    expect(walk).toHaveBeenCalled()
    expect(v.errors).toEqual([{ path: 'lines.0.qty', message: 'Expected minimum 1, got 0' }])
    // The bound check holds the bind-time constraint values: an in-place edit (a raw write)
    // is not seen until invalidated — so the decision above was the compiled check's.
    const min = (OrderLine as TObj).type.props.get('qty')!.metadata.get('expect.min') as any
    const original = { ...min }
    try {
      min.minValue = 5
      expect(v.validate(validOrder(), true)).toBe(true)
      invalidateCompiledValidators()
      expect(v.validate(validOrder(), true)).toBe(false)
    } finally {
      Object.assign(min, original)
      invalidateCompiledValidators()
    }
    walk.mockRestore()
  })

  it('references into other modules, aliases of imported types and cloned imported props run compiled code', () => {
    const { Order } = models
    const interp = vi.spyOn(COMPILED_ENV, 'interp')
    try {
      // (Re)bound now: an interpreted fallback anywhere in Order would go through the spy.
      invalidateCompiledValidators()
      const value = {
        ...validOrder(),
        billing: validAddress(),
        aliased: validAddress(),
        local: validLine(),
        pair: [1, 'a'],
        score: 5,
        codes: ['ab'],
        category: { name: 'c', parent: { name: 'p' } },
        tree: { label: 'a', children: [{ label: 'b' }] },
        json: [1, 'a', [true]],
        price: '2.50',
        flags: { active: true, accepted: true },
        kind: 1,
        owner: { name: 'o', orders: [validOrder()] },
        inter: 'US',
        statuses: ['active'],
      }
      const v = new Validator(Order)
      const walk = vi.spyOn(v as any, 'validateSafe')
      expect(v.validate(value, true)).toBe(true)
      expect(walk).not.toHaveBeenCalled()
      expect(interp).not.toHaveBeenCalled()
      // `address` (cloned by the mutating annotate: `street` max 10) binds Address's check
      // as a template with its own constraint values.
      expect(
        v.validate({ ...value, address: { ...validAddress(), street: 'x'.repeat(11) } }, true)
      ).toBe(false)
    } finally {
      interp.mockRestore()
      invalidateCompiledValidators()
    }
  })

  it('same-file mutating annotate applies to the alias clone only', () => {
    const { Order } = models
    const { Address } = shared
    const street = 'x'.repeat(20)
    expect(new Validator(Address).validate({ ...validAddress(), street }, true)).toBe(true)
    expect(
      new Validator(Order).validate(
        { ...validOrder(), address: { ...validAddress(), street } },
        true
      )
    ).toBe(false)
  })

  it('stateful patterns and prop patterns fall back to the walk', () => {
    const { Order } = models
    const check = boundCheck(Order)!
    const opts = new Validator(Order)['opts']
    // A `g` / `y` pattern bails (its `lastIndex` state belongs to the walk).
    expect(check({ ...validOrder(), stateful: 'xa' }, 1, opts)).toBe(2)
    expect(check(validOrder(), 1, opts)).toBe(1)
    for (const value of [
      { ...validOrder(), meta: { a: 'b' } },
      { ...validOrder(), meta: { a: 1 } },
      { ...validOrder(), aliased: validAddress() },
      { ...validOrder(), aliased: { city: '' } },
    ]) {
      for (const opts of OPTION_SETS) {
        compare(Order, opts, value)
      }
    }
  })

  it('parity with the walk: Order (fuzz)', () => {
    expect(fuzz(models.Order, 11, 300, validOrder)).toBeGreaterThan(300)
  })

  it('parity with the walk: recursive, cross-module and alias types (fuzz)', () => {
    for (const [def, seed] of [
      [models.TreeNode, 1],
      [models.Json, 2],
      [models.LocalAliasOfAlias, 3],
      [shared.Category, 4],
      [shared.Owner, 5],
      [shared.Tags, 6],
      [shared.Status, 7],
    ] as const) {
      fuzz(def, seed, 150)
    }
  })

  it('tracked mutations re-bind; raw writes need invalidateCompiledValidators()', () => {
    const { OrderLine } = models
    const sku = (OrderLine as TObj).type.props.get('sku')!
    const original = sku.metadata.get('expect.minLength') as any
    const v = new Validator(OrderLine)
    expect(v.validate(validLine(), true)).toBe(true)
    // A new value of an existing annotation: re-bound with the new value.
    annotate(sku.metadata, 'expect.minLength', { length: 10 })
    expect(v.validate(validLine(), true)).toBe(false)
    expect(boundCheck(OrderLine)).not.toBeNull()
    annotate(sku.metadata, 'expect.minLength', { length: 4 })
    expect(v.validate(validLine(), true)).toBe(true)
    // A raw write is not seen until invalidated (documented contract): the compiled check
    // still passes the 5-char sku here although the walk would now reject it.
    ;(sku.metadata.get('expect.minLength') as any).length = 10
    expect(v.validate(validLine(), true)).toBe(true)
    expect(new WalkValidator(OrderLine).validate(validLine(), true)).toBe(false)
    invalidateCompiledValidators()
    expect(v.validate(validLine(), true)).toBe(false)
    sku.metadata.set('expect.minLength', original)
    // A new annotation changes the compiled shape: the interpreted pre-check takes over.
    annotate(sku.metadata, 'expect.maxLength', { length: 3 })
    expect(v.validate(validLine(), true)).toBe(false)
    expect(boundCheck(OrderLine)).toBeNull()
    sku.metadata.delete('expect.maxLength')
    expect(boundCheck(OrderLine)).not.toBeNull()
    expect(v.validate(validLine(), true)).toBe(true)
  })
})

// ── runtime-compiled (test hook) checks ─────────────────────────────────────

describe('compiled validator checks — engine details', () => {
  it('passes exactly the values the interpreted pre-check passes', () => {
    const { Order } = models
    // Same type tree, no compiled check: the interpreted pre-check.
    const interpreted = { ...Order } as TAtscriptAnnotatedType
    const r = rng(9)
    let passes = 0
    for (let i = 0; i < 300; i++) {
      const value = r() < 0.3 ? validOrder() : mutate(validOrder(), r)
      for (const extra of OPTION_SETS) {
        const opts = {
          partial: false,
          unknownProps: 'error',
          errorLimit: 10,
          plugins: [],
          ...extra,
        }
        const a = structuredClone(value)
        const b = structuredClone(value)
        const compiled = fastCheckPasses(Order, a, opts as TValidatorOptions)
        expect(compiled).toBe(fastCheckPasses(interpreted, b, opts as TValidatorOptions))
        expect(a).toEqual(b)
        passes += compiled ? 1 : 0
      }
    }
    expect(passes).toBeGreaterThan(300)
  })

  it('hand-built types bind and run through the test hook', () => {
    const t = $('object')
      .prop('a', $().designType('number').annotate('expect.min', 2).$type)
      .prop('b', $('array').of($().designType('string').$type).optional().$type).$type
    compileType(t)
    expect(boundCheck(t)).not.toBeNull()
    expect(new Validator(t).validate({ a: 2, b: ['x'] }, true)).toBe(true)
    expect(new Validator(t).validate({ a: 1 }, true)).toBe(false)
  })

  it('untracked (plain Map) metadata stays interpreted', () => {
    const node = $().designType('string').$type
    node.metadata = new Map() as any
    const t = $('object').prop('s', node).$type
    compileType(t)
    expect(boundCheck(t)).toBeNull()
    expect(new Validator(t).validate({ s: 'x' }, true)).toBe(true)
  })
})

// ── regressions ─────────────────────────────────────────────────────────────

describe('compiled validator checks — registry and binding', () => {
  it('a chained reference into an imported type compiles nothing and stays correct', () => {
    // (Compiling this module used to crash the generator.)
    const { ChainAlias } = models
    expect(boundCheck(ChainAlias)).toBeNull()
    for (const value of ['x', '', 'x'.repeat(101), 1, null]) {
      compare(ChainAlias, {}, value)
    }
  })

  it('another copy of the runtime does not see this copy’s registrations', async () => {
    const t = $('object').prop(
      'a',
      $().designType('string').annotate('expect.maxLength', { length: 3 }).$type
    ).$type
    compileType(t)
    expect(new Validator(t).validate({ a: 'abc' }, true)).toBe(true)
    vi.resetModules()
    const copyRegistry = await import('../runtime/compiled-check/registry')
    const copyFastCheck = await import('../runtime/validator-fast-check')
    const copy = await import('../runtime/validator')
    expect(copy.Validator).not.toBe(Validator)
    expect(copyRegistry.compiledCheckFor(t, copyFastCheck.COMPILED_ENV)).toBeNull()
    // A tracked mutation (seen by this copy only): the other copy reads the tree live.
    annotate(t.type.props.get('a')!.metadata, 'expect.maxLength', { length: 1 })
    expect(new copy.Validator(t).validate({ a: 'abc' }, true)).toBe(false)
    expect(new Validator(t).validate({ a: 'abc' }, true)).toBe(false)
  })

  it('a subclass of a registered class does not inherit its compiled check', () => {
    class Gen {
      static type = {}
      static metadata = new Map()
    }
    $('object', Gen).prop('a', $().designType('string').$type)
    compileType(Gen as unknown as TAtscriptAnnotatedType)
    expect(boundCheck(Gen as unknown as TAtscriptAnnotatedType)).not.toBeNull()
    class Sub extends Gen {
      static override type = {}
      static override metadata = new Map()
    }
    $('object', Sub).prop('a', $().designType('number').$type)
    const sub = Sub as unknown as TAtscriptAnnotatedType
    expect(boundCheck(sub)).toBeNull()
    expect(new Validator(sub).validate({ a: 'x' }, true)).toBe(false)
    expect(new Validator(sub).validate({ a: 1 }, true)).toBe(true)
  })

  it('`null` on an optional @meta.required node is decided on the live tree', () => {
    // The node's type is checked by the interpreted pre-check (a cross-module site whose
    // target has no compiled check): its subtree is not watched by the bind.
    const item = $().designType('number').optional()
    const foreign = $('union')
      .item($().designType('string').$type)
      .item($('union').item(item.$type).$type).$type
    const ref = $().refTo(foreign).optional().annotate('meta.required', true).$type
    const root = $('object').prop('a', ref).$type
    compileType(root, type => (type === foreign.type ? 'ext' : undefined))
    expect(boundCheck(root)).not.toBeNull()
    // the nested optional item accepts `null`
    expect(new Validator(root).validate({ a: null }, true)).toBe(true)
    item.optional(false)
    expect(new WalkValidator(root).validate({ a: null }, true)).toBe(false)
    expect(new Validator(root).validate({ a: null }, true)).toBe(false)
    item.optional()
    expect(new Validator(root).validate({ a: null }, true)).toBe(true)
  })
})

const anyType = () => $().designType('any').$type
const throwingIndex = (items: unknown[]) => {
  const a = [...items]
  Object.defineProperty(a, 0, {
    get() {
      throw new Error('index getter')
    },
    enumerable: true,
  })
  return a
}
const throwingIterator = (items: unknown[]) => {
  const a = [...items]
  ;(a as any)[Symbol.iterator] = () => {
    throw new Error('iterator')
  }
  return a
}

describe('compiled validator checks — unchecked elements are still read', () => {
  const expectSameThrow = (def: TAtscriptAnnotatedType, value: unknown) => {
    compileType(def)
    expect(boundCheck(def)).not.toBeNull()
    let walkError: unknown
    try {
      new WalkValidator(def).validate(value, true)
    } catch (error) {
      walkError = error
    }
    expect(walkError).toBeInstanceOf(Error)
    expect(() => new Validator(def).validate(value, true)).toThrow((walkError as Error).message)
  }

  it('any[] iterates its elements (throwing iterator / index getter)', () => {
    const list = $('array').of(anyType()).$type
    expectSameThrow(list, throwingIterator([1]))
    expectSameThrow(list, throwingIndex([1]))
    const phantomList = $('array').of($().designType('phantom').$type).$type
    expectSameThrow(phantomList, throwingIterator([1]))
  })

  it('a prop of type any[] iterates its elements', () => {
    const obj = $('object').prop('list', $('array').of(anyType()).$type).$type
    expectSameThrow(obj, { list: throwingIterator([1]) })
    expectSameThrow(obj, { list: throwingIndex([1]) })
  })

  it('a tuple reads its `any` items', () => {
    const tuple = $('tuple').item(anyType()).item($().designType('string').$type).$type
    expectSameThrow(tuple, throwingIndex([0, 's']))
    expect(new Validator(tuple).validate([{}, 's'], true)).toBe(true)
  })
})

const str = () => ({ kind: '', designType: 'string', tags: new Set() }) as any

describe('createAnnotatedTypeNode / defineAnnotatedType metadata identity', () => {
  it('createAnnotatedTypeNode keeps the caller’s map (and its subclass)', () => {
    const m = new Map<string, unknown>()
    const node = createAnnotatedTypeNode(str(), m)
    expect(node.metadata).toBe(m)
    m.set('expect.minLength', { length: 3 })
    expect(new Validator(node).validate('a', true)).toBe(false)

    class Sub extends Map<string, unknown> {
      override get(k: string) {
        return k === 'expect.maxLength' ? { length: 1 } : super.get(k)
      }
    }
    const sub = new Sub([['x', 1]])
    const n2 = createAnnotatedTypeNode(str(), sub)
    expect(n2.metadata).toBe(sub)
    expect(n2.metadata.get('expect.maxLength' as any)).toEqual({ length: 1 })
  })

  it('createAnnotatedTypeNode without a map gets a tracked one (bindable)', () => {
    const t = $('object').prop('s', createAnnotatedTypeNode(str())).$type
    compileType(t)
    expect(boundCheck(t)).not.toBeNull()
  })

  it('defineAnnotatedType keeps a non-empty or subclassed base map, upgrades an empty plain one', () => {
    const filled = new Map<string, unknown>([['meta.label', 'x']])
    const a = $('', { metadata: filled }).designType('string').$type
    expect(a.metadata).toBe(filled)

    class Sub extends Map<string, unknown> {}
    const sub = new Sub()
    expect($('', { metadata: sub }).designType('string').$type.metadata).toBe(sub)

    // A generated class starts with `static metadata = new Map()`: upgraded to stay bindable.
    const empty = new Map()
    const c = $('', { metadata: empty }).designType('string').$type
    expect(c.metadata).not.toBe(empty)
    const t = $('object').prop('s', c).$type
    compileType(t)
    expect(boundCheck(t)).not.toBeNull()
  })
})
