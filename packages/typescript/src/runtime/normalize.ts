import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { currentEpoch, metadataWriteCount } from './compiled-check/tracking'
import { isPlainObject, mapItems, mapProps, NO_MATCH } from './copy-on-change'
import { metaEmpty } from './layers'
import { unionDiscriminator, Validator } from './validator'

const TRIM = 1
const LOWERCASE = 2
const UPPERCASE = 4

/**
 * Whether each node's subtree has normalizers: valid until the next metadata write or
 * `invalidateCompiledValidators()` (checked by {@link normalizeForType}).
 */
let reach = new WeakMap<TAtscriptAnnotatedType, boolean>()
let stampWrites = -1
let stampEpoch = -1

/**
 * Normalizes input toward the string forms an annotated type declares with `@normalize.trim`,
 * `@normalize.lowercase` and `@normalize.uppercase`.
 *
 * Pure: returns a normalized copy (copy-on-change: untouched objects and arrays are returned as
 * they are) and never mutates `value`. It never validates — run the validator on the result —
 * and does not throw on ordinary input (a cyclic value overflows the stack, as it does in the
 * validator). Only strings change: a string node's normalizers (its own, a type alias's it
 * inherits, a union's it belongs to) apply in a fixed order: trim, then lowercase, then
 * uppercase. Other values (including class instances such as `Date`) and strings without
 * normalizers are returned untouched; a type without normalizers returns `value` at once.
 *
 * Walks plain objects (props and pattern props; unknown keys are kept as they are), arrays,
 * tuples, intersections and unions. An object whose literal prop (`kind: 'cat'`) holds another
 * value is left as it is. A union normalizes a value only when the result does not depend on
 * which branch takes it:
 * - an object union with a discriminator (a literal prop every object branch requires, see
 *   `detectDiscriminator`) uses the branch the value's discriminator names;
 * - otherwise every branch that can take the value is tried (a literal branch can take a string
 *   only when the normalized string equals its literal): when they all give the same result it
 *   is used; when they differ, the branches whose result their own validator accepts (default
 *   options) are kept, and the result is used when they agree; else the value is returned
 *   untouched (ambiguous).
 *
 * The intended flow is `coerceForType` → `normalizeForType` → `validate`.
 *
 * @example
 * ```ts
 * // @normalize.trim @normalize.lowercase email: string.email
 * normalizeForType(User, { email: '  Ann@Example.COM ' }) // → { email: 'ann@example.com' }
 * ```
 */
export function normalizeForType<T = unknown>(def: TAtscriptAnnotatedType, value: T): T {
  const writes = metadataWriteCount()
  const epoch = currentEpoch()
  if (writes !== stampWrites || epoch !== stampEpoch) {
    stampWrites = writes
    stampEpoch = epoch
    reach = new WeakMap()
  }
  if (!hasNormalizers(def)) {
    return value
  }
  const result = normalize(def, value, 0, new Map())
  return (result === NO_MATCH ? value : result) as T
}

/**
 * Per-call results of objects and unions by input object, type def and union flags (see
 * {@link normalize}).
 */
type TMemo = Map<object, TMemoEntry[]>
type TMemoEntry = [type: object, flags: number, result: unknown]

// ── Which types have normalizers ────────────────────────────────────────────────────────────

/** The nodes `def`'s value walk can enter (props, pattern props, items, elements). */
function childrenOf(def: TAtscriptAnnotatedType): TAtscriptAnnotatedType[] {
  const type = def.type
  switch (type.kind) {
    case 'object': {
      const t = type as TAtscriptTypeObject<string>
      const out = [...t.props.values()]
      for (const p of t.propsPatterns) {
        out.push(p.def)
      }
      return out
    }
    case 'array': {
      return [(type as TAtscriptTypeArray).of]
    }
    case 'union':
    case 'intersection':
    case 'tuple': {
      return (type as TAtscriptTypeComplex).items
    }
    default: {
      return []
    }
  }
}

/**
 * Whether `def` or a node its walk reaches has normalizers. Answers (and caches) every node
 * reached, recursive types included: collects the reached nodes with their parents, then marks
 * the nodes with normalizers and, back along the parents, every node that reaches one.
 */
