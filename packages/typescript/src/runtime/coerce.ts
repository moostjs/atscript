import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { typeWriteCount } from './compiled-check/tracking'
import { isPlainObject, mapItems, mapProps, NO_MATCH, propOf } from './copy-on-change'
import { applyFlags, flagsOf, literalNodes } from './normalize'
import { unionDiscriminator } from './validator'
import { acceptsNull } from './validator-fast-check'

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
 *   does not coerce to it (`"2"` coerces to a `2` literal), a string compared
 *   after the normalizers of the literal and of the unions it is in. A scalar
 *   takes the first branch that takes it. An object or array takes the only
 *   branch that takes it, else the one it fits best, judged in this order
 *   (never looking deeper than its own keys and items): its props (items) hold
 *   values of their kinds (a string that parses for a `number` prop, `null`
 *   where `null` is allowed); it has no undeclared key; it has every required
 *   prop (the last two can be waived by `partial` / `unknownProps`, a wrong
 *   kind cannot); a nested union's branches count as the union's own. Ties go
 *   to the branch an object's discriminator names by the literal itself, then
 *   to declared order. When no branch takes the value, it is returned
 *   untouched.
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
 * The score bits of a union branch for an object (array), most weighty first (see {@link score} and
 * {@link coerceForType}): props (items) hold their kinds; no undeclared key; required props present.
 */
const HOLDS = 4
const DECLARED = 2
const COMPLETE = 1
const BEST = HOLDS | DECLARED | COMPLETE
/** The score of a branch not scored yet (the only taker so far, see {@link TPick}). */
const UNSCORED = -1

/**
 * The branch of union `items` that takes `value` (see {@link takes}); `undefined` when none does.
 * A scalar: the first taker. An object or array: of the leaf branches (see {@link leavesOf}), the
 * only taker, else the best scored one (see {@link score}); the branch the discriminator names is
 * tried first, then declared order, and a tie keeps the earlier one.
 */
function branchOf(
  items: TAtscriptAnnotatedType[],
  value: unknown
): TAtscriptAnnotatedType | undefined {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return items.find(item => takes(item, value))
  }
  const leaves = leavesOf(items)
  const pick: TPick = { branch: undefined, score: UNSCORED, keys: undefined, values: undefined }
  const named = Array.isArray(value) ? undefined : discriminatedBranch(leaves, value)
  if (named) {
    consider(named, value, pick)
  }
  for (const leaf of leaves) {
    if (pick.score === BEST) {
      break
    }
    if (leaf !== named) {
      consider(leaf, value, pick)
    }
  }
  return pick.branch
}

/** {@link leavesOf} by union items: valid until the next type tree write (see `typeWriteCount`). */
let leavesCache = new WeakMap<TAtscriptAnnotatedType[], TAtscriptAnnotatedType[]>()
let leavesStamp = -1

/**
 * The branches of union `items` that are not unions, a nested union's in its place, in declared
 * order, so `(A | B) | C` and `A | B | C` rank alike: `items` itself when none is a union, else
 * the same array for the same items (the discriminator over them is decided once).
 */
function leavesOf(items: TAtscriptAnnotatedType[]): TAtscriptAnnotatedType[] {
  if (!items.some(isUnion)) {
    return items
  }
  const writes = typeWriteCount()
  if (writes !== leavesStamp) {
    leavesStamp = writes
    leavesCache = new WeakMap()
  }
  let leaves = leavesCache.get(items)
  if (!leaves) {
    leaves = []
    collectLeaves(items, leaves)
    leavesCache.set(items, leaves)
  }
  return leaves
}

function isUnion(def: TAtscriptAnnotatedType): boolean {
  return def.type.kind === 'union'
}

function collectLeaves(items: TAtscriptAnnotatedType[], out: TAtscriptAnnotatedType[]): void {
  for (const item of items) {
    if (isUnion(item)) {
      collectLeaves((item.type as TAtscriptTypeComplex).items, out)
    } else {
      out.push(item)
    }
  }
}

/**
 * The best taker {@link branchOf} has found so far, its score (`UNSCORED`: the only one yet), and
 * the value's own keys and their values (read once for every branch scored: a large object's are
 * costly to list and to look up).
 */
interface TPick {
  branch: TAtscriptAnnotatedType | undefined
  score: number
  keys: string[] | undefined
  values: unknown[] | undefined
}

/** Takes leaf branch `def` for `pick` when it takes `value` and scores above the best so far. */
function consider(
  def: TAtscriptAnnotatedType,
  value: Record<string, unknown> | unknown[],
  pick: TPick
): void {
  if (!takes(def, value)) {
    return
  }
  if (!pick.branch) {
    // (the only taker needs no score)
    pick.branch = def
    return
  }
  if (pick.score === UNSCORED) {
    pick.score = score(pick.branch, value, pick)
    if (pick.score === BEST) {
      return
    }
  }
  const s = score(def, value, pick)
  if (s > pick.score) {
    pick.branch = def
    pick.score = s
  }
}

/**
 * The bits (see {@link HOLDS}) leaf branch `def`, which takes object (array) `value`, scores; once
 * it cannot beat `pick.score`, any score not above it. Only an object branch can miss
 * {@link DECLARED} or {@link COMPLETE}.
 */
