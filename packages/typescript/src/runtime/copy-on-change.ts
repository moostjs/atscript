import type { TAtscriptAnnotatedType, TAtscriptTypeObject } from './annotated-type'

/**
 * Internal sentinel: the value cannot be taken by a type node (drives union branch selection in
 * `coerce.ts` and `normalize.ts`). A {@link mapProps} step returns it to reject the whole object.
 */
export const NO_MATCH = Symbol('atscript.no-match')

/** A step of {@link mapProps} / {@link mapItems}: the mapped value of `input` (typed `def`). */
type TStep<C> = (def: TAtscriptAnnotatedType, input: unknown, ctx: C) => unknown

/**
 * Maps the props of plain object `value` with `step` (props without a def — declared or pattern —
 * are kept as they are). Copy-on-first-change: allocates the output only when some prop changed,
 * else returns `value`; an own `__proto__` key stays an own key (never the output's prototype).
 * NO_MATCH when a step returns it.
 */
export function mapProps<C>(
  type: TAtscriptTypeObject<string>,
  value: Record<string, unknown>,
  step: TStep<C>,
  ctx: C
): unknown {
  const keys = Object.keys(value)
  let out: Record<string, unknown> | undefined
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const input = value[key]
    let def = type.props.get(key)
    if (!def) {
      for (const { pattern, def: patternDef } of type.propsPatterns) {
        if (pattern.test(key)) {
          def = patternDef
          break
        }
      }
    }
    const mapped = def ? step(def, input, ctx) : input
    if (mapped === NO_MATCH) {
      return NO_MATCH
    }
    if (out) {
      setOwn(out, key, mapped)
    } else if (mapped !== input) {
      out = {}
      for (let j = 0; j < i; j++) {
        setOwn(out, keys[j], value[keys[j]])
      }
      setOwn(out, key, mapped)
    }
  }
  return out ?? value
}

/**
 * Maps array / tuple items with `step`, against `of` (an array's item type) or `of[i]` (a tuple's
 * items). Copy-on-first-change, as {@link mapProps}.
 */
export function mapItems<C>(
  value: unknown[],
  of: TAtscriptAnnotatedType | TAtscriptAnnotatedType[],
  step: TStep<C>,
  ctx: C
): unknown[] {
  let out: unknown[] | undefined
  for (let i = 0; i < value.length; i++) {
    const input = value[i]
    const mapped = step(Array.isArray(of) ? of[i] : of, input, ctx)
    if (out) {
      out.push(mapped)
    } else if (mapped !== input) {
      out = value.slice(0, i)
      out.push(mapped)
    }
  }
  return out ?? value
}

/** Whether `value` is a plain object (`{}` or prototype-less): class instances are not. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value) as object | null
  return proto === Object.prototype || proto === null
}

/**
 * Sets own property `key` of `out`: `__proto__` as an own data property (an assignment would set
 * the object's prototype instead — input parsed from JSON may carry such a key).
 */
function setOwn(out: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true })
  } else {
    out[key] = value
  }
}
