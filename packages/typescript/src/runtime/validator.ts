// oxlint-disable max-depth
// eslint-disable max-lines
import type {
  TAtscriptAnnotatedType,
  TAtscriptDataType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
  TMetadataMap,
} from './annotated-type'
import { isPhantomType } from './annotated-type'
import { detectDiscriminator } from './discriminator'
import { filledMeta, metaEmpty, readable } from './layers'
import {
  DECIMAL_RE,
  fastCheckPasses,
  WASTE_BEFORE_MEMO,
  getRegex,
  performStrips,
  rejectsNullAsRequired,
  stripAgain,
  stripsSince,
} from './validator-fast-check'
import { arrayKeyProps, boundOf } from './validator-keys'
import {
  formatCodeOf,
  formatValidatorMessage,
  localizeErrors,
  VALIDATOR_MESSAGES,
  type TError,
  type TValidatorTranslate,
} from './validator-messages'

/**
 * The outcome of a union over an object value at a path, recorded once the walk backtracks (see
 * `Validator.unionMemo`): the branch that matched, or the error reported.
 */
interface TUnionOutcome {
  def: TAtscriptAnnotatedType
  path: string
  unknownProps: TValidatorOptions['unknownProps']
  item?: TAtscriptAnnotatedType
  /** The errors reported (one union error, or the errors of the branch its discriminator picks). */
  errors?: TError[]
  /** The strips the union recorded (`Validator.strips` entries), recorded again on a reuse. */
  strips?: unknown[]
}

/** A built-in error code with a default template (every `TValidatorErrorCode` but `CUSTOM`). */
type TBuiltinCode = keyof typeof VALIDATOR_MESSAGES

/**
 * What an error reports besides its message (see {@link Validator.error}): its code (`CUSTOM`
 * when omitted), params and `custom` flag.
 */
export interface TErrorInfo extends Pick<TError, 'code' | 'params'> {
  /**
   * The message is app text (a translator gets it as the id) rather than the code's own
   * message. Default: `true` without a `code`, `false` with one.
   */
  custom?: boolean
}

/**
 * A plugin function that can intercept validation.
 *
 * Return `true` to accept the value, `false` to reject it,
 * or `undefined` to fall through to the default validation.
 */
export type TValidatorPlugin = (
  ctx: TValidatorPluginContext,
  def: TAtscriptAnnotatedType,
  value: any
) => boolean | undefined

/** Options for configuring {@link Validator} behavior. */
export interface TValidatorOptions {
  partial:
    | boolean
    | 'deep'
    | ((type: TAtscriptAnnotatedType<TAtscriptTypeObject>, path: string) => boolean)
  replace?: (type: TAtscriptAnnotatedType, path: string) => TAtscriptAnnotatedType
  plugins: TValidatorPlugin[]
  unknownProps: 'strip' | 'ignore' | 'error'
  errorLimit: number
  skipList?: Set<string>
  /**
   * Translates the errors of a failed call (see {@link localizeErrors}) before they are
   * reported (`errors`, the thrown {@link ValidatorError}).
   */
  translate?: TValidatorTranslate
}

/** Context exposed to {@link TValidatorPlugin} functions. */
export interface TValidatorPluginContext {
  opts: Validator<any>['opts']
  /**
   * Validates `value` against `def` at the current path (errors go to the current level). With
   * `unknownProps: 'strip'`, a call that returns `false` strips nothing: the keys it recorded are
   * dropped, as for a rejected union branch, so trying alternatives (`a || b`) strips what the
   * union `a | b` would.
   */
  validateAnnotatedType: Validator<any>['validateAnnotatedType']
  error: Validator<any>['error']
  path: Validator<any>['path']
  /**
   * The type the validator was created for — the root of the walk, as passed to the
   * constructor (before `replace`). The plugin's `def` argument is the node visited now.
   */
  readonly root: TAtscriptAnnotatedType
  context: unknown
}

/**
 * Validates values against an {@link TAtscriptAnnotatedType} definition.
 *
 * `DataType` is automatically inferred from the type definition's phantom generic,
 * enabling the {@link validate} method to act as a type guard.
 *
 * @example
 * ```ts
 * // From a generated interface class:
 * const validator = new Validator(MyInterface)
 * if (validator.validate(data, true)) {
 *   data // narrowed to MyInterface
 * }
 *
 * // Or use the built-in factory:
 * MyInterface.validator().validate(data)
 * ```
 *
 * @typeParam T - The annotated type definition.
 * @typeParam DataType - The TypeScript type that `validate` narrows to (auto-inferred).
 */
export class Validator<
  T extends TAtscriptAnnotatedType = TAtscriptAnnotatedType,
  DataType = TAtscriptDataType<T>,