function hasNormalizers(def: TAtscriptAnnotatedType): boolean {
  const known = reach.get(def)
  if (known !== undefined) {
    return known
  }
  const parents = new Map<TAtscriptAnnotatedType, TAtscriptAnnotatedType[]>([[def, []]])
  const marked: TAtscriptAnnotatedType[] = []
  const todo = [def]
  while (todo.length > 0) {
    const node = todo.pop()!
    if (flagsOf(node, 0) !== 0) {
      marked.push(node)
    }
    for (const child of childrenOf(node)) {
      const cached = reach.get(child)
      if (cached !== undefined) {
        if (cached) {
          marked.push(node)
        }
        continue
      }
      let of = parents.get(child)
      if (!of) {
        parents.set(child, (of = []))
        todo.push(child)
      }
      of.push(node)
    }
  }
  for (const node of parents.keys()) {
    reach.set(node, false)
  }
  while (marked.length > 0) {
    const node = marked.pop()!
    if (!reach.get(node)) {
      reach.set(node, true)
      marked.push(...parents.get(node)!)
    }
  }
  return reach.get(def)!
}

// ── The walk ───────────────────────────────────────────────────────────────────────────────

/** The normalizer flags of `def`, on top of `inherited` (a union's, for its branches). */
function flagsOf(def: TAtscriptAnnotatedType, inherited: number): number {
  const meta = def.metadata
  if (metaEmpty(meta)) {
    return inherited
  }
  let flags = inherited
  if (meta.get('normalize.trim')) {
    flags |= TRIM
  }
  if (meta.get('normalize.lowercase')) {
    flags |= LOWERCASE
  }
  if (meta.get('normalize.uppercase')) {
    flags |= UPPERCASE
  }
  return flags
}

function applyFlags(value: string, flags: number): string {
  let out = value
  if (flags & TRIM) {
    out = out.trim()
  }
  if (flags & LOWERCASE) {
    out = out.toLowerCase()
  }
  if (flags & UPPERCASE) {
    out = out.toUpperCase()
  }
  return out
}

/**
 * The normalized value, or NO_MATCH when `def` cannot take it (its kind does not fit the value).
 * `inherited`: the normalizer flags of the unions / intersections `def` is a member of.
 *
 * Objects and unions are memoized per call by input object: a recursive union without a
 * discriminator is tried for every branch at every level, which without it is exponential in
 * the depth of the value.
 */
