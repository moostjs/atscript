import { describe, expect, it, vi } from 'vitest'

import { boundCheck, COMPILED_ENGINE } from '../../test/compiled-engine'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { Validator, type TValidatorOptions, type TValidatorPlugin } from '../runtime/validator'
import { WalkValidator } from '../test-utils'

// `unknownProps: 'strip'` deletes on success only (0.2.0): the checks read the input untouched,
// `validate()` deletes the recorded unknown keys only when it returns `true`, and a rejected
// union branch or a failed validation strips nothing. Every case runs on the validator (its
// pre-check, compiled in the `compiled` project) and on the walk alone, which must agree.

const num = () => $().designType('number').tags('number').$type
const str = () => $().designType('string').tags('string').$type
const any = () => $().designType('any').$type
const lit = (v: string | number) =>
  $()
    .designType(typeof v as 'string')
    .value(v).$type
const obj = (props: Record<string, TAtscriptAnnotatedType>) => {
  const h = $('object')
  for (const [k, t] of Object.entries(props)) {
    h.prop(k, t)
  }
  return h.$type
}
const opt = (t: TAtscriptAnnotatedType) => $().ref(t).optional().$type
const arr = (of: TAtscriptAnnotatedType) => $('array').of(of).$type
const union = (...items: TAtscriptAnnotatedType[]) => {
  const h = $('union')
  for (const item of items) {
    h.item(item)
  }
  return h.$type
}

/** The keys of every object inside `value`, in order, depth-first (each object once). */
function keyOrder(value: unknown, seen = new Set<object>(), out: string[][] = []): string[][] {
  if (typeof value === 'object' && value !== null && !seen.has(value)) {
    seen.add(value)
    out.push(Object.keys(value))
    for (const v of Object.values(value)) {
      keyOrder(v, seen, out)
    }
  }
  return out
}

interface TOutcome {
  passed: boolean
  value: any
  errors: unknown[]
}

/**
 * Validates `make()` with the validator and with the walk alone: the same result, errors and
 * mutation (key order included). Returns the validator's outcome.
 */
function both(
  t: TAtscriptAnnotatedType,
  make: () => any,
  opts: Partial<TValidatorOptions> = {}
): TOutcome {
  const options = { unknownProps: 'strip' as const, ...opts }
  const fast = new Validator(t, options)
  const walk = new WalkValidator(t, options)
  const a = make()
  const b = make()
  const passed = fast.validate(a, true)
  expect(walk.validate(b, true)).toBe(passed)
  expect(fast.errors).toEqual(walk.errors)
  expect(a).toEqual(b)
  expect(keyOrder(a)).toEqual(keyOrder(b))
  return { passed, value: a, errors: fast.errors }
}

/** Whether a passing `validate()` of `make()` was decided without the walk. */
function preChecked(t: TAtscriptAnnotatedType, make: () => any): boolean {
  const v = new Validator(t, { unknownProps: 'strip' })
  const spy = vi.spyOn(v as any, 'validateSafe')
  expect(v.validate(make(), true)).toBe(true)
  return spy.mock.calls.length === 0
}

const item = obj({ sku: str(), qty: num() })
const address = obj({ street: str(), geo: opt(obj({ lat: num(), lng: num() })) })
const card = obj({ number: str(), holder: obj({ name: str() }) })
const paypal = obj({ email: str() })
const order = obj({
  id: str(),
  address,
  items: arr(item),
  payment: union(card, paypal),
})
const validOrder = () => ({
  id: 'o1',
  address: { street: 'Main', geo: { lat: 1, lng: 2 } },
  items: [
    { sku: 'a', qty: 1 },
    { sku: 'b', qty: 2 },
  ],
  payment: { number: '4111', holder: { name: 'J' } },
})
/** {@link validOrder} with unknown keys on every object, at every depth. */
const unknownOrder = () => {
  const o: any = validOrder()
  o.trackingRef = 'TRK'
  o.address.note = 'n'
  o.address.geo.alt = 3
  o.items[0].warehouse = 'W'
  o.items[1].warehouse = 'W'
  o.payment.brand = 'visa'
  o.payment.holder.title = 'Dr'
  return o
}