> {
  protected opts: TValidatorOptions
  protected hasPlugins: boolean
  protected hasReplace: boolean
  private replaceCache?: WeakMap<TAtscriptAnnotatedType, TAtscriptAnnotatedType>

  constructor(
    protected readonly def: T,
    opts?: Partial<TValidatorOptions>
  ) {
    this.opts = {
      partial: false,
      unknownProps: 'error',
      errorLimit: 10,
      ...opts,
      plugins: opts?.plugins || [],
    }
    this.hasPlugins = this.opts.plugins.length > 0
    this.hasReplace = typeof this.opts.replace === 'function'
    if (this.hasReplace) {
      this.replaceCache = new WeakMap()
    }
  }

  /** Validation errors collected during the last {@link validate} call. */
  public errors: TError[] = []
  protected stackErrors: Array<TError[] | null> = []
  protected pathSegments: string[] = []
  protected depth = 0
  protected limitExceeded = false
  protected context: unknown
  /**
   * The unions over objects this call decided inside union branches (value → outcomes). A union
   * nested in its own branches, many branches each, is reached again with the same value and path
   * from every branch of every union above it — (branches)^(depth) work. The memo is made once
   * the call has wasted {@link WASTE_BEFORE_MEMO} union branches (failed after branches of nested
   * unions over objects failed) since the outermost union, as in the pre-check — ordinary walks
   * never make it. It decides each such union once, with the same result and the same error object
   * (both depend only on these, the options and the input, which the walk never changes), and
   * records the same strips again.
   */
  private unionMemo?: Map<object, TUnionOutcome[]>
  /** Union branches being checked (`> 0`: inside a union branch). */
  private unionDepth = 0
  /** Failed branches of unions over objects inside union branches (see `unionMemo`). */
  private nestedFailures = 0
  /** Wasted union branches since the outermost union was entered (see `unionMemo`). */
  private wasted = 0
  /**
   * `unknownProps: 'strip'`: the unknown keys of the objects that passed (`object, key, …`), in the
   * order the objects completed, then in key order. A rejected union branch, pattern property
   * attempt or plugin sub-validation drops what it recorded; the keys are deleted once the whole
   * call passes (`performStrips`).
   */
  private strips: unknown[] = []

  protected buildPath(): string {
    if (this.depth <= 0) {
      return ''
    }
    let path = this.pathSegments[0]
    for (let i = 1; i < this.depth; i++) {
      path += `.${this.pathSegments[i]}`
    }
    return path
  }

  protected push(name: string) {
    this.pathSegments[this.depth] = name
    this.depth++
    this.stackErrors.push(null)
  }

  protected pop(saveErrors: boolean) {
    this.depth--
    const popped = this.stackErrors.pop()
    if (saveErrors && popped) {
      this.reportAll(popped)
    }
    return popped
  }

  protected clear() {
    this.stackErrors[this.stackErrors.length - 1] = null
    if (this.limitExceeded) {
      this.limitExceeded = false
    }
  }

  /**
   * Reports an error at `path` (default: the current path). `info` gives its code and params;
   * without it the error is app text with code `CUSTOM` (a plugin's own message).
   */
  protected error(message: string, path?: string, details?: TError[], info?: TErrorInfo): TError {
    const error: TError = {
      path: path || this.buildPath(),
      message,
      code: info?.code ?? 'CUSTOM',
      params: info?.params ?? {},
    }
    if (info?.custom ?? info?.code === undefined) {
      error.custom = true
    }
    if (details?.length) {
      error.details = details
    }
    this.report(error)
    return error
  }

  /**
   * Reports built-in error `code`: `custom` (the app's message from an annotation) when given,
   * else the code's template filled with `params`.
   */
  private fail(code: TBuiltinCode, params: Record<string, unknown>, custom?: string): false {
    this.builtin(code, params, custom)
    return false
  }

  /** Reports built-in error `code` at `path` (see {@link fail}), with `details` (a union's). */
  private builtin(
    code: TBuiltinCode,
    params: Record<string, unknown>,
    custom: string | undefined,
    path?: string,
    details?: TError[]
  ): TError {
    return custom
      ? this.error(custom, path, details, { code, params, custom: true })
      : this.error(formatValidatorMessage(VALIDATOR_MESSAGES[code], params), path, details, {
          code,
          params,
        })
  }

  /** {@link fail} of a type mismatch of `def`: its `@expect.message` replaces the message. */
  private mismatch(
    def: TAtscriptAnnotatedType,
    code: TBuiltinCode,
    params: Record<string, unknown>
  ): false {
    return this.fail(code, params, expectMessage(def))
  }

  /** The `@meta.required` error of `def` (custom message or the type's default). */
  private required(def: TAtscriptAnnotatedType): false {
    const isBoolean =
      def.type.kind === '' && (def.type as TAtscriptTypeFinal).designType === 'boolean'
    return this.fail(
      isBoolean ? 'REQUIRED_CHECKED' : 'REQUIRED',
      {},
      messageOf(def.metadata.get('meta.required'))
    )
  }

  /**
   * Adds `error`, already made, to the errors of the current level (as {@link error} does);
   * `true` once the level holds as many errors as the limit.
   */
  private report(error: TError): boolean {
    let errors = this.stackErrors[this.stackErrors.length - 1]
    if (!errors) {
      if (this.stackErrors.length > 0) {
        errors = []
        this.stackErrors[this.stackErrors.length - 1] = errors
      } else {
        errors = this.errors
      }
    }
    errors.push(error)
    if (errors.length >= this.opts.errorLimit) {
      this.limitExceeded = true
      return true
    }
    return false
  }

  protected throw() {
    throw new ValidatorError(this.errors)
  }

  /**
   * Validates a value against the type definition.
   *
   * Acts as a TypeScript type guard — when it returns `true`, the value
   * is narrowed to `DataType`.
   *
   * @param value - The value to validate.
   * @param safe - If `true`, returns `false` on failure instead of throwing.
   * @returns `true` if the value matches the type definition.
   * @throws {ValidatorError} When validation fails and `safe` is not `true`.
   */
  public validate<TT = DataType>(value: any, safe?: boolean, context?: unknown): value is TT {
    this.errors = []
    this.stackErrors.length = 0
    this.depth = 0
    this.limitExceeded = false
    // Allocation-free pre-check (it performs the walk's 'strip' deletions itself); only when
    // a passing walk has no other observable side effects
    // (`skipList` and a `partial` callback see paths, so they always take the walk).
    if (
      this.shortcuts &&
      !this.opts.skipList &&
      typeof this.opts.partial !== 'function' &&
      fastCheckPasses(this.def, value, this.opts)
    ) {
      return true
    }
    this.context = context
    this.unionDepth = 0
    // (a walk that threw left its memo: never reused)
    this.unionMemo = undefined
    if (this.strips.length > 0) {
      // (a walk that threw left its strips: never performed)
      this.strips.length = 0
    }
    const passed = this.validateSafe(this.def, value)
    this.context = undefined
    if (this.unionMemo !== undefined) {
      // (made by this walk only once it wasted work: see `unionMemo`)
      this.unionMemo = undefined
    }
    if (this.strips.length > 0) {
      // 'strip' deletes only when the whole value passed
      performStrips(this.strips, passed)
    }
    if (!passed) {
      if (this.opts.translate) {
        this.errors = localizeErrors(this.errors, this.opts.translate)
      }
      if (safe) {
        return false
      }
      this.throw()
    }
    return true
  }

  /**
   * Plain `Validator` without plugins / `replace`: eligible for the allocation-free
   * shortcuts. Subclasses may override the protected `validate*` hooks, so they
   * always take the full walk. (A getter, not a constructor-set field: validators are
   * often built per call, so construction stays as cheap as before.)
   */
  private get shortcuts(): boolean {
    return this.constructor === Validator && !this.hasPlugins && !this.hasReplace
  }

  /** Validates `value` against `def` (after `replace`, `optional` and the plugins). */
  protected validateSafe(def: TAtscriptAnnotatedType, value: any): boolean {
    // (as small as in 0.1.110, the engine inlines it in every walk step: the rest is apart)
    if (this.limitExceeded) {
      return false
    }
    if (this.hasReplace) {
      def = this.replaced(def)
    }
    if (def.optional && (value === undefined || value === null)) {
      // `@meta.required` on an optional field: omitting it is fine, `null` is not
      // (unless the type itself accepts null, e.g. `string | null`).
      if (value === null && rejectsNullAsRequired(def)) {
        return this.required(def)
      }
      return true
    }
    if (this.hasPlugins) {
      const decided = this.preCheck(def, value)
      if (decided !== undefined) {
        return decided
      }
    }
    return this.validateAnnotatedType(def, value)
  }

  /**
   * What {@link validateSafe} decides of `def` (replaced) before its own validation: an
   * optional `def` passes `undefined` / `null`, a plugin may decide — `undefined` to go on.
   */
  private preCheck(def: TAtscriptAnnotatedType, value: any): boolean | undefined {
    if (def.optional && (value === undefined || value === null)) {
      // `@meta.required` on an optional field: omitting it is fine, `null` is not
      // (unless the type itself accepts null, e.g. `string | null`).
      if (value === null && rejectsNullAsRequired(def)) {
        return this.required(def)
      }
      return true
    }
    if (this.hasPlugins) {
      const ctx = (this.pluginCtx ??= this.pluginContext())
      for (const plugin of this.opts.plugins) {
        const result = plugin(ctx, def, value)
        if (result === false || result === true) {
          return result
        }
      }
    }
    return undefined
  }

  /** The context the plugins get (see {@link pluginContext}), made on the first plugin call. */
  private pluginCtx?: TValidatorPluginContext

  /**
   * The plugins' view of this validator: its state read live; `validateAnnotatedType` drops the
   * strips a failed call recorded (a failed validation at any level strips nothing).
   */
  private pluginContext(): TValidatorPluginContext {
    const ctx = {
      validateAnnotatedType: (def: TAtscriptAnnotatedType, value: unknown): boolean => {
        const kept = this.strips.length
        const passed = this.validateAnnotatedType(def, value)
        if (!passed && this.strips.length !== kept) {
          this.strips.length = kept
        }
        return passed
      },
      error: (message: string, path?: string, details?: TError[], info?: TErrorInfo) =>
        this.error(message, path, details, info),
    } as TValidatorPluginContext
    return Object.defineProperties(ctx, {
      opts: { get: () => this.opts, enumerable: true },
      path: { get: () => this.path, enumerable: true },
      root: { get: () => this.root, enumerable: true },
      context: {
        get: () => this.context,
        set: (context: unknown) => {
          this.context = context
        },
        enumerable: true,
      },
    })
  }

  /** `def` as the `replace` option replaces it at the current path (memoized per node). */
  private replaced(def: TAtscriptAnnotatedType): TAtscriptAnnotatedType {
    let replaced = this.replaceCache!.get(def)
    if (replaced === undefined) {
      replaced = this.opts.replace!(def, this.buildPath())
      this.replaceCache!.set(def, replaced)
    }
    return replaced
  }

  protected get path() {
    return this.buildPath()
  }

  /** The type this validator was created for (see {@link TValidatorPluginContext.root}). */
  protected get root(): T {
    return this.def
  }

  protected validateAnnotatedType(def: TAtscriptAnnotatedType, value: any) {
    switch (def.type.kind) {
      case '': {
        if (def.type.designType === 'phantom') {
          return true
        }
        return this.validatePrimitive(def as TAtscriptAnnotatedType<TAtscriptTypeFinal>, value)
      }
      case 'object': {
        return this.validateObject(def as TAtscriptAnnotatedType<TAtscriptTypeObject>, value)
      }
      case 'array': {
        return this.validateArray(def as TAtscriptAnnotatedType<TAtscriptTypeArray>, value)
      }
      case 'union': {
        return this.validateUnion(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>, value)
      }
      case 'intersection': {
        return this.validateIntersection(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>, value)
      }
      case 'tuple': {
        return this.validateTuple(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>, value)
      }
      default: {
        throw new Error(`Unknown type kind "${(def.type as { kind: string }).kind}"`)
      }
    }
  }

  protected validateUnion(def: TAtscriptAnnotatedType<TAtscriptTypeComplex>, value: any): boolean {
    const items = def.type.items
    if (this.shortcuts) {
      // Literal-branch (enum) shortcut: when the value equals a literal and every earlier
      // branch is a plain literal, the walk would only record and then discard
      // literal-mismatch errors before accepting it. Anything else falls through to the
      // loop below, so errors are produced exactly as before.
      for (const item of items) {
        const type = item.type as TAtscriptTypeFinal
        if (
          item.optional ||
          type.kind !== '' ||
          type.value === undefined ||
          type.designType === 'phantom'
        ) {
          break
        }
        if (type.value === value) {
          return true
        }
      }
    }
    // (one union over an object inside a union branch is `nested`: its failed branches count, and
    // once the call made the memo it is decided once per value and path — `path` set: see
    // `unionMemo`)
    let nested = false
    let path: string | undefined
    if (this.unionDepth > 0) {
      if (typeof value === 'object' && value !== null) {
        if (this.unionMemo !== undefined) {
          path = this.buildPath()
          const known = this.decided(def, value, path)
          if (known !== undefined) {
            if (known.errors === undefined) {
              stripAgain(this.strips, known.strips)
              return this.validateUnionConstraints(def, known.item!, value)
            }
            this.reportAll(known.errors)
            return false
          }
        }
        nested = true
      }
    } else {
      // The outermost union: a new waste window (see `unionMemo`).
      this.wasted = 0
    }
    // (a rejected branch strips nothing: what it recorded is dropped)
    const kept = this.strips.length
    let details: TError[] | undefined
    /**
     * Where each failed branch's errors start in `details` (by branch index): plain object
     * values only, the ones a discriminator can report (see `discriminatedErrors`).
     */
    let starts: number[] | undefined
    const plainObject = typeof value === 'object' && value !== null && !Array.isArray(value)

    for (const item of items) {
      // Use stackErrors for error isolation only — no depth/path tracking.
      // Branch sub-errors get paths relative to the parent (e.g. "payment.number"
      // instead of "payment.[object(0)].number"), which is cleaner since they're
      // already grouped in the details array.
      this.stackErrors.push(null)
      const failures = this.nestedFailures
      this.unionDepth++
      const passed = this.validateSafe(item, value)
      this.unionDepth--

      if (passed) {
        this.stackErrors.pop()
        if (path !== undefined) {
          this.decide(def, value, path, kept, item, undefined)
        }
        return this.validateUnionConstraints(def, item, value)
      }

      if (this.strips.length !== kept) {
        this.strips.length = kept
      }
      const branchErrors = this.stackErrors.pop()
      // Reset limit flag — discarded branch errors don't count toward the limit
      if (this.limitExceeded) {
        this.limitExceeded = false
      }
      if (this.nestedFailures !== failures) {
        this.wasteBranch()
      }
      if (nested) {
        this.nestedFailures++
      }
      if (plainObject) {
        ;(starts ??= []).push(details?.length ?? 0)
      }
      if (branchErrors) {
        if (details) {
          for (const err of branchErrors) {
            details.push(err)
          }
        } else {
          details = branchErrors
        }
      }
    }

    // (all of them: an outcome decided once — see `unionMemo` — is one error object wherever it
    // is reported, so details of unions nested in their own branches share their errors)
    const errors =
      this.discriminatedErrors(def, value, details, starts ?? []) ?? this.unionError(def, details)
    if (path !== undefined) {
      this.decide(def, value, path, kept, undefined, errors)
    }
    return false
  }

  /** Reports the error of union `def` no branch matched (`details`: the branches' errors). */
  private unionError(
    def: TAtscriptAnnotatedType<TAtscriptTypeComplex>,
    details: TError[] | undefined
  ): TError[] {
    const expected = def.type.items
      .map((item, i) => `[${item.type.kind || (item.type as TAtscriptTypeFinal).designType}(${i})]`)
      .join(', ')
    return [this.builtin('UNION', { expected }, expectMessage(def), undefined, details)]
  }

  /**
   * The errors of an object union over object `value` with a shared literal discriminator (see
   * {@link unionDiscriminator}), reported in place of the union error: the errors of the branch
   * the value's discriminator picks, or one `UNION_DISCRIMINATOR` error at the discriminator
   * when it picks none. `undefined` (nothing reported) for other unions and values.
   */
  private discriminatedErrors(
    def: TAtscriptAnnotatedType<TAtscriptTypeComplex>,
    value: unknown,
    details: TError[] | undefined,
    starts: number[]
  ): TError[] | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined
    }
    const disc = unionDiscriminator(def.type.items)
    if (disc === undefined) {
      return undefined
    }
    const tag = (value as Record<string, unknown>)[disc.property]
    if (tag === undefined && this.partialHere()) {
      // (a missing discriminator is allowed here: the union error, with every branch's errors)
      return undefined
    }
    const picked = disc.branches.findIndex(([, literal]) => literal === tag)
    if (picked < 0) {
      const params = {
        property: disc.property,
        allowed: disc.branches.map(([, literal]) => literal),
        actual: clip(printValue(tag)),
      }
      const at = this.depth > 0 ? `${this.buildPath()}.${disc.property}` : disc.property
      return [this.builtin('UNION_DISCRIMINATOR', params, expectMessage(def), at)]
    }
    const index = disc.branches[picked][0]
    const errors = details?.slice(starts[index], starts[index + 1] ?? details.length)
    if (errors === undefined || errors.length === 0) {
      // (a branch that failed without errors, a plugin's verdict: the plain union error)
      return undefined
    }
    this.reportAll(errors)
    return errors
  }

  /** Reports `errors`, made already, until the error limit is reached. */
  private reportAll(errors: TError[]) {
    for (const error of errors) {
      if (this.report(error)) {
        break
      }
    }
  }

  /** Whether missing props are allowed at the current depth (the `partial` option). */
  private partialHere(): boolean {
    const partial = this.opts.partial
    return (
      partial === 'deep' || (partial === true && this.depth === 0) || typeof partial === 'function'
    )
  }

  /** A union branch failed after branches of nested unions over objects did (see `unionMemo`). */
  private wasteBranch() {
    if (++this.wasted === WASTE_BEFORE_MEMO && this.unionMemo === undefined) {
      this.unionMemo = new Map()
    }
  }

  /** The outcome this call recorded for union `def` over `value` at `path` (see `unionMemo`). */
  private decided(
    def: TAtscriptAnnotatedType,
    value: object,
    path: string
  ): TUnionOutcome | undefined {
    const outcomes = this.unionMemo!.get(value)
    if (outcomes !== undefined) {
      const { unknownProps } = this.opts
      for (const outcome of outcomes) {
        if (outcome.def === def && outcome.path === path && outcome.unknownProps === unknownProps) {
          return outcome
        }
      }
    }
    return undefined
  }

  /**
   * Records the outcome of union `def` over `value` at `path`, entered with `kept` strips (the
   * ones after them are its own).
   */
  private decide(
    def: TAtscriptAnnotatedType,
    value: object,
    path: string,
    kept: number,
    item: TAtscriptAnnotatedType | undefined,
    errors: TError[] | undefined
  ) {
    const outcome: TUnionOutcome = {
      def,
      path,
      unknownProps: this.opts.unknownProps,
      item,
      errors,
      strips: stripsSince(this.strips, kept),
    }
    const outcomes = this.unionMemo!.get(value)
    if (outcomes === undefined) {
      this.unionMemo!.set(value, [outcome])
    } else {
      outcomes.push(outcome)
    }
  }

  /**
   * Constraints annotated on the union itself (`@expect.min 0` on `number | null`)
   * apply to the non-null value that matched `branch`, on top of the branch's own.
   * A literal branch (an enum value) is exempt: its value is fixed.
   */
  protected validateUnionConstraints(
    def: TAtscriptAnnotatedType<TAtscriptTypeComplex>,
    branch: TAtscriptAnnotatedType,
    value: any
  ): boolean {
    const metadata = def.metadata
    if (metaEmpty(metadata) || (branch.type as TAtscriptTypeFinal).value !== undefined) {
      return true
    }
    switch (typeof value) {
      case 'string': {
        return this.validateStringConstraints(metadata, value)
      }
      case 'number': {
        return this.validateNumberConstraints(metadata, value)
      }
      case 'boolean': {
        return this.validateBooleanConstraints(metadata, value)
      }
      case 'object': {
        if (Array.isArray(value)) {
          return this.validateArrayConstraints(metadata, value, arrayElementType(branch))
        }
        return (
          value === null ||
          this.validateObjectConstraints(metadata, value, branch, this.skipListHere())
        )
      }
      default: {
        return true
      }
    }
  }

  /** Every member must pass, each on its own (JSON Schema `allOf`). */
  protected validateIntersection(
    def: TAtscriptAnnotatedType<TAtscriptTypeComplex>,
    value: any
  ): boolean {
    for (const item of def.type.items) {
      if (!this.validateSafe(item, value)) {
        return false
      }
    }
    return true
  }

  /**
   * An unknown key (`unknownProps`): 'error' reports it, 'strip' adds it to the keys to strip
   * (returned; recorded in `strips` once the object passed).
   */
  private unknownKey(key: string, keysToStrip: string[] | undefined): string[] | undefined {
    if (this.opts.unknownProps === 'error') {
      this.push(key)
      this.fail('UNEXPECTED_PROPERTY', { property: clip(key) })
      this.pop(true)
    } else if (this.opts.unknownProps === 'strip') {
      ;(keysToStrip ??= []).push(key)
    }
    return keysToStrip
  }

  /** The `skipList` keys of the object at the current path. */
  private skipListHere(): Set<string> | undefined {
    if (!this.opts.skipList) {
      return undefined
    }
    let skipList: Set<string> | undefined
    const path = this.depth > 0 ? `${this.buildPath()}.` : ''
    for (const item of this.opts.skipList) {
      if (item.startsWith(path)) {
        ;(skipList ??= new Set()).add(item.slice(path.length))
      }
    }
    return skipList
  }

  protected validateTuple(def: TAtscriptAnnotatedType<TAtscriptTypeComplex>, value: any): boolean {
    if (!Array.isArray(value) || value.length !== def.type.items.length) {
      return this.mismatch(def, 'TUPLE_LENGTH', { length: def.type.items.length })
    }
    let i = 0
    for (const item of def.type.items) {
      this.push(String(i))
      if (!this.validateSafe(item, value[i])) {
        this.pop(true)
        return false
      }
      this.pop(false)
      i++
    }
    return true
  }

  protected validateArray(def: TAtscriptAnnotatedType<TAtscriptTypeArray>, value: any): boolean {
    if (!Array.isArray(value)) {
      return this.mismatch(def, 'TYPE_ARRAY', { actual: typeOf(value) })
    }
    if (
      !metaEmpty(def.metadata) &&
      !this.validateArrayConstraints(def.metadata, value, def.type.of)
    ) {
      return false
    }
    let i = 0
    let passed = true
    for (const item of value) {
      this.push(String(i))
      if (!this.validateSafe(def.type.of, item)) {
        passed = false
        this.pop(true)
        if (this.limitExceeded) {
          return false
        }
      } else {
        this.pop(false)
      }
      i++
    }
    return passed
  }

  /** `@expect.minLength` / `maxLength` / `array.uniqueItems` checks for an array value. */
  protected validateArrayConstraints(
    meta: TMetadataMap<AtscriptMetadata>,
    value: any[],
    of?: TAtscriptAnnotatedType
  ): boolean {
    const metadata = readable(meta)
    const minLength = metadata.get('expect.minLength')
    if (minLength !== undefined) {
      const length = boundOf(minLength, 'length')
      if (value.length < length) {
        return this.fail('MIN_ITEMS', { min: length, actual: value.length }, messageOf(minLength))
      }
    }
    const maxLength = metadata.get('expect.maxLength')
    if (maxLength !== undefined) {
      const length = boundOf(maxLength, 'length')
      if (value.length > length) {
        return this.fail('MAX_ITEMS', { max: length, actual: value.length }, messageOf(maxLength))
      }
    }
    const uniqueItems = metadata.get('expect.array.uniqueItems')
    if (uniqueItems) {
      const separator = '▼↩'
      const seen = new Set<string>()
      const keyProps = arrayKeyProps(of)
      for (let idx = 0; idx < value.length; idx++) {
        const item = value[idx]
        let key: string
        if (keyProps.length > 0) {
          key = ''
          for (const prop of keyProps) {
            key += JSON.stringify(item[prop]) + separator
          }
        } else {
          key = JSON.stringify(item)
        }
        if (seen.has(key)) {
          this.push(String(idx))
          this.fail('UNIQUE_ITEMS', {}, messageOf(uniqueItems))
          this.pop(true)
          return false
        }
        seen.add(key)
      }
    }
    return true
  }

  protected validateObject(def: TAtscriptAnnotatedType<TAtscriptTypeObject>, value: any): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return this.mismatch(def, 'TYPE_OBJECT', { actual: typeOf(value) })
    }
    // prepare skipList for this object (rare)
    const skipList = this.opts.skipList ? this.skipListHere() : undefined
    let passed = true
    if (!this.validateObjectConstraints(def.metadata, value, def, skipList)) {
      // (the props are still checked: their errors are reported too)
      if (this.limitExceeded) {
        return false
      }
      passed = false
    }
    let keysToStrip: string[] | undefined

    let partialFunctionMatched = false
    if (typeof this.opts.partial === 'function') {
      partialFunctionMatched = this.opts.partial(def, this.buildPath())
    }

    for (const [key, item] of def.type.props.entries()) {
      if ((skipList && skipList.has(key)) || isPhantomType(item)) {
        continue
      }
      if (value[key] === undefined) {
        if (
          partialFunctionMatched ||
          this.opts.partial === 'deep' ||
          (this.opts.partial === true && this.depth === 0)
        ) {
          continue
        }
      }
      this.push(key)
      if (this.validateSafe(item, value[key])) {
        this.pop(false)
      } else {
        passed = false
        this.pop(true)
        if (this.limitExceeded) {
          return false
        }
      }
    }

    // Handle unknown props — skip entirely when ignoring and no patterns
    const hasPatterns = def.type.propsPatterns.length > 0
    if (this.opts.unknownProps !== 'ignore' || hasPatterns) {
      const keys = Object.keys(value)
      for (const key of keys) {
        if (skipList && skipList.has(key)) {
          continue
        }
        const knownProp = def.type.props.get(key)
        if (knownProp && !isPhantomType(knownProp)) {
          continue
        }
        // key is unknown
        const matched: typeof def.type.propsPatterns = []
        for (const { pattern, def: propDef } of def.type.propsPatterns) {
          if (pattern.test(key)) {
            matched.push({ pattern, def: propDef })
          }
        }
        if (matched.length > 0) {
          this.push(key)
          let keyPassed = false
          // (a failed attempt strips nothing: what it recorded is dropped)
          const kept = this.strips.length
          for (const { def: propDef } of matched) {
            if (this.validateSafe(propDef, value[key])) {
              keyPassed = true
              break
            }
            if (this.strips.length !== kept) {
              this.strips.length = kept
            }
            this.clear()
          }
          if (!keyPassed) {
            this.validateSafe(matched[0].def, value[key])
            this.pop(true)
            passed = false
            if (this.limitExceeded) {
              return false
            }
          } else {
            this.pop(false)
          }
        } else {
          keysToStrip = this.unknownKey(key, keysToStrip)
          if (this.opts.unknownProps === 'error') {
            if (this.limitExceeded) {
              return false
            }
            passed = false
          }
        }
      }
    }
    if (passed && keysToStrip !== undefined) {
      // (after the strips the pattern props' values recorded: this object completes last)
      for (const key of keysToStrip) {
        this.strips.push(value, key)
      }
    }
    return passed
  }

  protected validatePrimitive(
    def: TAtscriptAnnotatedType<TAtscriptTypeFinal>,
    value: any
  ): boolean {
    if (def.type.value !== undefined) {
      if (value !== def.type.value) {
        return this.mismatch(def, 'LITERAL', {
          expected: def.type.value,
          actual: clip(printValue(value)),
        })
      }
      return true
    }
    const typeOfValue = typeOf(value)
    const designType = def.type.designType
    switch (designType) {
      case 'never': {
        return this.fail('NEVER', {})
      }
      case 'any': {
        return true
      }
      case 'string': {
        if (typeOfValue !== designType) {
          return this.mismatch(def, 'TYPE', { expected: designType, actual: typeOfValue })
        }
        return this.validateString(def, value)
      }
      case 'number': {
        if (typeOfValue !== designType) {
          return this.mismatch(def, 'TYPE', { expected: designType, actual: typeOfValue })
        }
        if (!Number.isFinite(value)) {
          return this.mismatch(def, 'NOT_FINITE', { actual: String(value) })
        }
        return this.validateNumber(def, value)
      }
      case 'boolean': {
        if (typeOfValue !== designType) {
          return this.mismatch(def, 'TYPE', { expected: designType, actual: typeOfValue })
        }
        return this.validateBoolean(def, value)
      }
      case 'undefined': {
        if (value !== undefined) {
          return this.mismatch(def, 'TYPE', { expected: designType, actual: typeOfValue })
        }
        return true
      }
      case 'null': {
        if (value !== null) {
          return this.mismatch(def, 'TYPE', { expected: designType, actual: typeOfValue })
        }
        return true
      }
      case 'decimal': {
        if (typeOfValue !== 'string') {
          return this.mismatch(def, 'TYPE_DECIMAL', { actual: typeOfValue })
        }
        if (!DECIMAL_RE.test(value as string)) {
          return this.mismatch(def, 'DECIMAL_FORMAT', { value: clip(value as string) })
        }
        return true
      }
      default: {
        throw new Error(`Unknown type "${designType}"`)
      }
    }
  }

  protected validateString(
    def: TAtscriptAnnotatedType<TAtscriptTypeFinal>,
    value: string
  ): boolean {
    return this.validateStringConstraints(def.metadata, value)
  }

  /** `@meta.required` / `@expect.minLength` / `maxLength` / `pattern` checks for a string value. */
  protected validateStringConstraints(
    meta: TMetadataMap<AtscriptMetadata>,
    value: string
  ): boolean {
    const metadata = filledMeta(meta)
    if (metadata === undefined) {
      return true
    }
    const filled = metadata.get('meta.required')
    if (filled) {
      if (value.trim().length === 0) {
        return this.fail('REQUIRED', {}, messageOf(filled))
      }
    }
    const minLength = metadata.get('expect.minLength')
    if (minLength !== undefined) {
      const length = boundOf(minLength, 'length')
      if (value.length < length) {
        return this.fail('MIN_LENGTH', { min: length, actual: value.length }, messageOf(minLength))
      }
    }
    const maxLength = metadata.get('expect.maxLength')
    if (maxLength !== undefined) {
      const length = boundOf(maxLength, 'length')
      if (value.length > length) {
        return this.fail('MAX_LENGTH', { max: length, actual: value.length }, messageOf(maxLength))
      }
    }
    const patterns = metadata.get('expect.pattern')
    for (const { pattern, flags, message } of patterns || []) {
      if (!pattern) {
        continue
      }
      if (!getRegex(pattern, flags).test(value)) {
        // (a primitive's built-in format message — `string.email`'s — has a code of its own,
        // its params none: the regex is the primitive's)
        const format = message ? formatCodeOf(message) : undefined
        return format === undefined
          ? this.fail('PATTERN', flags ? { pattern, flags } : { pattern }, message)
          : this.fail(format, {})
      }
    }

    return true
  }

  protected validateNumber(
    def: TAtscriptAnnotatedType<TAtscriptTypeFinal>,
    value: number
  ): boolean {
    return this.validateNumberConstraints(def.metadata, value)
  }

  /** `@expect.int` / `min` / `max` / `exclusiveMin` / `exclusiveMax` checks for a number value. */
  protected validateNumberConstraints(
    meta: TMetadataMap<AtscriptMetadata>,
    value: number
  ): boolean {
    const metadata = filledMeta(meta)
    if (metadata === undefined) {
      return true
    }
    const int = metadata.get('expect.int') as boolean | { message?: string }
    if (int && value % 1 !== 0) {
      return this.fail('INT', { actual: value }, messageOf(int))
    }
    const min = metadata.get('expect.min')
    if (min !== undefined) {
      const bound = boundOf(min, 'minValue')
      if (value < bound) {
        return this.fail('MIN', { min: bound, actual: value }, messageOf(min))
      }
    }
    const max = metadata.get('expect.max')
    if (max !== undefined) {
      const bound = boundOf(max, 'maxValue')
      if (value > bound) {
        return this.fail('MAX', { max: bound, actual: value }, messageOf(max))
      }
    }
    const exMin = metadata.get('expect.exclusiveMin')
    if (exMin !== undefined) {
      const bound = boundOf(exMin, 'exclusiveMinValue')
      if (value <= bound) {
        return this.fail('EXCLUSIVE_MIN', { min: bound, actual: value }, messageOf(exMin))
      }
    }
    const exMax = metadata.get('expect.exclusiveMax')
    if (exMax !== undefined) {
      const bound = boundOf(exMax, 'exclusiveMaxValue')
      if (value >= bound) {
        return this.fail('EXCLUSIVE_MAX', { max: bound, actual: value }, messageOf(exMax))
      }
    }
    return true
  }

  protected validateBoolean(
    def: TAtscriptAnnotatedType<TAtscriptTypeFinal>,
    value: boolean
  ): boolean {
    return this.validateBooleanConstraints(def.metadata, value)
  }

  /** `@meta.required` check for a boolean value (must be `true`). */
  protected validateBooleanConstraints(
    meta: TMetadataMap<AtscriptMetadata>,
    value: boolean
  ): boolean {
    const metadata = filledMeta(meta)
    if (metadata === undefined) {
      return true
    }
    const filled = metadata.get('meta.required')
    if (filled) {
      if (value !== true) {
        return this.fail('REQUIRED_CHECKED', {}, messageOf(filled))
      }
    }
    return true
  }

  /**
   * `@expect.minKeys` / `maxKeys` checks for an object value, matched as `shape`: the keys the
   * result keeps are counted (see {@link keptKeyCount}; `skipList`: the skip list keys here).
   */
  protected validateObjectConstraints(
    meta: TMetadataMap<AtscriptMetadata>,
    value: object,
    shape: TAtscriptAnnotatedType,
    skipList: Set<string> | undefined
  ): boolean {
    const metadata = filledMeta(meta)
    if (metadata === undefined) {
      return true
    }
    const minKeys = metadata.get('expect.minKeys')
    const maxKeys = metadata.get('expect.maxKeys')
    if (minKeys === undefined && maxKeys === undefined) {
      return true
    }
    const count = this.keptKeyCount(shape, value, skipList)
    if (minKeys !== undefined) {
      const bound = boundOf(minKeys, 'count')
      if (count < bound) {
        return this.fail('MIN_KEYS', { min: bound, actual: count }, messageOf(minKeys))
      }
    }
    if (maxKeys !== undefined) {
      const bound = boundOf(maxKeys, 'count')
      if (count > bound) {
        return this.fail('MAX_KEYS', { max: bound, actual: count }, messageOf(maxKeys))
      }
    }
    return true
  }

  /**
   * The keys of object `value` (matched as `shape`) the result keeps: every own key with
   * `unknownProps: 'ignore'`; else (and with 'strip', and 'error', where the others are errors
   * of their own) the keys `shape` declares, its pattern props match or the skip list names.
   * Matched as anything other than an object type, every own key.
   */
  private keptKeyCount(
    shape: TAtscriptAnnotatedType,
    value: object,
    skipList: Set<string> | undefined
  ): number {
    const keys = Object.keys(value)
    if (this.opts.unknownProps === 'ignore' || shape.type.kind !== 'object') {
      return keys.length
    }
    const type = shape.type as TAtscriptTypeObject
    let count = 0
    for (const key of keys) {
      const prop = type.props.get(key)
      if ((prop !== undefined && !isPhantomType(prop)) || skipList?.has(key)) {
        count++
        continue
      }
      for (const { pattern } of type.propsPatterns) {
        if (pattern.test(key)) {
          count++
          break
        }
      }
    }
    return count
  }
}