function normalize(
  def: TAtscriptAnnotatedType,
  value: unknown,
  inherited: number,
  memo: TMemo
): unknown {
  if (value === undefined || value === null) {
    return value
  }
  // (nothing to normalize below: only whether it takes the value)
  if (inherited === 0 && !hasNormalizers(def)) {
    return takes(def, value) ? value : NO_MATCH
  }
  const type = def.type
  switch (type.kind) {
    case '': {
      const out =
        typeof value === 'string' && (type as TAtscriptTypeFinal).designType === 'string'
          ? applyFlags(value, flagsOf(def, inherited))
          : value
      // (a literal takes only its own value: picks the branch of `'a' | 'b'`)
      return takes(def, out) ? out : NO_MATCH
    }
    case 'object': {
      if (!isPlainObject(value)) {
        return NO_MATCH
      }
      const entries = entriesOf(memo, value)
      return (
        recall(entries, type, 0) ??
        remember(
          entries,
          type,
          0,
          mapProps(type as TAtscriptTypeObject<string>, value, normalizeProp, memo)
        )
      )
    }
    case 'array': {
      return Array.isArray(value)
        ? mapItems(value, (type as TAtscriptTypeArray).of, normalizeItem, memo)
        : NO_MATCH
    }
    case 'tuple': {
      const items = (type as TAtscriptTypeComplex).items
      return Array.isArray(value) && value.length === items.length
        ? mapItems(value, items, normalizeItem, memo)
        : NO_MATCH
    }
    case 'union': {
      const flags = flagsOf(def, inherited)
      const items = (type as TAtscriptTypeComplex).items
      if (typeof value !== 'object') {
        return normalizeUnion(items, value, flags, memo)
      }
      const entries = entriesOf(memo, value)
      return (
        recall(entries, type, flags) ??
        remember(entries, type, flags, normalizeUnion(items, value, flags, memo))
      )
    }
    case 'intersection': {
      const flags = flagsOf(def, inherited)
      let current: unknown = value
      for (const item of (type as TAtscriptTypeComplex).items) {
        const result = normalize(item, current, flags, memo)
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

/** The memoized results for input object `value` (see {@link normalize}). */
function entriesOf(memo: TMemo, value: object): TMemoEntry[] {
  let entries = memo.get(value)
  if (!entries) {
    entries = []
    memo.set(value, entries)
  }
  return entries
}

/** The memoized result for `type` and `flags`, `undefined` when none. */
function recall(entries: TMemoEntry[], type: object, flags: number): unknown {
  for (const [t, f, result] of entries) {
    if (t === type && f === flags) {
      return result
    }
  }
  return undefined
}

/** Memoizes `result` for `type` and `flags` and returns it. */
function remember(entries: TMemoEntry[], type: object, flags: number, result: unknown): unknown {
  entries.push([type, flags, result])
  return result
}

/** An array / tuple item: its normalized value, else the value as it is. */
function normalizeItem(def: TAtscriptAnnotatedType, input: unknown, memo: TMemo): unknown {
  if (!hasNormalizers(def)) {
    return input
  }
  const result = normalize(def, input, 0, memo)
  return result === NO_MATCH ? input : result
}

/**
 * A prop: as {@link normalizeItem}, but NO_MATCH (the object is not this type) when a literal prop
 * (`kind: 'cat'`) holds another value.
 */
function normalizeProp(def: TAtscriptAnnotatedType, input: unknown, memo: TMemo): unknown {
  const out = normalizeItem(def, input, memo)
  if (
    out === input &&
    def.type.kind === '' &&
    (def.type as TAtscriptTypeFinal).value !== undefined &&
    input !== (def.type as TAtscriptTypeFinal).value &&
    input !== undefined &&
    input !== null
  ) {
    return NO_MATCH
  }
  return out
}

/** Whether `def` can take `value` by its kind alone (see {@link normalize}). */
function takes(def: TAtscriptAnnotatedType, value: unknown): boolean {
  const type = def.type
  switch (type.kind) {
    case '': {
      const final = type as TAtscriptTypeFinal
      switch (final.designType) {
        case 'string':
        case 'number':
        case 'boolean': {
          return (
            typeof value === final.designType &&
            (final.value === undefined || value === final.value)
          )
        }
        case 'decimal': {
          return typeof value === 'string'
        }
        case 'object': {
          return typeof value === 'object'
        }
        case 'any':
        case 'phantom': {
          return true
        }
        default: {
          return false
        }
      }
    }
    case 'object': {
      return isPlainObject(value)
    }
    case 'array': {
      return Array.isArray(value)
    }
    case 'tuple': {
      return Array.isArray(value) && value.length === (type as TAtscriptTypeComplex).items.length
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
 * A union: the branch a discriminator names, else the one result every branch that can take
 * the value agrees on — or, when they differ, the one result of the branches whose validator
 * accepts their result (NO_MATCH when none can take the value or it stays ambiguous).
 */
function normalizeUnion(
  items: TAtscriptAnnotatedType[],
  value: unknown,
  flags: number,
  memo: TMemo
): unknown {
  if (isPlainObject(value)) {
    const disc = unionDiscriminator(items)
    if (disc) {
      const tag = value[disc.property]
      for (const [index, literal] of disc.branches) {
        if (literal === tag) {
          return normalize(items[index], value, flags, memo)
        }
      }
    }
  }
  let first: unknown = NO_MATCH
  let firstItem: TAtscriptAnnotatedType | undefined
  let rest: Array<[TAtscriptAnnotatedType, unknown]> | undefined
  for (const item of items) {
    const out = normalize(item, value, flags, memo)
    if (out === NO_MATCH) {
      continue
    }
    if (first === NO_MATCH) {
      first = out
      firstItem = item
    } else {
      ;(rest ??= []).push([item, out])
    }
  }
  if (!rest || rest.every(([, out]) => sameValue(out, first))) {
    return first
  }
  // The branches disagree: those whose own validator accepts their result decide.
  rest.unshift([firstItem!, first])
  let accepted: unknown = NO_MATCH
  for (const [item, out] of rest) {
    if (!branchValidator(item).validate(out, true)) {
      continue
    }
    if (accepted === NO_MATCH) {
      accepted = out
    } else if (!sameValue(accepted, out)) {
      return NO_MATCH
    }
  }
  return accepted
}

/**
 * Each union branch's validator (default options; one error is enough to reject a result),
 * judging its own normalized result.
 */
const branchValidators = new WeakMap<TAtscriptAnnotatedType, Validator<TAtscriptAnnotatedType>>()

function branchValidator(def: TAtscriptAnnotatedType): Validator<TAtscriptAnnotatedType> {
  let validator = branchValidators.get(def)
  if (!validator) {
    validator = new Validator(def, { errorLimit: 1 })
    branchValidators.set(def, validator)
  }
  return validator
}

/** Whether two results of the same input are equal (shared, untouched parts are identical). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
    )
  }
  return false
}
