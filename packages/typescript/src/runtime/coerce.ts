import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { isPlainObject, mapItems, mapProps, NO_MATCH } from './copy-on-change'

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
  // Direct switch (not `forAnnotatedType`) — avoids allocating a handler-closure
  // object on every node visit of this per-request path.
  const type = def.type
  switch (type.kind) {
    case '': {
      const final = type as TAtscriptTypeFinal
      if (final.designType === 'phantom') {
        return value
      }
      const result = scalar(final.designType, value)
      // Literal types: the parsed value must equal the literal for a union
      // branch to claim it (e.g. `'a' | 7` with input "7" must pick the 7 branch).
      if (result !== NO_MATCH && final.value !== undefined && result !== final.value) {
        return NO_MATCH
      }
      return result
    }
    case 'object': {
      if (!isPlainObject(value)) {
        return NO_MATCH
      }
      return mapProps(type as TAtscriptTypeObject<string>, value, coerceChild, undefined)
    }
    case 'array': {
      return Array.isArray(value)
        ? mapItems(value, (type as TAtscriptTypeArray).of, coerceChild, undefined)
        : NO_MATCH
    }
    case 'tuple': {
      const items = (type as TAtscriptTypeComplex).items
      return Array.isArray(value) && value.length === items.length
        ? mapItems(value, items, coerceChild, undefined)
        : NO_MATCH
    }
    case 'union': {
      for (const item of (type as TAtscriptTypeComplex).items) {
        const result = coerce(item, value)
        if (result !== NO_MATCH) {
          return result
        }
      }
      return NO_MATCH
    }
    case 'intersection': {
      let current: unknown = value
      for (const item of (type as TAtscriptTypeComplex).items) {
        const result = coerce(item, current)
        if (result === NO_MATCH) {
          return NO_MATCH
        }
        current = result
      }
      return current
    }
    default: {
      throw new Error(`Unknown type kind "${(type as { kind: string }).kind}"`)
    }
  }
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

/** A prop / item: its coerced value, else the value as it is (copy-on-change, see `mapProps`). */
function coerceChild(def: TAtscriptAnnotatedType, input: unknown): unknown {
  const result = coerce(def, input)
  return result === NO_MATCH ? input : result
}