/** The message argument of a constraint annotation (`{ message }`), if any. */
function messageOf(annotation: unknown): string | undefined {
  return typeof annotation === 'object' && annotation !== null
    ? (annotation as { message?: string }).message || undefined
    : undefined
}

/** A union's discriminator, as the validator reports it (see {@link unionDiscriminator}). */
interface TValidatorDiscriminator {
  property: string
  /** Per object branch: its index in the union's items, its literal. */
  branches: Array<[index: number, literal: unknown]>
}

/** {@link unionDiscriminator} by union items, with what it was decided from (see `discCache`). */
interface TDiscEntry {
  nodes: TAtscriptAnnotatedType[]
  types: unknown[]
  /** Per object branch: its discriminator prop node (verified on a reuse). */
  props: Array<TAtscriptAnnotatedType | undefined>
  disc: TValidatorDiscriminator | undefined
}

/**
 * Decided discriminators, by union `items` (reported errors only: a union's discriminator is
 * looked for once its value failed). An entry is reused while the items, their type defs and the
 * discriminator props are the same objects.
 */
const discCache = new WeakMap<TAtscriptAnnotatedType[], TDiscEntry>()

/**
 * The discriminator of a union over objects (see {@link detectDiscriminator}), required in every
 * object branch: the property and, per object branch, its index in `items` and its literal. The
 * other branches must reject any object (scalars, arrays, tuples), so only the object branches
 * can match an object value.
 */
