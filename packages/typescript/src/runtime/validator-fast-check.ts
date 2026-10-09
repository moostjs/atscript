import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { isPhantomType } from './annotated-type'
import type { TValidatorOptions } from './validator'

/**
 * Allocation-free boolean pre-check used by {@link Validator.validate} before the
 * error-collecting walk.
 *
 * It reads the type tree and metadata LIVE on every call (nothing derived from the
 * type is cached), so `annotate()` / `metadata.set()` / prop mutations made after a
 * validator was created are always honoured — the same as the full walk.
 *
 * Result contract (relative to the full walk over the same node and value):
 * - `PASS` — the walk returns `true`, collects no errors and has no side effects.
 * - `FAIL` — the walk returns `false`; every node the walk would visit was visited
 *   here too (so a walk that would throw makes this throw first) and the walk has
 *   no side effects for this node.
 * - `BAIL` — not decidable here; the caller must run the full walk.
 *
 * Union branches are tried in declared order, continuing past `FAIL` and stopping
 * at `BAIL`, which keeps union results identical to the walk.
 */
const FAIL = 0
const PASS = 1
const BAIL = 2

/** Node is at walk depth 0 (only object props / array & tuple items increase depth). */
const TOP = 1
/** Node is inside a union branch — failures must be exhaustive (see contract). */
const IN_UNION = 2

/**
 * `true` only when the full walk over `value` is guaranteed to pass with no errors
 * and no side effects. Any other outcome (including a throw) means "run the walk".
 */
export function fastCheckPasses(
  def: TAtscriptAnnotatedType,
  value: unknown,
  opts: TValidatorOptions
): boolean {
  try {
    return fastCheck(def, value, TOP, opts) === PASS
  } catch {
    // Let the walk reproduce (or not) the failure with its own semantics.
    return false
  }
}

export const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/

const regexCache = new Map<string, Map<string, RegExp>>()

/** Compiled `@expect.pattern` regex, cached per (pattern, flags). */
export function getRegex(pattern: string, flags?: string): RegExp {
  let byFlags = regexCache.get(pattern)
  if (!byFlags) {
    byFlags = new Map()
    regexCache.set(pattern, byFlags)
  }
  const flagsKey = flags || ''
  let regex = byFlags.get(flagsKey)
  if (!regex) {
    regex = new RegExp(pattern, flags)
    byFlags.set(flagsKey, regex)
  }
  return regex
}

function fastCheck(
  def: TAtscriptAnnotatedType,
  value: any,
  flags: number,
  opts: TValidatorOptions
): number {
  if (def.optional && (value === undefined || value === null)) {
    return PASS
  }
  const type = def.type
  switch (type.kind) {
    case '': {
      return fastCheckFinal(def as TAtscriptAnnotatedType<TAtscriptTypeFinal>, value)
    }
    case 'object': {
      return fastCheckObject(def as TAtscriptAnnotatedType<TAtscriptTypeObject>, value, flags, opts)
    }
    case 'array': {
      return fastCheckArray(def as TAtscriptAnnotatedType<TAtscriptTypeArray>, value, flags, opts)
    }
    case 'union': {
      const branchFlags = flags | IN_UNION
      for (const item of (type as TAtscriptTypeComplex).items) {
        const result = fastCheck(item, value, branchFlags, opts)
        if (result !== FAIL) {
          return result
        }
      }
      return FAIL
    }
    case 'intersection': {
      // The walk stops at the first failing member.
      for (const item of (type as TAtscriptTypeComplex).items) {
        const result = fastCheck(item, value, flags, opts)
        if (result !== PASS) {
          return result
        }
      }
      return PASS
    }
    case 'tuple': {
      const items = (type as TAtscriptTypeComplex).items
      if (!Array.isArray(value) || value.length !== items.length) {
        return FAIL
      }
      // The walk stops at the first failing item.
      const itemFlags = flags & IN_UNION
      for (let i = 0; i < items.length; i++) {
        const result = fastCheck(items[i], value[i], itemFlags, opts)
        if (result !== PASS) {
          return result
        }
      }
      return PASS
    }
    default: {
      // Unknown kind — the walk throws.
      return BAIL
    }
  }
}

function fastCheckFinal(def: TAtscriptAnnotatedType<TAtscriptTypeFinal>, value: any): number {
  const type = def.type
  const designType = type.designType
  if (designType === 'phantom') {
    return PASS
  }
  if (type.value !== undefined) {
    return value === type.value ? PASS : FAIL
  }
  switch (designType) {
    case 'string': {
      return typeof value === 'string' ? fastCheckString(def, value) : FAIL
    }
    case 'number': {
      return typeof value === 'number' && Number.isFinite(value)
        ? fastCheckNumber(def, value)
        : FAIL
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        return FAIL
      }
      if (def.metadata.size === 0) {
        return PASS
      }
      return def.metadata.get('meta.required') && value !== true ? FAIL : PASS
    }
    case 'any': {
      return PASS
    }
    case 'never': {
      return FAIL
    }
    case 'undefined': {
      return value === undefined ? PASS : FAIL
    }
    case 'null': {
      return value === null ? PASS : FAIL
    }
    case 'decimal': {
      return typeof value === 'string' && DECIMAL_RE.test(value) ? PASS : FAIL
    }
    default: {
      // Unknown design type — the walk throws.
      return BAIL
    }
  }
}

