import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
  TMetadataMap,
} from './annotated-type'
import { isPhantomType } from './annotated-type'
import { compiledCheckFor, optionFlags, type TCompiledEnv } from './compiled-check/registry'
import { filledMeta, readable } from './layers'
import { statelessRegExp } from './stateless-regex'
import type { TValidatorOptions } from './validator'
import {
  ARRAY_KEYS,
  BOOLEAN_KEYS,
  DECIMAL_RE,
  NUMBER_KEYS,
  OBJECT_KEYS,
  STRING_KEYS,
} from './validator-keys'

export { DECIMAL_RE } from './validator-keys'

/**
 * Allocation-free boolean pre-check used by {@link Validator.validate} before the
 * error-collecting walk.
 *
 * Nodes are checked by the generic functions below, which read the type tree and metadata
 * LIVE on every visit. Array items — the same type visited many times per call — go
 * through a compiled {@link Plan} of the item type instead (cached per node, shared by every
 * validator and option set). A plan snapshots what its node's check reads and re-verifies
 * every snapshot against the live node lazily, once per call, right before first using it
 * (rebuilding it when anything differs); constraint objects and pattern arrays are read
 * live on every visit. Either way `annotate()` / `metadata.set()` / prop mutations made
 * after a validator was created are always honoured — the same as the full walk.
 *
 * Result contract (relative to the full walk over the same node and value):
 * - `PASS` — the walk returns `true`, collects no errors and records the strips recorded
 *   here (see below).
 * - `FAIL` — the walk returns `false`. Inside a union, every node the walk would visit
 *   was visited here too (so a walk that would throw makes this throw first). Outside unions
 *   a `FAIL` always ends in the walk, so it may be returned early.
 * - `BAIL` — not decidable here; the caller must run the full walk.
 *
 * Union branches are tried in declared order, continuing past `FAIL` and stopping
 * at `BAIL`, which keeps union results identical to the walk.
 *
 * `unknownProps: 'strip'`: like the walk, this check records the unknown keys of each object
 * that passes (`pendingStrips`, in the order the objects complete), drops what a rejected union
 * branch recorded, and deletes the keys only when the whole value passes. Neither reads a
 * stripped input, so a `PASS` performs exactly the walk's deletions and `FAIL` / `BAIL` leave
 * the value untouched for the walk.
 */
const FAIL = 0
const PASS = 1
const BAIL = 2

/** Node is at walk depth 0 (only object props / array & tuple items increase depth). */
const TOP = 1
/** Node is inside a union branch — failures must be exhaustive (see contract). */
const IN_UNION = 2

/**
 * Wasted union branches (see {@link unionWaste}) after which a call memoizes nested unions: a
 * union nested in its own branches, many branches each, is checked again from every branch of
 * every union above it — (branches)^(depth) work. Ordinary unions waste a few branches at most;
 * the memo would cost them more than it saves.
 */
export const WASTE_BEFORE_MEMO = 16

/** Incremented per {@link fastCheckPasses} call; snapshots verified in older calls re-verify. */
let stamp = 0

/** A 'strip' {@link fastCheckPasses} call is in progress (the pending strips below are its own). */
let stripping = false

/**
 * The unknown keys the walk would delete (`unknownProps: 'strip'`): `object, key, …` in the
 * walk's deletion order. Deleted when the call passes, dropped otherwise.
 */
const pendingStrips: unknown[] = []

/**
 * `true` only when the full walk over `value` is guaranteed to pass with no errors and
 * no side effects other than its 'strip' deletions, which are then performed here, as the
 * walk would. Any other outcome (including a throw) leaves `value` untouched and means
 * "run the walk".
 */
export function fastCheckPasses(
  def: TAtscriptAnnotatedType,
  value: unknown,
  opts: TValidatorOptions
): boolean {
  if (opts.unknownProps === 'strip') {
    return fastCheckStripping(def, value, opts)
  }
  // A new call: every plan re-verifies itself against the live type when first reached.
  stamp++
  // (the union memo is the call's own, made only once it wastes work: see `unionWaste`)
  if (COMPILED_ENV.m !== undefined) {
    COMPILED_ENV.m = undefined
  }
  let passed: boolean
  try {
    passed = check(def, value, opts) === PASS
  } catch {
    // Let the walk reproduce (or not) the failure with its own semantics.
    passed = false
  }
  if (COMPILED_ENV.m !== undefined) {
    COMPILED_ENV.m = undefined
  }
  return passed
}

/** {@link fastCheckPasses} for `unknownProps: 'strip'`: performs the recorded strips on a pass. */
function fastCheckStripping(
  def: TAtscriptAnnotatedType,
  value: unknown,
  opts: TValidatorOptions
): boolean {
  if (stripping) {
    // Re-entered mid-check (a getter / proxy validating): leave this one to the walk.
    return false
  }
  stamp++
  stripping = true
  if (COMPILED_ENV.m !== undefined) {
    COMPILED_ENV.m = undefined
  }
  let passed: boolean
  try {
    passed = check(def, value, opts) === PASS
  } catch {
    passed = false
  } finally {
    stripping = false
  }
  if (COMPILED_ENV.m !== undefined) {
    COMPILED_ENV.m = undefined
  }
  // Outside the try: a failing `delete` throws from the walk too, at the same key.
  performStrips(pendingStrips, passed)
  return passed
}

/**
 * Deletes the recorded unknown keys (`unknownProps: 'strip'`; `object, key, …` in deletion order)
 * when the call `passed`, and empties the list either way. Shared by the walk and the pre-check:
 * the same deletes in the same order (a failing `delete`, e.g. of a frozen object's key, throws
 * at the same key).
 */