function unionDiscriminator(items: TAtscriptAnnotatedType[]): TValidatorDiscriminator | undefined {
  const cached = discCache.get(items)
  if (cached !== undefined && sameDiscSource(cached, items)) {
    return cached.disc
  }
  const entry: TDiscEntry = {
    nodes: [...items],
    types: items.map(item => item.type),
    props: [],
    disc: findDiscriminator(items),
  }
  if (entry.disc !== undefined) {
    const property = entry.disc.property
    entry.props = entry.disc.branches.map(([i]) =>
      (items[i].type as TAtscriptTypeObject).props.get(property)
    )
  }
  discCache.set(items, entry)
  return entry.disc
}

/** Whether `entry` was decided from `items` as they are. */
function sameDiscSource(entry: TDiscEntry, items: TAtscriptAnnotatedType[]): boolean {
  if (entry.nodes.length !== items.length) {
    return false
  }
  for (let i = 0; i < items.length; i++) {
    if (entry.nodes[i] !== items[i] || entry.types[i] !== items[i].type) {
      return false
    }
  }
  const disc = entry.disc
  if (disc !== undefined) {
    const branches = disc.branches
    for (let j = 0; j < branches.length; j++) {
      const type = items[branches[j][0]].type as TAtscriptTypeObject
      if (type.props.get(disc.property) !== entry.props[j]) {
        return false
      }
    }
  }
  return true
}