describe("unknownProps 'strip': deletes on success only", () => {
  it('the compiled project really compiles the types', () => {
    if (COMPILED_ENGINE) {
      new Validator(order).validate(validOrder(), true)
      expect(boundCheck(order)).not.toBeNull()
    }
  })

  it('nested objects and arrays of objects: every unknown key deleted, without the walk', () => {
    const { passed, value } = both(order, unknownOrder)
    expect(passed).toBe(true)
    expect(value).toEqual(validOrder())
    expect(keyOrder(value)).toEqual(keyOrder(validOrder()))
    expect(preChecked(order, unknownOrder)).toBe(true)
  })

  it('the accepted union branch strips its object, nested objects included', () => {
    const make = () => ({
      ...validOrder(),
      payment: { number: '4111', holder: { name: 'J', title: 'Dr' }, brand: 'visa' },
    })
    expect(both(order, make).value).toEqual(validOrder())
    // the second branch accepted (the card branch fails on its props, before any strip)
    const paypalOrder = () => ({ ...validOrder(), payment: { email: 'e', brand: 'pp' } })
    expect(both(order, paypalOrder).value).toEqual({ ...validOrder(), payment: { email: 'e' } })
    expect(preChecked(order, make)).toBe(true)
    expect(preChecked(order, paypalOrder)).toBe(true)
  })

  it('U: a rejected branch strips nothing a later branch reads', () => {
    // before 0.2.0 branch 1 deleted `n.y` and branch 2 then failed
    const t = union(
      obj({ n: obj({ x: num() }), k: lit(1) }),
      obj({ n: obj({ x: num(), y: num() }), k: lit(2) })
    )
    const { passed, value } = both(t, () => ({ n: { x: 1, y: 2 }, k: 2 }))
    expect(passed).toBe(true)
    expect(value).toEqual({ n: { x: 1, y: 2 }, k: 2 })
  })

  it('U2: a rejected branch strips nothing the accepted branch keeps', () => {
    // before 0.2.0 the rejected branch 1 deleted `n.junk`
    const t = union(obj({ n: obj({ x: num() }), k: lit(1) }), obj({ n: any(), k: lit(2) }))
    const { passed, value } = both(t, () => ({ n: { x: 1, junk: 2 }, k: 2 }))
    expect(passed).toBe(true)
    expect(value).toEqual({ n: { x: 1, junk: 2 }, k: 2 })
  })

  it('F: a failing value keeps every key (no partial strips)', () => {
    // before 0.2.0 the walk deleted `a.junk` because `a` passed before `b` failed
    const t = obj({ a: obj({ x: num() }), b: num() })
    const { passed, value } = both(t, () => ({ a: { x: 1, junk: 1 }, b: 'no', junk: 2 }))
    expect(passed).toBe(false)
    expect(value).toEqual({ a: { x: 1, junk: 1 }, b: 'no', junk: 2 })
  })

  it('A: an object reached twice is read untouched by both visits', () => {
    // before 0.2.0 the first visit deleted `y` and the second one failed on it
    const t = obj({ a: obj({ x: num() }), b: obj({ x: num(), y: num() }) })
    const { passed, value } = both(t, () => {
      const shared = { x: 1, y: 2 }
      return { a: shared, b: shared }
    })
    expect(passed).toBe(true)
    // `y` is unknown to the first visit: deleted once the whole value passed
    expect(value).toEqual({ a: { x: 1 }, b: { x: 1 } })
    expect(value.a).toBe(value.b)
  })

  it('I: a runtime intersection checks every member against the untouched value', () => {
    const t = $('intersection')
      .item(obj({ a: num() }))
      .item(obj({ b: opt(str()) })).$type
    // before 0.2.0 the first member deleted `b` and the value passed (as `{}`)
    const bad = both(t, () => ({ a: 1, b: 2 }))
    expect(bad.passed).toBe(false)
    expect(bad.value).toEqual({ a: 1, b: 2 })
    // each member strips the key only the other declares (JSON Schema `allOf`)
    const good = both(t, () => ({ a: 1, b: 'x' }))
    expect(good.passed).toBe(true)
    expect(good.value).toEqual({})
  })

  it('EL1 / EL10: what a strip deletes does not depend on errorLimit', () => {
    // before 0.2.0 errorLimit 10 let the rejected branch reach `n` and delete `n.junk`
    const t = union(obj({ k: lit(1), n: obj({ x: num() }) }), obj({ k: lit(2), n: any() }))
    for (const errorLimit of [1, 10]) {
      const { passed, value } = both(t, () => ({ k: 2, n: { x: 1, junk: 1 } }), { errorLimit })
      expect(passed).toBe(true)
      expect(value).toEqual({ k: 2, n: { x: 1, junk: 1 } })
    }
  })

  it('PX: a proxy of a stripped object reads it untouched', () => {
    // before 0.2.0 `a.extra` was deleted before `x` (a proxy of `a`) was read, and it failed
    const t = obj({ a: obj({ name: str() }), x: obj({ name: str(), extra: str() }) })
    const { passed, value } = both(t, () => {
      const a = { name: 'a', extra: 'e' }
      return { a, x: new Proxy(a, {}) }
    })
    expect(passed).toBe(true)
    expect({ ...value.a }).toEqual({ name: 'a' })
  })

  it('an invalid value after unknown keys is left exactly as it was', () => {
    const make = () => {
      const o = unknownOrder()
      o.items[1].qty = 'two'
      return o
    }
    for (const errorLimit of [1, 10]) {
      const { passed, value, errors } = both(order, make, { errorLimit })
      expect(passed).toBe(false)
      expect(value).toEqual(make())
      expect(keyOrder(value)).toEqual(keyOrder(make()))
      expect(errors).toMatchObject([
        { path: 'items.1.qty', message: 'Expected number, got string' },
      ])
    }
  })

  it('errorLimit 1: a passing value is stripped in full', () => {
    const { passed, value } = both(order, unknownOrder, { errorLimit: 1 })
    expect(passed).toBe(true)
    expect(value).toEqual(validOrder())
  })

  it('deletes in the walk order: each object when it completes, then its keys in order', () => {
    const t = obj({ a: obj({ x: num() }), list: arr(obj({ y: num() })) })
    const run = (
      V: new (t: TAtscriptAnnotatedType, o: Partial<TValidatorOptions>) => Validator
    ) => {
      const log: string[] = []
      const traced = (name: string, o: object) =>
        new Proxy(o, {
          deleteProperty(target, key) {
            log.push(`${name}.${String(key)}`)
            return Reflect.deleteProperty(target, key)
          },
        })
      const value = traced('root', {
        z1: 1,
        a: traced('a', { x: 1, q: 1, p: 2 }),
        list: [traced('l0', { y: 1, w: 1 }), traced('l1', { y: 2, w: 2 })],
        z0: 0,
      })
      expect(new V(t, { unknownProps: 'strip' }).validate(value, true)).toBe(true)
      return log
    }
    const log = run(Validator)
    expect(log).toEqual(['a.q', 'a.p', 'l0.w', 'l1.w', 'root.z1', 'root.z0'])
    expect(run(WalkValidator)).toEqual(log)
  })
})