export function performStrips(strips: unknown[], passed: boolean): void {
  try {
    if (passed) {
      for (let i = 0; i < strips.length; i += 2) {
        delete (strips[i] as Record<string, unknown>)[strips[i + 1] as string]
      }
    }
  } finally {
    strips.length = 0
  }
}

/** The strips `list` recorded after its first `kept` entries (a union's own), or `undefined`. */
export function stripsSince(list: unknown[], kept: number): unknown[] | undefined {
  return list.length > kept ? list.slice(kept) : undefined
}

/** Records in `target` again the strips a memoized union recorded (see {@link stripsSince}). */
export function stripAgain(target: unknown[], strips: unknown[] | undefined): void {
  if (strips !== undefined) {
    for (const entry of strips) {
      target.push(entry)
    }
  }
}

/**
 * The pre-check of the root: the type's build-time compiled check when it has one bound to
 * the live tree (see compiled-check/registry.ts), else the interpreted one. Both share the
 * contract above and the strip state.
 */
function check(def: TAtscriptAnnotatedType, value: unknown, opts: TValidatorOptions): number {
  const compiled = compiledCheckFor(def, COMPILED_ENV)
  return compiled === null
    ? fastCheck(def, value, TOP, opts)
    : compiled(value, TOP | optionFlags(opts), opts)
}

const regexCache = new Map<string, Map<string, RegExp>>()

/**
 * Compiled `@expect.pattern` regex, cached per (pattern, flags). Compiled without the
 * stateful `g` / `y` flags (see {@link statelessRegExp}): every engine tests with it, and
 * gets the same result on every call.
 */
export function getRegex(pattern: string, flags?: string): RegExp {
  let byFlags = regexCache.get(pattern)
  if (!byFlags) {
    byFlags = new Map()
    regexCache.set(pattern, byFlags)
  }
  const flagsKey = flags || ''
  let regex = byFlags.get(flagsKey)
  if (!regex) {
    regex = statelessRegExp(new RegExp(pattern, flags))
    byFlags.set(flagsKey, regex)
  }
  return regex
}

/** Whether `def` carries `@meta.required`. */
export function isRequired(def: TAtscriptAnnotatedType): boolean {
  return !!filledMeta(def.metadata)?.get('meta.required')
}

/**
 * `true` when `def` (an optional field holding `null`) carries `@meta.required` and its
 * type does not itself accept `null`. Shared by the walk and the fast pre-check.
 */
export function rejectsNullAsRequired(def: TAtscriptAnnotatedType): boolean {
  return isRequired(def) && !acceptsNull(def)
}

export function acceptsNull(def: TAtscriptAnnotatedType): boolean {
  const type = def.type
  if (type.kind === '') {
    const designType = (type as TAtscriptTypeFinal).designType
    return designType === 'null' || designType === 'any'
  }
  if (type.kind === 'union') {
    for (const item of (type as TAtscriptTypeComplex).items) {
      if (item.optional || acceptsNull(item)) {
        return true
      }
    }
  }
  return false
}

/** What compiled checks share with the interpreted pre-check. */
export const COMPILED_ENV: TCompiledEnv = {
  pk: pendingStrips,
  // oxlint-disable-next-line @typescript-eslint/unbound-method
  ho: Object.prototype.hasOwnProperty,
  dec: DECIMAL_RE,
  regex: getRegex,
  interp: fastCheck,
  rn: rejectsNullAsRequired,
  m: undefined,
  n: 0,
  w: 0,
  wa: unionWaste,
  mg: memoGet,
  ms: memoSet,
}

/**
 * A union branch failed after branches of nested unions over objects did (`COMPILED_ENV.n`, the
 * failed branches of unions over objects inside union branches, moved): work
 * a later branch of the same outermost union may do again. Past {@link WASTE_BEFORE_MEMO} wasted
 * branches since the outermost union was entered, the call memoizes the unions over objects it
 * checks inside union branches (`memoGet` / `memoSet`): each such union is then decided once per
 * value, flags and options — the same result (a pre-check outcome depends on nothing else: the
 * input is not changed during the call, see the contract above) and the same strips, recorded
 * again on a reuse.
 */
function unionWaste(): void {
  if (++COMPILED_ENV.w === WASTE_BEFORE_MEMO && COMPILED_ENV.m === undefined) {
    COMPILED_ENV.m = new Map()
  }
}

/**
 * The outcome memoized for union `key` (a node, or a compiled union's key) over `value`, or -1;
 * records the strips the union recorded when it was decided.
 */
function memoGet(key: object, value: object, flags: number, opts: TValidatorOptions): number {
  const entries = COMPILED_ENV.m!.get(value)
  if (entries !== undefined) {
    for (let i = 0; i < entries.length; i += 5) {
      if (entries[i] === key && entries[i + 1] === flags && entries[i + 2] === opts) {
        stripAgain(pendingStrips, entries[i + 4] as unknown[] | undefined)
        return entries[i + 3] as number
      }
    }
  }
  return -1
}

/**
 * Memoizes the outcome of union `key` over `value` (see {@link memoGet}), entered with `kept`
 * pending strips (the ones after them are its own).
 */
function memoSet(
  key: object,
  value: object,
  flags: number,
  opts: TValidatorOptions,
  result: number,
  kept: number
): void {
  const memo = COMPILED_ENV.m!
  const strips = stripsSince(pendingStrips, kept)
  const entries = memo.get(value)
  if (entries === undefined) {
    memo.set(value, [key, flags, opts, result, strips])
  } else {
    entries.push(key, flags, opts, result, strips)
  }
}