/** {@link unionDiscriminator}, decided anew. */
function findDiscriminator(items: TAtscriptAnnotatedType[]): TValidatorDiscriminator | undefined {
  const objects: TAtscriptAnnotatedType[] = []
  const indexes: number[] = []
  for (const [i, item] of items.entries()) {
    const type = item.type
    if (type.kind === 'object') {
      objects.push(item)
      indexes.push(i)
    } else if (
      type.kind !== 'array' &&
      type.kind !== 'tuple' &&
      (type.kind !== '' || (type as TAtscriptTypeFinal).designType === 'any' || isPhantomType(item))
    ) {
      return undefined
    }
  }
  const disc = detectDiscriminator(objects)
  if (!disc) {
    return undefined
  }
  const property = disc.propertyName
  const branches: TValidatorDiscriminator['branches'] = []
  for (const [j, item] of objects.entries()) {
    const prop = (item.type as TAtscriptTypeObject).props.get(property)
    if (prop === undefined || prop.optional) {
      // (an optional discriminator does not tell the branch of a value without it)
      return undefined
    }
    branches.push([indexes[j], (prop.type as TAtscriptTypeFinal).value])
  }
  return { property, branches }
}

/** The most characters of input copied into params (see {@link clip}). */
const CLIP = 100

/** Input copied into params: at most {@link CLIP} characters (then an ellipsis). */
function clip(text: string): string {
  return text.length > CLIP ? `${text.slice(0, CLIP)}…` : text
}