/** `inner` passes `strict`'s `inner` with an unknown key; `must` is missing (`strict` fails). */
const altValue = () => ({ a: { inner: { x: 1, junk: 1 } }, extra: 1 })

describe("unknownProps 'strip': a failed plugin sub-validation strips nothing (STRIP-2)", () => {
  const strict = obj({ inner: obj({ x: num() }), must: str() })
  const loose = obj({ inner: any() })
  const slot = any()
  /** A plugin trying `strict`, else `loose`, on the `slot` node. */
  const alternatives: TValidatorPlugin = (ctx, def, value) => {
    if (def === slot) {
      return ctx.validateAnnotatedType(strict, value) || ctx.validateAnnotatedType(loose, value)
    }
    return undefined
  }

  it('plugin alternatives `strict || loose` strip what the union `strict | loose` strips', () => {
    const viaPlugin = altValue()
    const v = new Validator(obj({ a: slot }), { unknownProps: 'strip', plugins: [alternatives] })
    expect(v.validate(viaPlugin, true)).toBe(true)
    const { passed, value } = both(obj({ a: union(strict, loose) }), altValue)
    expect(passed).toBe(true)
    // (`strict` failed at `must` after `inner` passed: its `junk` strip is dropped)
    expect(value).toEqual({ a: { inner: { x: 1, junk: 1 } } })
    expect(viaPlugin).toEqual(value)
  })

  it('a passing plugin sub-validation keeps its strips', () => {
    const value = { a: { inner: { x: 1, junk: 1 }, must: 'm', more: 2 }, extra: 1 }
    const v = new Validator(obj({ a: slot }), { unknownProps: 'strip', plugins: [alternatives] })
    expect(v.validate(value, true)).toBe(true)
    expect(value).toEqual({ a: { inner: { x: 1 }, must: 'm' } })
  })

  it('a passing sub-validation inside a failing call strips nothing', () => {
    const value = { a: { inner: { x: 1, junk: 1 }, must: 'm' }, b: 'no' }
    const v = new Validator(obj({ a: slot, b: num() }), {
      unknownProps: 'strip',
      plugins: [alternatives],
    })
    expect(v.validate(value, true)).toBe(false)
    expect(value).toEqual({ a: { inner: { x: 1, junk: 1 }, must: 'm' }, b: 'no' })
  })
})