/**
 * The `fastCheck` union case: branches in declared order (see the contract above). A union over
 * an object inside a union branch counts its failed branches and, once the call made the memo,
 * is decided once (see `unionWaste`).
 */
function fastCheckUnion(
  def: TAtscriptAnnotatedType<TAtscriptTypeComplex>,
  value: any,
  flags: number,
  opts: TValidatorOptions
): number {
  let nested = false
  if ((flags & IN_UNION) === 0) {
    // The outermost union: a new waste window.
    COMPILED_ENV.w = 0
  } else if (typeof value === 'object' && value !== null) {
    if (COMPILED_ENV.m !== undefined) {
      return memoizedUnion(def, value, flags, opts)
    }
    nested = true
  }
  // (`unionBranches`, inlined: the hot path)
  const branchFlags = flags | IN_UNION
  // (a rejected branch strips nothing: what it recorded is dropped)
  const kept = pendingStrips.length
  for (const item of def.type.items) {
    const failures = COMPILED_ENV.n
    const result = fastCheck(item, value, branchFlags, opts)
    if (result !== FAIL) {
      return unionMatchResult(result, item, def.metadata, value, opts)
    }
    if (COMPILED_ENV.n !== failures) {
      unionWaste()
    }
    if (nested) {
      COMPILED_ENV.n++
    }
    if (pendingStrips.length !== kept) {
      pendingStrips.length = kept
    }
  }
  return FAIL
}

/** {@link fastCheckUnion} of a union plan (the same memo entries: keyed by the node). */
function checkPlanUnion(plan: Plan, value: any, flags: number, opts: TValidatorOptions): number {
  let nested = false
  if ((flags & IN_UNION) === 0) {
    COMPILED_ENV.w = 0
  } else if (typeof value === 'object' && value !== null) {
    if (COMPILED_ENV.m !== undefined) {
      return memoizedUnion(
        plan.def as TAtscriptAnnotatedType<TAtscriptTypeComplex>,
        value,
        flags,
        opts,
        plan
      )
    }
    nested = true
  }
  // (`planUnionBranches`, inlined: the hot path)
  const branchFlags = flags | IN_UNION
  const kept = pendingStrips.length
  for (const child of plan.children!) {
    const failures = COMPILED_ENV.n
    const result = checkPlan(child, value, branchFlags, opts)
    if (result !== FAIL) {
      return unionMatchResult(result, child.def, plan.metadata!, value, opts)
    }
    if (COMPILED_ENV.n !== failures) {
      unionWaste()
    }
    if (nested) {
      COMPILED_ENV.n++
    }
    if (pendingStrips.length !== kept) {
      pendingStrips.length = kept
    }
  }
  return FAIL
}

/** The branches of a union (see {@link fastCheckUnion}); `nested`: its failed branches count. */
function unionBranches(
  def: TAtscriptAnnotatedType<TAtscriptTypeComplex>,
  value: any,
  flags: number,
  opts: TValidatorOptions,
  nested: boolean
): number {
  const branchFlags = flags | IN_UNION
  const kept = pendingStrips.length
  for (const item of def.type.items) {
    const failures = COMPILED_ENV.n
    const result = fastCheck(item, value, branchFlags, opts)
    if (result !== FAIL) {
      return unionMatchResult(result, item, def.metadata, value, opts)
    }
    if (COMPILED_ENV.n !== failures) {
      unionWaste()
    }
    if (nested) {
      COMPILED_ENV.n++
    }
    if (pendingStrips.length !== kept) {
      pendingStrips.length = kept
    }
  }
  return FAIL
}

/** {@link unionBranches} of a union plan. */
function planUnionBranches(
  plan: Plan,
  value: any,
  flags: number,
  opts: TValidatorOptions,
  nested: boolean
): number {
  const branchFlags = flags | IN_UNION
  const kept = pendingStrips.length
  for (const child of plan.children!) {
    const failures = COMPILED_ENV.n
    const result = checkPlan(child, value, branchFlags, opts)
    if (result !== FAIL) {
      return unionMatchResult(result, child.def, plan.metadata!, value, opts)
    }
    if (COMPILED_ENV.n !== failures) {
      unionWaste()
    }
    if (nested) {
      COMPILED_ENV.n++
    }
    if (pendingStrips.length !== kept) {
      pendingStrips.length = kept
    }
  }
  return FAIL
}

/** A union over object `value` inside a union branch, once the call made the memo. */
function memoizedUnion(
  def: TAtscriptAnnotatedType<TAtscriptTypeComplex>,
  value: object,
  flags: number,
  opts: TValidatorOptions,
  plan?: Plan
): number {
  const known = memoGet(def, value, flags, opts)
  if (known >= 0) {
    return known
  }
  const kept = pendingStrips.length
  const result =
    plan === undefined
      ? unionBranches(def, value, flags, opts, true)
      : planUnionBranches(plan, value, flags, opts, true)
  if (result !== BAIL) {
    memoSet(def, value, flags, opts, result, kept)
  }
  return result
}

