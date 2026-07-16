import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { forAnnotatedType } from './traverse'

/**
 * Internal sentinel returned when a value cannot be coerced to a type node.
 * Drives union branch selection without allocating per-node result objects.
 */
const NO_MATCH = Symbol('atscript.coerce.no-match')

/**
 * Coerces string-transport input (route params, query strings) toward the
 * scalar shapes an annotated type expects.
 *
 * Pure and non-throwing: when a value can't be coerced it is returned
 * untouched, leaving the {@link Validator} to report the proper error.
 * Coercion converts representation only — constraint checks (`@expect.int`,
 * `@expect.min`, patterns) remain the validator's job.
 *
 * Rules:
 * - Strings targeting `number` are trimmed and parsed via `Number()`; only
 *   finite results are accepted.
 * - Strings targeting `boolean` accept `"true"/"1"` and `"false"/"0"`.
 * - Unions try each branch in declared order; the first successful parse wins.
 * - Objects recurse into props when the input is a plain object (covers
 *   `@Query()` DTOs where every field arrives as a string).
 * - Arrays and tuples coerce items; intersections apply each member in order.
 * - `string` / `decimal` targets never change string input.
 *
 * @example
 * ```ts
 * coerceForType(KafkaOffset, '42') // → 42
 * coerceForType(KafkaOffset, 'abc') // → 'abc' (validator reports the error)
 * ```
 */
export function coerceForType(def: TAtscriptAnnotatedType, value: unknown): unknown {
  const result = coerce(def, value)
  return result === NO_MATCH ? value : result
}

/**
 * Coerces a single scalar value toward a design type, using the same rules
 * as {@link coerceForType}. Returns the input untouched when it can't coerce.
 * Useful when only a design type is known (e.g. `design:paramtypes` fallbacks).
 */
export function coerceScalar(
  designType: TAtscriptTypeFinal['designType'],
  value: unknown
): unknown {
  const result = scalar(designType, value)
  return result === NO_MATCH ? value : result
}

/** Returns the coerced value, or NO_MATCH when the value can't fit this node. */
function coerce(def: TAtscriptAnnotatedType, value: unknown): unknown {
  if (value === undefined || value === null) {
    return def.optional === true ? value : NO_MATCH
  }
  return forAnnotatedType<unknown>(def, {
    final: d => {
      const result = scalar(d.type.designType, value)
      // Literal types: the parsed value must equal the literal for a union
      // branch to claim it (e.g. `'a' | 7` with input "7" must pick the 7 branch).
      if (result !== NO_MATCH && d.type.value !== undefined && result !== d.type.value) {
        return NO_MATCH
      }
      return result
    },
    phantom: () => value,
    object: d => {
      if (!isPlainObject(value)) {
        return NO_MATCH
      }
      return coerceProps(d, value)
    },
    array: d => (Array.isArray(value) ? coerceItems(value, d.type.of) : NO_MATCH),
    tuple: d =>
      Array.isArray(value) && value.length === d.type.items.length
        ? coerceItems(value, undefined, d.type.items)
        : NO_MATCH,
    union: d => {
      for (const item of d.type.items) {
        const result = coerce(item, value)
        if (result !== NO_MATCH) {
          return result
        }
      }
      return NO_MATCH
    },
    intersection: d => {
      let current = value
      for (const item of d.type.items) {
        const result = coerce(item, current)
        if (result === NO_MATCH) {
          return NO_MATCH
        }
        current = result
      }
      return current
    },
  })
}

function scalar(designType: TAtscriptTypeFinal['designType'], value: unknown): unknown {
  switch (designType) {
    case 'string':
    case 'decimal': {
      return typeof value === 'string' ? value : NO_MATCH
    }
    case 'number': {
      if (typeof value === 'number') {
        return value
      }
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.length > 0) {
          const parsed = Number(trimmed)
          if (Number.isFinite(parsed)) {
            return parsed
          }
        }
      }
      return NO_MATCH
    }
    case 'boolean': {
      if (typeof value === 'boolean') {
        return value
      }
      if (value === 'true' || value === '1') {
        return true
      }
      if (value === 'false' || value === '0') {
        return false
      }
      return NO_MATCH
    }
    case 'object': {
      return typeof value === 'object' ? value : NO_MATCH
    }
    case 'any':
    case 'phantom': {
      return value
    }
    default: {
      // 'undefined' | 'null' handled by the null-ish guard; 'never' can't match
      return NO_MATCH
    }
  }
}

/**
 * Coerces the props of a plain object. Copy-on-first-change: allocates the
 * output object only when some prop actually coerced, else returns the input.
 */
function coerceProps(
  def: TAtscriptAnnotatedType<TAtscriptTypeObject<string>>,
  value: Record<string, unknown>
): unknown {
  const keys = Object.keys(value)
  let out: Record<string, unknown> | undefined
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const input = value[key]
    let propDef = def.type.props.get(key)
    if (!propDef) {
      for (const { pattern, def: patternDef } of def.type.propsPatterns) {
        if (pattern.test(key)) {
          propDef = patternDef
          break
        }
      }
    }
    let coerced = input
    if (propDef) {
      const result = coerce(propDef, input)
      if (result !== NO_MATCH) {
        coerced = result
      }
    }
    if (out) {
      out[key] = coerced
    } else if (coerced !== input) {
      out = {}
      for (let j = 0; j < i; j++) {
        out[keys[j]] = value[keys[j]]
      }
      out[key] = coerced
    }
  }
  return out ?? value
}

/**
 * Coerces array/tuple items against `of` (arrays) or `items[i]` (tuples).
 * Copy-on-first-change, same as {@link coerceProps}.
 */
function coerceItems(
  value: unknown[],
  of: TAtscriptAnnotatedType | undefined,
  items?: TAtscriptAnnotatedType[]
): unknown {
  let out: unknown[] | undefined
  for (let i = 0; i < value.length; i++) {
    const input = value[i]
    const result = coerce(of ?? items![i], input)
    const coerced = result === NO_MATCH ? input : result
    if (out) {
      out.push(coerced)
    } else if (coerced !== input) {
      out = value.slice(0, i)
      out.push(coerced)
    }
  }
  return out ?? value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value) as object | null
  return proto === Object.prototype || proto === null
}