/** `def`'s `@expect.message` (the message of its type mismatches), if any. */
function expectMessage(def: TAtscriptAnnotatedType): string | undefined {
  return (def.metadata.get('expect.message') as string | undefined) || undefined
}

/** The type name an error reports for `value` (`array` for arrays, else `typeof`). */
function typeOf(value: unknown): string {
  return Array.isArray(value) ? 'array' : typeof value
}

/**
 * Element type of the array a union branch holds — through nested unions too
 * (`Items | undefined` with `type Items = Item[] | null`), so `@expect.array.key`
 * fields of the elements are found.
 */
function arrayElementType(branch: TAtscriptAnnotatedType): TAtscriptAnnotatedType | undefined {
  const type = branch.type
  if (type.kind === 'array') {
    return (type as TAtscriptTypeArray).of
  }
  if (type.kind === 'union') {
    for (const item of (type as TAtscriptTypeComplex).items) {
      const of = arrayElementType(item)
      if (of) {
        return of
      }
    }
  }
  return undefined
}

/** `${value}` throws for symbols and null-prototype objects: `String()` handles symbols, the tag the rest. */
function printValue(value: unknown): string {
  try {
    return String(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/** Error thrown by {@link Validator.validate} when validation fails. Contains structured error details. */
export class ValidatorError extends Error {
  name = 'Validation Error'
  constructor(public readonly errors: TError[]) {
    // oxlint-disable-next-line prefer-template
    super(`${errors[0].path ? errors[0].path + ': ' : ''}${errors[0].message}`)
  }
}