function fastCheck(
  def: TAtscriptAnnotatedType,
  value: any,
  flags: number,
  opts: TValidatorOptions
): number {
  if (def.optional && (value === undefined || value === null)) {
    // Mirrors Validator.validateSafe: `null` on an optional `@meta.required` field fails.
    return value === null && rejectsNullAsRequired(def) ? FAIL : PASS
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
      return fastCheckUnion(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>, value, flags, opts)
    }
    case 'intersection': {
      return fastCheckIntersection(type as TAtscriptTypeComplex, value, flags, opts)
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
      return typeof value === 'string' ? fastCheckString(def.metadata, value) : FAIL
    }
    case 'number': {
      return typeof value === 'number' && Number.isFinite(value)
        ? fastCheckNumber(def.metadata, value)
        : FAIL
    }
    case 'boolean': {
      return typeof value === 'boolean' ? fastCheckBoolean(def.metadata, value) : FAIL
    }
    case 'any': {
      return value === undefined ? FAIL : PASS
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

// Constraint checks below mirror Validator.validate{String,Number,Boolean,Array}Constraints
// exactly (same order, same presence tests) so a failure stops at the same check.

type TMetadata = TMetadataMap<AtscriptMetadata>

/** Result of a union whose branch `item` did not fail (`PASS` or `BAIL`). */
function unionMatchResult(
  result: number,
  item: TAtscriptAnnotatedType,
  metadata: TMetadata,
  value: any,
  opts: TValidatorOptions
): number {
  // Literal branches skip the union-level constraints.
  return result === PASS && (item.type as TAtscriptTypeFinal).value === undefined
    ? fastCheckUnionConstraints(metadata, value, item, opts)
    : result
}

/**
 * Mirrors Validator.validateUnionConstraints: union-level constraints on the matched value
 * (`null` / objects pass; the caller skips literal branches).
 */
function fastCheckUnionConstraints(
  meta: TMetadata,
  value: any,
  branch: TAtscriptAnnotatedType,
  opts: TValidatorOptions
): number {
  const metadata = filledMeta(meta)
  if (metadata === undefined) {
    return PASS
  }
  switch (typeof value) {
    case 'string': {
      return fastCheckString(metadata, value)
    }
    case 'number': {
      return fastCheckNumber(metadata, value)
    }
    case 'boolean': {
      return fastCheckBoolean(metadata, value)
    }
    case 'object': {
      if (Array.isArray(value)) {
        return fastCheckArrayConstraints(metadata, value)
      }
      return value === null ? PASS : objectKeyCounts(metadata, value, branch, opts)
    }
    default: {
      return PASS
    }
  }
}

function fastCheckBoolean(meta: TMetadata, value: boolean): number {
  const metadata = filledMeta(meta)
  return metadata === undefined ? PASS : booleanConstraints(value, metadata.get('meta.required'))
}

function fastCheckString(meta: TMetadata, value: string): number {
  const metadata = filledMeta(meta)
  if (metadata === undefined) {
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
      if (!getRegex(pattern, flags).test(value)) {
        return FAIL
      }
    }
  }
  return PASS
}

function fastCheckNumber(meta: TMetadata, value: number): number {
  const metadata = filledMeta(meta)
  if (metadata === undefined) {
    return PASS
  }
  return numberConstraints(
    value,
    metadata.get('expect.int'),
    metadata.get('expect.min'),
    metadata.get('expect.max'),
    metadata.get('expect.exclusiveMin'),
    metadata.get('expect.exclusiveMax')
  )
}

// Value-taking constraint cores, shared by the generic checks (live metadata) and the
// plans (snapshotted metadata).

function booleanConstraints(value: boolean, required: unknown): number {
  return required && value !== true ? FAIL : PASS
}

function numberConstraints(
  value: number,
  int: unknown,
  min: AtscriptMetadata['expect.min'] | undefined,
  max: AtscriptMetadata['expect.max'] | undefined,
  exMin: AtscriptMetadata['expect.exclusiveMin'] | undefined,
  exMax: AtscriptMetadata['expect.exclusiveMax'] | undefined
): number {
  if (int && value % 1 !== 0) {
    return FAIL
  }
  if (min !== undefined && value < (typeof min === 'number' ? min : min.minValue)) {
    return FAIL
  }
  if (max !== undefined && value > (typeof max === 'number' ? max : max.maxValue)) {
    return FAIL
  }
  if (
    exMin !== undefined &&
    value <= (typeof exMin === 'number' ? exMin : exMin.exclusiveMinValue)
  ) {
    return FAIL
  }
  if (
    exMax !== undefined &&
    value >= (typeof exMax === 'number' ? exMax : exMax.exclusiveMaxValue)
  ) {
    return FAIL
  }
  return PASS
}

/** `@expect.minLength` / `@expect.maxLength` (strings and arrays). */
function lengthFails(
  length: number,
  minLength: AtscriptMetadata['expect.minLength'] | undefined,
  maxLength: AtscriptMetadata['expect.maxLength'] | undefined
): boolean {
  return (
    (minLength !== undefined &&
      length < (typeof minLength === 'number' ? minLength : minLength.length)) ||
    (maxLength !== undefined &&
      length > (typeof maxLength === 'number' ? maxLength : maxLength.length))
  )
}

/** `@expect.minKeys` / `@expect.maxKeys` of an object keeping `count` keys. */
function countFails(
  count: number,
  minKeys: AtscriptMetadata['expect.minKeys'] | undefined,
  maxKeys: AtscriptMetadata['expect.maxKeys'] | undefined
): boolean {
  return (
    (minKeys !== undefined && count < (typeof minKeys === 'number' ? minKeys : minKeys.count)) ||
    (maxKeys !== undefined && count > (typeof maxKeys === 'number' ? maxKeys : maxKeys.count))
  )
}

/**
 * The keys of object `value` the walk's result keeps (`Validator.keptKeyCount`): with
 * `unknownProps: 'strip'`, the keys `props` declares (not phantom); else every own key (with
 * 'error' an object with an unknown key fails anyway, whatever its count).
 */
function keptKeys(
  props: Map<string, TAtscriptAnnotatedType>,
  value: object,
  opts: TValidatorOptions
): number {
  const keys = Object.keys(value)
  if (opts.unknownProps !== 'strip') {
    return keys.length
  }
  let count = 0
  for (const key of keys) {
    if (!isUnknownKey(props, key)) {
      count++
    }
  }
  return count
}

/**
 * `@expect.minKeys` / `maxKeys` in `metadata` (an object's or a union's) of object `value`,
 * matched as `branch` (pattern props: the walk).
 */
function objectKeyCounts(
  metadata: TMetadata,
  value: object,
  branch: TAtscriptAnnotatedType,
  opts: TValidatorOptions
): number {
  const minKeys = metadata.get('expect.minKeys')
  const maxKeys = metadata.get('expect.maxKeys')
  if (minKeys === undefined && maxKeys === undefined) {
    return PASS
  }
  const type = branch.type as TAtscriptTypeObject
  let count: number
  if (type.kind !== 'object') {
    count = Object.keys(value).length
  } else if (type.propsPatterns.length > 0 && opts.unknownProps !== 'ignore') {
    return BAIL
  } else {
    count = keptKeys(type.props, value, opts)
  }
  return countFails(count, minKeys, maxKeys) ? FAIL : PASS
}

/**
 * {@link fastCheck} of an intersection (a function of its own: `fastCheck` stays small, so the
 * engine inlines it in the hot object and prop checks).
 */
function fastCheckIntersection(
  type: TAtscriptTypeComplex,
  value: any,
  flags: number,
  opts: TValidatorOptions
): number {
  // Each member on its own; the walk stops at the first failing one.
  for (const item of type.items) {
    const result = fastCheck(item, value, flags, opts)
    if (result !== PASS) {
      return result
    }
  }
  return PASS
}

/** Array constraints; duplicate detection (`uniqueItems`) is left to the walk. */
function arrayConstraints(
  length: number,
  minLength: AtscriptMetadata['expect.minLength'] | undefined,
  maxLength: AtscriptMetadata['expect.maxLength'] | undefined,
  uniqueItems: unknown
): number {
  if (lengthFails(length, minLength, maxLength)) {
    return FAIL
  }
  return uniqueItems ? BAIL : PASS
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
  const unknownProps = opts.unknownProps
  const inUnion = (flags & IN_UNION) !== 0
  if (unknownProps === 'error' && !inUnion && hasUnknownKey(type.props, value)) {
    // Outside unions a FAIL always ends in the walk: no need to check the props first.
    return FAIL
  }
  const partial = opts.partial
  const skipUndefined = partial === 'deep' || (partial === true && (flags & TOP) !== 0)
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
  // Key counts after the props: the walk reports them and still checks the props.
  const metadata = filledMeta(def.metadata)
  if (metadata !== undefined && objectKeyCounts(metadata, value, def, opts) === FAIL) {
    return FAIL
  }
  if (unknownProps === 'strip') {
    pendStrips(type.props, value)
    return PASS
  }
  // 'error' outside unions was scanned before the props.
  return unknownProps === 'error' && inUnion && hasUnknownKey(type.props, value) ? FAIL : PASS
}

/** Records the unknown keys of a passing object (see `pendingStrips`). */
function pendStrips(props: Map<string, TAtscriptAnnotatedType>, value: Record<string, unknown>) {
  for (const key of Object.keys(value)) {
    if (isUnknownKey(props, key)) {
      pendingStrips.push(value, key)
    }
  }
}

/** `true` when `value` has a key the walk treats as unknown. */
function hasUnknownKey(props: Map<string, TAtscriptAnnotatedType>, value: object): boolean {
  for (const key of Object.keys(value)) {
    if (isUnknownKey(props, key)) {
      return true
    }
  }
  return false
}

/** `true` when the walk treats `key` as unknown (no prop, or a phantom one). */
function isUnknownKey(props: Map<string, TAtscriptAnnotatedType>, key: string): boolean {
  const known = props.get(key)
  return known === undefined || isPhantomType(known)
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
  const metadata = filledMeta(def.metadata)
  if (metadata !== undefined) {
    const result = fastCheckArrayConstraints(metadata, value)
    if (result !== PASS) {
      return result
    }
  }
  // Items share one type: check them through its compiled plan, whose verification is
  // paid once per call instead of once per item.
  return checkItems(planFor(def.type.of), value, flags, opts)
}

/** Checks every array item against the item type's plan. */
function checkItems(of: Plan, value: unknown[], flags: number, opts: TValidatorOptions): number {
  const inUnion = (flags & IN_UNION) !== 0
  const itemFlags = flags & IN_UNION
  let result = PASS
  for (const item of value) {
    const itemResult = checkPlan(of, item, itemFlags, opts)
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

function fastCheckArrayConstraints(metadata: TMetadata, value: unknown[]): number {
  return arrayConstraints(
    value.length,
    metadata.get('expect.minLength'),
    metadata.get('expect.maxLength'),
    metadata.get('expect.array.uniqueItems')
  )
}

// ── Compiled plans ──────────────────────────────────────────────────────────
//
// A plan mirrors the generic `fastCheck*` functions above for one type node, with the
// per-visit dispatch and annotation lookups hoisted out. Everything a plan snapshots is
// re-verified against the live node once per call, lazily, right before it is first
// used: the node structure when the plan is first reached, the annotation values when a
// constraint is first read, each object prop when it is first visited. A mismatch
// rebuilds the snapshot (or, mid-object, bails to the walk). Constraint objects and
// pattern arrays are read live on every visit.
//
// Node kinds without a plan (intersections, tuples, objects with prop patterns, unknown
// kinds) delegate to the generic functions, which read everything live.

const OP_GENERIC = 0
// Final ops (`OP_PHANTOM`..`OP_FINAL`, see isFinalOp). String, number and boolean cache
// their annotations; phantom is kept apart because object scans skip phantom props.
const OP_PHANTOM = 1
const OP_STRING = 2
const OP_NUMBER = 3
const OP_BOOLEAN = 4
/** Any other final node: checked by {@link fastCheckFinal}. */
const OP_FINAL = 5
const OP_OBJECT = 6
const OP_ARRAY = 7
const OP_UNION = 8

function isFinalOp(op: number): boolean {
  return op !== OP_GENERIC && op <= OP_FINAL
}

/** Shared placeholder for the per-kind arrays of plans that don't use them. */
const EMPTY: never[] = Object.freeze([]) as never[]

interface TPlanRegex {
  pattern: string
  flags: string | undefined
  re: RegExp
}

const plans = new WeakMap<TAtscriptAnnotatedType, Plan>()

/** One shape for every plan, so plan field access stays monomorphic. */
class Plan {
  /** Call in which the node structure was last verified (`-1`: must rebuild). */
  stamp = -1
  /** Call in which the annotation values (`m0`–`m4`) were last verified. */
  metaStamp = -1
  op = OP_GENERIC
  // snapshot of the node
  type: any = undefined
  optional: boolean | undefined = undefined
  metadata: TMetadata | undefined = undefined
  kind: string | undefined = undefined
  designType: string | undefined = undefined
  literal: unknown = undefined
  /** String plans: compiled `@expect.pattern` regexes by position (checked against the live entry). */
  regexes: TPlanRegex[] = EMPTY
  /**
   * Annotation keys the node's check reads, and their values (`undefined` when absent):
   * string `meta.required, expect.minLength, maxLength, pattern`; number `expect.int, min,
   * max, exclusiveMin, exclusiveMax`; boolean `meta.required`; array `expect.minLength, maxLength, array.uniqueItems`;
   * object `expect.minKeys, maxKeys`.
   */
  k0: string | undefined = undefined
  k1: string | undefined = undefined
  k2: string | undefined = undefined
  k3: string | undefined = undefined
  k4: string | undefined = undefined
  m0: any = undefined
  m1: any = undefined
  m2: any = undefined
  m3: any = undefined
  m4: any = undefined
  // object
  props: Map<string, TAtscriptAnnotatedType> | undefined = undefined
  propsPatterns: unknown[] | undefined = undefined
  keys: string[] = EMPTY
  /** Call in which `props.get(keys[i]) === nodes[i]` was last verified. */
  edges: number[] = EMPTY
  /** Prop plans by key (the entries of `props`, verified per visit via `edges`). */
  byKey: Map<string, Plan> | undefined = undefined
  // object props / union items (nodes and their plans, by position)
  nodes: TAtscriptAnnotatedType[] = EMPTY
  children: Plan[] = EMPTY
  // array
  of: TAtscriptAnnotatedType | undefined = undefined
  ofPlan: Plan | undefined = undefined
  // union
  items: TAtscriptAnnotatedType[] | undefined = undefined

  constructor(readonly def: TAtscriptAnnotatedType) {}
}

function planFor(def: TAtscriptAnnotatedType): Plan {
  let plan = plans.get(def)
  if (plan === undefined) {
    plan = new Plan(def)
    plans.set(def, plan)
  }
  return plan
}

/** Brings the plan's structure up to date with its live node (once per call). */
function refresh(plan: Plan): void {
  if (!(isFinalOp(plan.op) ? verifyFinal(plan) : verify(plan))) {
    build(plan)
  }
  plan.stamp = stamp
}

/** Structure check for final ops; small enough to be inlined into the hot loops. */
function verifyFinal(plan: Plan): boolean {
  const def = plan.def
  const type = def.type as TAtscriptTypeFinal
  return (
    plan.stamp !== -1 &&
    type === plan.type &&
    def.optional === plan.optional &&
    def.metadata === plan.metadata &&
    type.kind === '' &&
    type.designType === plan.designType &&
    type.value === plan.literal
  )
}

/** Structure check for objects, arrays, unions and generic nodes. */
function verify(plan: Plan): boolean {
  if (plan.stamp === -1) {
    return false
  }
  const def = plan.def
  const type = def.type as any
  if (
    type !== plan.type ||
    def.optional !== plan.optional ||
    def.metadata !== plan.metadata ||
    type.kind !== plan.kind
  ) {
    return false
  }
  switch (plan.op) {
    case OP_OBJECT: {
      // Each prop is verified when first visited (see checkObject).
      return (
        type.props === plan.props &&
        plan.props!.size === plan.keys.length &&
        type.propsPatterns === plan.propsPatterns &&
        plan.propsPatterns!.length === 0
      )
    }
    case OP_ARRAY: {
      return type.of === plan.of
    }
    case OP_UNION: {
      const items = plan.items!
      const nodes = plan.nodes
      if (type.items !== items || items.length !== nodes.length) {
        return false
      }
      for (let i = 0; i < nodes.length; i++) {
        if (items[i] !== nodes[i]) {
          return false
        }
      }
      return true
    }
    default: {
      // OP_GENERIC reads the node live; only a kind change may enable a plan.
      return type.kind !== 'object' || type.propsPatterns.length > 0
    }
  }
}

/** Plan metadata as read by key slot (an unused slot's `undefined` key reads as absent). */
type TAnnotationReader = Map<string | undefined, unknown>

/** Brings the annotation values up to date (once per call, when a constraint is read). */
function refreshMeta(plan: Plan): void {
  const metadata = filledMeta(plan.metadata as TAnnotationReader)
  // Most nodes carry no annotations: one size check instead of four lookups.
  const same =
    metadata === undefined
      ? plan.m0 === undefined &&
        plan.m1 === undefined &&
        plan.m2 === undefined &&
        plan.m3 === undefined &&
        plan.m4 === undefined
      : metadata.get(plan.k0) === plan.m0 &&
        (plan.k1 === undefined || metadata.get(plan.k1) === plan.m1) &&
        (plan.k2 === undefined || metadata.get(plan.k2) === plan.m2) &&
        (plan.k3 === undefined || metadata.get(plan.k3) === plan.m3) &&
        (plan.k4 === undefined || metadata.get(plan.k4) === plan.m4)
  if (!same) {
    snapshotMeta(plan)
  }
  plan.metaStamp = stamp
}

function snapshotMeta(plan: Plan): void {
  const metadata = readable(plan.metadata as TAnnotationReader)
  plan.m0 = metadata.get(plan.k0)
  plan.m1 = metadata.get(plan.k1)
  plan.m2 = metadata.get(plan.k2)
  plan.m3 = metadata.get(plan.k3)
  plan.m4 = metadata.get(plan.k4)
}

function setMetaKeys(
  plan: Plan,
  k0?: string,
  k1?: string,
  k2?: string,
  k3?: string,
  k4?: string
): void {
  plan.k0 = k0
  plan.k1 = k1
  plan.k2 = k2
  plan.k3 = k3
  plan.k4 = k4
  snapshotMeta(plan)
  plan.metaStamp = stamp
}

/** (Re)compiles `plan` from its live node. */
function build(plan: Plan): void {
  // Unverifiable until the build completes (a throwing lazy ref leaves it that way).
  plan.stamp = -1
  plan.op = OP_GENERIC
  const def = plan.def
  const type = def.type as any
  plan.type = type
  plan.optional = def.optional
  plan.metadata = def.metadata
  plan.kind = type.kind
  plan.designType = type.designType
  plan.literal = type.value
  plan.regexes = EMPTY
  plan.props = undefined
  plan.propsPatterns = undefined
  plan.keys = EMPTY
  plan.edges = EMPTY
  plan.byKey = undefined
  plan.nodes = EMPTY
  plan.children = EMPTY
  plan.of = undefined
  plan.ofPlan = undefined
  plan.items = undefined
  setMetaKeys(plan)
  switch (type.kind) {
    case '': {
      // Same order as fastCheckFinal.
      if (type.designType === 'phantom') {
        plan.op = OP_PHANTOM
      } else if (type.value !== undefined) {
        plan.op = OP_FINAL
      } else if (type.designType === 'string') {
        setMetaKeys(plan, ...STRING_KEYS)
        plan.regexes = []
        plan.op = OP_STRING
      } else if (type.designType === 'number') {
        setMetaKeys(plan, ...NUMBER_KEYS)
        plan.op = OP_NUMBER
      } else if (type.designType === 'boolean') {
        setMetaKeys(plan, ...BOOLEAN_KEYS)
        plan.op = OP_BOOLEAN
      } else {
        plan.op = OP_FINAL
      }
      break
    }
    case 'object': {
      if (type.propsPatterns.length > 0) {
        break
      }
      const byKey = new Map<string, Plan>()
      plan.keys = []
      plan.edges = []
      plan.nodes = []
      plan.children = []
      for (const [key, node] of type.props as Map<string, TAtscriptAnnotatedType>) {
        const child = planFor(node)
        plan.keys.push(key)
        plan.edges.push(stamp)
        plan.nodes.push(node)
        plan.children.push(child)
        byKey.set(key, child)
      }
      plan.byKey = byKey
      plan.props = type.props
      plan.propsPatterns = type.propsPatterns
      setMetaKeys(plan, ...OBJECT_KEYS)
      plan.op = OP_OBJECT
      break
    }
    case 'array': {
      setMetaKeys(plan, ...ARRAY_KEYS)
      plan.of = type.of
      plan.ofPlan = planFor(type.of)
      plan.op = OP_ARRAY
      break
    }
    case 'union': {
      plan.nodes = []
      plan.children = []
      for (const node of type.items as TAtscriptAnnotatedType[]) {
        plan.nodes.push(node)
        plan.children.push(planFor(node))
      }
      plan.items = type.items
      plan.op = OP_UNION
      break
    }
    default:
    // intersection, tuple, unknown kinds: OP_GENERIC
  }
}

/** Plan counterpart of {@link fastCheck}. */
function checkPlan(plan: Plan, value: any, flags: number, opts: TValidatorOptions): number {
  if (plan.stamp !== stamp) {
    refresh(plan)
  }
  if (plan.optional && (value === undefined || value === null)) {
    return value === null && rejectsNullAsRequired(plan.def) ? FAIL : PASS
  }
  switch (plan.op) {
    case OP_STRING: {
      return typeof value === 'string' ? checkString(plan, value) : FAIL
    }
    case OP_NUMBER: {
      return typeof value === 'number' && Number.isFinite(value) ? checkNumber(plan, value) : FAIL
    }
    case OP_OBJECT: {
      return checkObject(plan, value, flags, opts)
    }
    case OP_ARRAY: {
      return checkArray(plan, value, flags, opts)
    }
    case OP_UNION: {
      return checkPlanUnion(plan, value, flags, opts)
    }
    case OP_BOOLEAN: {
      if (typeof value !== 'boolean') {
        return FAIL
      }
      if (plan.metaStamp !== stamp) {
        refreshMeta(plan)
      }
      return booleanConstraints(value, plan.m0)
    }
    case OP_PHANTOM:
    case OP_FINAL: {
      return fastCheckFinal(plan.def as TAtscriptAnnotatedType<TAtscriptTypeFinal>, value)
    }
    default: {
      return fastCheck(plan.def, value, flags, opts)
    }
  }
}

/** Plan counterpart of {@link fastCheckString}; constraint objects are read live. */
function checkString(plan: Plan, value: string): number {
  if (plan.metaStamp !== stamp) {
    refreshMeta(plan)
  }
  const filled = plan.m0
  if (filled && value.trim().length === 0) {
    return FAIL
  }
  if (lengthFails(value.length, plan.m1, plan.m2)) {
    return FAIL
  }
  const patterns = plan.m3
  if (patterns) {
    if (!Array.isArray(patterns)) {
      return fastCheckString(plan.metadata!, value)
    }
    for (let i = 0; i < patterns.length; i++) {
      const { pattern, flags } = patterns[i]
      if (!pattern) {
        continue
      }
      let entry = plan.regexes[i]
      if (entry === undefined || entry.pattern !== pattern || entry.flags !== flags) {
        entry = { pattern, flags, re: getRegex(pattern, flags) }
        plan.regexes[i] = entry
      }
      if (!entry.re.test(value)) {
        return FAIL
      }
    }
  }
  return PASS
}

/** Plan counterpart of {@link fastCheckNumber}; constraint objects are read live. */
function checkNumber(plan: Plan, value: number): number {
  if (plan.metaStamp !== stamp) {
    refreshMeta(plan)
  }
  return numberConstraints(value, plan.m0, plan.m1, plan.m2, plan.m3, plan.m4)
}

/** Plan counterpart of {@link fastCheckObject}. */
function checkObject(plan: Plan, value: any, flags: number, opts: TValidatorOptions): number {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return FAIL
  }
  const partial = opts.partial
  const skipUndefined = partial === 'deep' || (partial === true && (flags & TOP) !== 0)
  const inUnion = (flags & IN_UNION) !== 0
  const propFlags = flags & IN_UNION
  const keys = plan.keys
  const children = plan.children
  const edges = plan.edges
  let result = PASS
  for (let i = 0; i < keys.length; i++) {
    if (edges[i] !== stamp) {
      if (plan.props!.get(keys[i]) !== plan.nodes[i]) {
        // A prop was replaced: rebuild on the next visit, let the walk decide this call.
        plan.stamp = -1
        return BAIL
      }
      edges[i] = stamp
    }
    const child = children[i]
    if (child.stamp !== stamp) {
      refresh(child)
    }
    const op = child.op
    if (op === OP_PHANTOM) {
      continue
    }
    const propValue = value[keys[i]]
    if (propValue === undefined && skipUndefined) {
      continue
    }
    // The two most common leaf checks, inlined (same logic as checkPlan).
    if (typeof propValue === 'string' && op === OP_STRING) {
      const r = checkString(child, propValue)
      if (r === PASS) {
        continue
      }
      if (r === BAIL || !inUnion) {
        return r
      }
      result = FAIL
      continue
    }
    if (typeof propValue === 'number' && op === OP_NUMBER) {
      if (Number.isFinite(propValue) && checkNumber(child, propValue) === PASS) {
        continue
      }
      if (!inUnion) {
        return FAIL
      }
      result = FAIL
      continue
    }
    const propResult = checkPlan(child, propValue, propFlags, opts)
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
  // Unlike fastCheckObject, the unknown-key scan deliberately stays after the props even for
  // 'error' outside unions: `byKey` and the child `op`s are only verified by the loop above.
  const unknownProps = opts.unknownProps
  // Every prop and child plan was verified in the loop above, so `byKey` and `op` are current.
  const byKey = plan.byKey!
  // Key counts after the props (the walk reports them and still checks the props).
  if (plan.metaStamp !== stamp) {
    refreshMeta(plan)
  }
  if (
    (plan.m0 !== undefined || plan.m1 !== undefined) &&
    planKeyCountFails(plan, byKey, value, opts)
  ) {
    return FAIL
  }
  if (unknownProps === 'error' || unknownProps === 'strip') {
    for (const key of Object.keys(value)) {
      const known = byKey.get(key)
      if (known !== undefined && known.op !== OP_PHANTOM) {
        continue
      }
      if (unknownProps === 'error') {
        return FAIL
      }
      pendingStrips.push(value, key)
    }
  }
  return PASS
}

/** The key counts of an object plan (see `keptKeys`; `byKey` verified). */
function planKeyCountFails(
  plan: Plan,
  byKey: Map<string, Plan>,
  value: object,
  opts: TValidatorOptions
): boolean {
  const keys = Object.keys(value)
  let count = keys.length
  if (opts.unknownProps === 'strip') {
    count = 0
    for (const key of keys) {
      const known = byKey.get(key)
      if (known !== undefined && known.op !== OP_PHANTOM) {
        count++
      }
    }
  }
  return countFails(count, plan.m0, plan.m1)
}

/** Plan counterpart of {@link fastCheckArray}. */
function checkArray(plan: Plan, value: any, flags: number, opts: TValidatorOptions): number {
  if (!Array.isArray(value)) {
    return FAIL
  }
  if (plan.metaStamp !== stamp) {
    refreshMeta(plan)
  }
  const result = arrayConstraints(value.length, plan.m0, plan.m1, plan.m2)
  if (result !== PASS) {
    return result
  }
  return checkItems(plan.ofPlan!, value, flags, opts)
}