// Constraint checks below mirror Validator.validateString / validateNumber / validateArray
// exactly (same order, same presence tests) so a failure stops at the same check.

function fastCheckString(def: TAtscriptAnnotatedType<TAtscriptTypeFinal>, value: string): number {
  const metadata = def.metadata
  if (metadata.size === 0) {
    return PASS
  }
  const filled = metadata.get('meta.required')
  if (filled && value.trim().length === 0) {
    return FAIL
  }
  const minLength = metadata.get('expect.minLength')
  if (
    minLength !== undefined &&
    value.length < (typeof minLength === 'number' ? minLength : minLength.length)
  ) {
    return FAIL
  }
  const maxLength = metadata.get('expect.maxLength')
  if (
    maxLength !== undefined &&
    value.length > (typeof maxLength === 'number' ? maxLength : maxLength.length)
  ) {
    return FAIL
  }
  const patterns = metadata.get('expect.pattern')
  if (patterns) {
    for (const { pattern, flags } of patterns) {
      if (!pattern) {
        continue
      }
      const regex = getRegex(pattern, flags)
      if (regex.global || regex.sticky) {
        // Stateful (`lastIndex`) regexes: testing here would shift the walk's result.
        return BAIL
      }
      if (!regex.test(value)) {
        return FAIL
      }
    }
  }
  return PASS
}

function fastCheckNumber(def: TAtscriptAnnotatedType<TAtscriptTypeFinal>, value: number): number {
  const metadata = def.metadata
  if (metadata.size === 0) {
    return PASS
  }
  const int = metadata.get('expect.int')
  if (int && value % 1 !== 0) {
    return FAIL
  }
  const min = metadata.get('expect.min')
  if (min !== undefined && value < (typeof min === 'number' ? min : min.minValue)) {
    return FAIL
  }
  const max = metadata.get('expect.max')
  if (max !== undefined && value > (typeof max === 'number' ? max : max.maxValue)) {
    return FAIL
  }
  return PASS
}

function fastCheckObject(
  def: TAtscriptAnnotatedType<TAtscriptTypeObject>,
  value: any,
  flags: number,
  opts: TValidatorOptions
): number {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return FAIL
  }
  const type = def.type
  if (type.propsPatterns.length > 0) {
    return BAIL
  }
  const partial = opts.partial
  const skipUndefined = partial === 'deep' || (partial === true && (flags & TOP) !== 0)
  const inUnion = (flags & IN_UNION) !== 0
  const propFlags = flags & IN_UNION
  let result = PASS
  for (const [key, item] of type.props) {
    if (isPhantomType(item)) {
      continue
    }
    const propValue = value[key]
    if (propValue === undefined && skipUndefined) {
      continue
    }
    const propResult = fastCheck(item, propValue, propFlags, opts)
    if (propResult !== PASS) {
      // Outside unions any non-pass ends in the full walk anyway. Inside a union the
      // walk keeps visiting the remaining props of a failing branch, so keep going to
      // honour the FAIL contract.
      if (propResult === BAIL || !inUnion) {
        return propResult
      }
      result = FAIL
    }
  }
  if (result !== PASS) {
    // The walk never strips a failing object; the unknown-key scan can't change the outcome.
    return result
  }
  const unknownProps = opts.unknownProps
  if (unknownProps === 'error' || unknownProps === 'strip') {
    const props = type.props
    for (const key of Object.keys(value)) {
      const known = props.get(key)
      if (known === undefined || isPhantomType(known)) {
        // 'strip' deletes keys during the walk — leave that to the walk.
        return unknownProps === 'error' ? FAIL : BAIL
      }
    }
  }
  return PASS
}

function fastCheckArray(
  def: TAtscriptAnnotatedType<TAtscriptTypeArray>,
  value: any,
  flags: number,
  opts: TValidatorOptions
): number {
  if (!Array.isArray(value)) {
    return FAIL
  }
  const metadata = def.metadata
  if (metadata.size > 0) {
    const minLength = metadata.get('expect.minLength')
    if (
      minLength !== undefined &&
      value.length < (typeof minLength === 'number' ? minLength : minLength.length)
    ) {
      return FAIL
    }
    const maxLength = metadata.get('expect.maxLength')
    if (
      maxLength !== undefined &&
      value.length > (typeof maxLength === 'number' ? maxLength : maxLength.length)
    ) {
      return FAIL
    }
    if (metadata.get('expect.array.uniqueItems')) {
      return BAIL
    }
  }
  const of = def.type.of
  const inUnion = (flags & IN_UNION) !== 0
  const itemFlags = flags & IN_UNION
  let result = PASS
  for (const item of value) {
    const itemResult = fastCheck(of, item, itemFlags, opts)
    if (itemResult !== PASS) {
      // Same reasoning as object props: the walk keeps visiting items after a failure.
      if (itemResult === BAIL || !inUnion) {
        return itemResult
      }
      result = FAIL
    }
  }
  return result
}
