import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { isPlainObject, mapItems, mapProps, NO_MATCH } from './copy-on-change'
import { applyFlags, literalNodes } from './normalize'
import type { TLiteral } from './normalize'
import { unionDiscriminator } from './validator'

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
 * - Unions pick one branch and coerce the value against it only (linear, no
 *   backtracking). A scalar branch takes what it parses; an object (tuple)
 *   branch takes a plain object (an array of its length) unless a literal
 *   property (item) — `kind: 'cat'`, `kind: 'cat' | null` — holds a value that
 *   does not coerce to it, a string compared after the normalizers of the
 *   literal and of the unions it is in. An object takes the branch its
 *   discriminator names (as the validator does: the literal itself first, else
 *   `"2"` names a `2` literal), else the first whose shape it has (required
 *   props present, no undeclared key), else the first that takes it. When no
 *   branch takes the value, it is returned untouched.
 * - Objects recurse into props when the input is a plain object (covers
 *   `@Query()` DTOs where every field arrives as a string), whatever their
 *   literal props hold unless tried as a union branch.
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
      const branch = branchOf((type as TAtscriptTypeComplex).items, value)
      return branch ? coerce(branch, value) : NO_MATCH
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

/**
 * The branch of union `items` that takes `value` (see {@link takes}): the one an object's
 * discriminator names; else, for an object, the first that takes it and whose shape it has (see
 * {@link fits}); else the first that takes it, in declared order (a partial patch); `undefined`
 * when none does.
 */
function branchOf(
  items: TAtscriptAnnotatedType[],
  value: unknown
): TAtscriptAnnotatedType | undefined {
  let first: TAtscriptAnnotatedType | undefined
  if (isPlainObject(value)) {
    const named = discriminatedBranch(items, value)
    if (named && takes(named, value)) {
      return named
    }
    for (const item of items) {
      if (takes(item, value)) {
        if (fits(item, value)) {
          return item
        }
        first ??= item
      }
    }
    return first
  }
  return items.find(item => takes(item, value))
}

/**
 * Whether object `value` has the shape of branch `def`, by its own keys alone: every required
 * prop is one of them, and each of them is a prop (or matches a prop pattern) of the branch. A
 * union: one of its branches; a branch that is not an object (nor an intersection of objects)
 * has any shape.
 */
function fits(def: TAtscriptAnnotatedType, value: Record<string, unknown>): boolean {
  if (def.type.kind === 'union') {
    return (def.type as TAtscriptTypeComplex).items.some(item => fits(item, value))
  }
  const objects: Array<TAtscriptTypeObject<string>> = []
  if (!objectsOf(def, objects)) {
    return true
  }
  for (const o of objects) {
    for (const [key, prop] of o.props) {
      if (!prop.optional && !Object.hasOwn(value, key)) {
        return false
      }
    }
  }
  return Object.keys(value).every(key =>
    objects.some(o => o.props.has(key) || o.propsPatterns.some(p => p.pattern.test(key)))
  )
}

/** Collects the objects `def` is (an object, an intersection of objects); `false` for others. */
function objectsOf(def: TAtscriptAnnotatedType, out: Array<TAtscriptTypeObject<string>>): boolean {
  const type = def.type
  if (type.kind === 'object') {
    out.push(type as TAtscriptTypeObject<string>)
    return true
  }
  return (
    type.kind === 'intersection' &&
    (type as TAtscriptTypeComplex).items.every(item => objectsOf(item, out))
  )
}

/**
 * Whether union branch `def` takes `value`: exactly when coercing `value` against it does not
 * fail (a branch taken never fails after it), decided from `value` itself — its kind, its length,
 * its direct literal props and items — never from what it holds deeper. A union takes one branch
 * once, so coercion is linear in the value.
 */
function takes(def: TAtscriptAnnotatedType, value: unknown): boolean {
  if (value === undefined || value === null) {
    return def.optional === true
  }
  const type = def.type
  switch (type.kind) {
    case '': {
      return coerce(def, value) !== NO_MATCH
    }
    case 'object': {
      if (!isPlainObject(value)) {
        return false
      }
      for (const [key, prop] of (type as TAtscriptTypeObject<string>).props) {
        if (Object.hasOwn(value, key) && !holdsLiteral(prop, value[key])) {
          return false
        }
      }
      return true
    }
    case 'array': {
      return Array.isArray(value)
    }
    case 'tuple': {
      const items = (type as TAtscriptTypeComplex).items
      return (
        Array.isArray(value) &&
        value.length === items.length &&
        items.every((item, i) => holdsLiteral(item, value[i]))
      )
    }
    case 'union': {
      return (type as TAtscriptTypeComplex).items.some(item => takes(item, value))
    }
    case 'intersection': {
      return (type as TAtscriptTypeComplex).items.every(item => takes(item, value))
    }
    default: {
      return false
    }
  }
}

/**
 * Whether prop (item) `def` of a union branch can hold `input`: anything, but a literal prop
 * (see `literalNodes`: `kind: 'cat'`, `kind: 'cat' | null`) only a value that coerces to one of
 * its literals — a string after the normalizers on the literal's way (`' Cat '` to `'cat'` with
 * `@normalize.trim @normalize.lowercase`). `null` / `undefined` are left to the validator.
 */
function holdsLiteral(def: TAtscriptAnnotatedType, input: unknown): boolean {
  if (input === undefined || input === null) {
    return true
  }
  const literals = literalNodes(def)
  return !literals || literals.some(literal => coercesTo(literal, input))
}

/** Whether `input` coerces to the value of `literal` (see `holdsLiteral`). */
function coercesTo(literal: TLiteral, input: unknown): boolean {
  const value = typeof input === 'string' ? applyFlags(input, literal.flags) : input
  return coerce(literal.node, value) !== NO_MATCH
}

/**
 * The branch of union `items` the discriminator of object `value` names: its literal itself,
 * else the one its value coerces to (`"2"` names `2`, see {@link coercesTo}); `undefined` when the
 * union has no discriminator or the value names no branch.
 */
function discriminatedBranch(
  items: TAtscriptAnnotatedType[],
  value: Record<string, unknown>
): TAtscriptAnnotatedType | undefined {
  const disc = unionDiscriminator(items)
  if (disc === undefined) {
    return undefined
  }
  const tag = Object.hasOwn(value, disc.property) ? value[disc.property] : undefined
  if (tag === undefined || tag === null) {
    return undefined
  }
  for (const [index, literal] of disc.branches) {
    if (literal === tag) {
      return items[index]
    }
  }
  for (const [index] of disc.branches) {
    const prop = (items[index].type as TAtscriptTypeObject<string>).props.get(disc.property)
    if (prop && holdsLiteral(prop, tag)) {
      return items[index]
    }
  }
  return undefined
}

/** A prop / item: its coerced value, else the value as it is (copy-on-change, see `mapProps`). */
function coerceChild(def: TAtscriptAnnotatedType, input: unknown): unknown {
  const result = coerce(def, input)
  return result === NO_MATCH ? input : result
}