function score(
  def: TAtscriptAnnotatedType,
  value: Record<string, unknown> | unknown[],
  pick: TPick
): number {
  const objects: Array<TAtscriptTypeObject<string>> = []
  if (Array.isArray(value) || !objectsOf(def, objects)) {
    return (holdsAll(def, value) ? HOLDS : 0) | DECLARED | COMPLETE
  }
  // (one pass over the keys; the bits are only ever cleared, so it stops once `floor` is out of reach)
  const floor = pick.score
  let bits = BEST
  const keys = (pick.keys ??= Object.keys(value))
  const values = (pick.values ??= keys.map(key => value[key]))
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    let declared = false
    for (const o of objects) {
      const prop = propOf(o, key)
      if (prop) {
        declared = true
        if (bits & HOLDS && !holds(prop, values[i])) {
          bits &= ~HOLDS
        }
      }
    }
    if (!declared) {
      bits &= ~DECLARED
    }
    if (bits <= floor) {
      return bits
    }
    if (bits <= COMPLETE) {
      // (HOLDS and DECLARED both lost: only COMPLETE is left to decide)
      break
    }
  }
  for (const o of objects) {
    for (const [key, prop] of o.props) {
      if (!prop.optional && !Object.hasOwn(value, key)) {
        return bits & ~COMPLETE
      }
    }
  }
  return bits
}

/**
 * Whether each prop (pattern prop) of branch `def` that object `value` has, or each item of array
 * `value`, holds a value of its kind (see {@link holds}). Looks at `value`'s own keys and items
 * only. `def` takes `value` (see {@link takes}).
 */
function holdsAll(
  def: TAtscriptAnnotatedType,
  value: Record<string, unknown> | unknown[]
): boolean {
  const type = def.type
  switch (type.kind) {
    case 'object': {
      const o = type as TAtscriptTypeObject<string>
      const record = value as Record<string, unknown>
      return Object.keys(record).every(key => {
        const prop = propOf(o, key)
        return !prop || holds(prop, record[key])
      })
    }
    case 'array': {
      const of = (type as TAtscriptTypeArray).of
      return (value as unknown[]).every(item => holds(of, item))
    }
    case 'tuple': {
      const items = (type as TAtscriptTypeComplex).items
      return items.every((item, i) => holds(item, (value as unknown[])[i]))
    }
    case 'union': {
      return (type as TAtscriptTypeComplex).items.some(
        item => takes(item, value) && holdsAll(item, value)
      )
    }
    case 'intersection': {
      return (type as TAtscriptTypeComplex).items.every(item => holdsAll(item, value))
    }
    default: {
      return true
    }
  }
}

/**
 * Whether `input` is of the kind of prop (item) `def`, never looking inside it: a scalar that
 * coerces to the prop's scalar type, or to one of its literals (a string after the normalizers on
 * the literal's way, see `literalNodes`); a plain object for an object, an array for an array (of
 * the tuple's length); `null` where the prop takes `null` (optional or a nullable type).
 * `inherited`: the normalizer flags of the unions `def` is in.
 */
function holds(def: TAtscriptAnnotatedType, input: unknown, inherited = 0): boolean {
  if (input === undefined) {
    return true
  }
  if (input === null) {
    return def.optional === true || acceptsNull(def)
  }
  const type = def.type
  switch (type.kind) {
    case '': {
      const final = type as TAtscriptTypeFinal
      return final.value === undefined
        ? scalar(final.designType, input) !== NO_MATCH
        : coercesTo(def, flagsOf(def, inherited), input)
    }
    case 'object': {
      return isPlainObject(input)
    }
    case 'array': {
      return Array.isArray(input)
    }
    case 'tuple': {
      return Array.isArray(input) && input.length === (type as TAtscriptTypeComplex).items.length
    }
    case 'union': {
      const flags = flagsOf(def, inherited)
      return (type as TAtscriptTypeComplex).items.some(item => holds(item, input, flags))
    }
    case 'intersection': {
      const flags = flagsOf(def, inherited)
      return (type as TAtscriptTypeComplex).items.every(item => holds(item, input, flags))
    }
    default: {
      return false
    }
  }
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
        if (mayBeLiteral(prop) && Object.hasOwn(value, key) && !holdsLiteral(prop, value[key])) {
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

/** Whether `def` can be a literal prop (see `literalNodes`): a literal or a union. */
function mayBeLiteral(def: TAtscriptAnnotatedType): boolean {
  const type = def.type
  return type.kind === '' ? (type as TAtscriptTypeFinal).value !== undefined : type.kind === 'union'
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
  return !literals || literals.some(literal => coercesTo(literal.node, literal.flags, input))
}

/**
 * Whether `input` coerces to the value of literal `node`, a string after normalizer `flags` (see
 * `holdsLiteral`).
 */
function coercesTo(node: TAtscriptAnnotatedType, flags: number, input: unknown): boolean {
  const value = typeof input === 'string' ? applyFlags(input, flags) : input
  return coerce(node, value) !== NO_MATCH
}

/**
 * The branch of union `items` whose discriminator literal is exactly the one object `value` holds
 * (`"1"` names a `'1'` literal, not a `1`, though it makes a `1` branch a taker, see {@link takes});
 * `undefined` when the union has no discriminator or no branch's literal is that value.
 */
function discriminatedBranch(
  items: TAtscriptAnnotatedType[],
  value: Record<string, unknown>
): TAtscriptAnnotatedType | undefined {
  const disc = unionDiscriminator(items)
  if (disc === undefined || !Object.hasOwn(value, disc.property)) {
    return undefined
  }
  const tag = value[disc.property]
  for (const [index, literal] of disc.branches) {
    if (literal === tag) {
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
