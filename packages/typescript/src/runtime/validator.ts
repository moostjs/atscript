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
import {
  DECIMAL_RE,
  fastCheckPasses,
  getRegex,
  rejectsNullAsRequired,
} from './validator-fast-check'

interface TError {
  path: string
  message: string
  details?: TError[]
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
}

/** Context exposed to {@link TValidatorPlugin} functions. */
export interface TValidatorPluginContext {
  opts: Validator<any>['opts']
  validateAnnotatedType: Validator<any>['validateAnnotatedType']
  error: Validator<any>['error']
  path: Validator<any>['path']
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
    if (saveErrors && popped !== null && popped !== undefined && popped.length > 0) {
      for (const err of popped) {
        this.error(err.message, err.path, err.details)
      }
    }
    return popped
  }

  protected clear() {
    this.stackErrors[this.stackErrors.length - 1] = null
    if (this.limitExceeded) {
      this.limitExceeded = false
    }
  }

  protected error(message: string, path?: string, details?: TError[]) {
    let errors = this.stackErrors[this.stackErrors.length - 1]
    if (!errors) {
      if (this.stackErrors.length > 0) {
        errors = []
        this.stackErrors[this.stackErrors.length - 1] = errors
      } else {
        errors = this.errors
      }
    }
    const error: TError = {
      path: path || this.buildPath(),
      message,
    }
    if (details?.length) {
      error.details = details
    }
    errors.push(error)
    if (errors.length >= this.opts.errorLimit) {
      this.limitExceeded = true
    }
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
    // Allocation-free pre-check; only when a passing walk has no observable side effects
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
    const passed = this.validateSafe(this.def, value)
    this.context = undefined
    if (!passed) {
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

  protected validateSafe(def: TAtscriptAnnotatedType, value: any): boolean {
    if (this.limitExceeded) {
      return false
    }
    if (this.hasReplace) {
      let replaced = this.replaceCache!.get(def)
      if (replaced === undefined) {
        replaced = this.opts.replace!(def, this.buildPath())
        this.replaceCache!.set(def, replaced)
      }
      def = replaced
    }
    if (def.optional && (value === undefined || value === null)) {
      // `@meta.required` on an optional field: omitting it is fine, `null` is not
      // (unless the type itself accepts null, e.g. `string | null`).
      if (value === null && rejectsNullAsRequired(def)) {
        this.error(requiredMessage(def))
        return false
      }
      return true
    }
    if (this.hasPlugins) {
      for (const plugin of this.opts.plugins) {
        const result = plugin(this as unknown as TValidatorPluginContext, def, value)
        if (result === false || result === true) {
          return result
        }
      }
    }
    return this.validateAnnotatedType(def, value)
  }

  protected get path() {
    return this.buildPath()
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
    let details: TError[] | undefined

    for (const item of items) {
      // Use stackErrors for error isolation only — no depth/path tracking.
      // Branch sub-errors get paths relative to the parent (e.g. "payment.number"
      // instead of "payment.[object(0)].number"), which is cleaner since they're
      // already grouped in the details array.
      this.stackErrors.push(null)

      if (this.validateSafe(item, value)) {
        this.stackErrors.pop()
        return this.validateUnionConstraints(def, item, value)
      }

      const branchErrors = this.stackErrors.pop()
      // Reset limit flag — discarded branch errors don't count toward the limit
      if (this.limitExceeded) {
        this.limitExceeded = false
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

    const expected = items
      .map((item, i) => `[${item.type.kind || (item.type as TAtscriptTypeFinal).designType}(${i})]`)
      .join(', ')
    this.error(`Value does not match any of the allowed types: ${expected}`, undefined, details)
    return false
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
    if (metadata.size === 0 || (branch.type as TAtscriptTypeFinal).value !== undefined) {
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
        return true
      }
      default: {
        return true
      }
    }
  }

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

  protected validateTuple(def: TAtscriptAnnotatedType<TAtscriptTypeComplex>, value: any): boolean {
    if (!Array.isArray(value) || value.length !== def.type.items.length) {
      this.error(`Expected array of length ${def.type.items.length}`)
      return false
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
      this.error('Expected array')
      return false
    }
    if (def.metadata.size > 0 && !this.validateArrayConstraints(def.metadata, value, def.type.of)) {
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
    metadata: TMetadataMap<AtscriptMetadata>,
    value: any[],
    of?: TAtscriptAnnotatedType
  ): boolean {
    const minLength = metadata.get('expect.minLength')
    if (minLength !== undefined) {
      const length = typeof minLength === 'number' ? minLength : minLength.length
      if (value.length < length) {
        const message =
          typeof minLength === 'object' && minLength.message
            ? minLength.message
            : `Expected minimum length of ${length} items, got ${value.length} items`
        this.error(message)
        return false
      }
    }
    const maxLength = metadata.get('expect.maxLength')
    if (maxLength !== undefined) {
      const length = typeof maxLength === 'number' ? maxLength : maxLength.length
      if (value.length > length) {
        const message =
          typeof maxLength === 'object' && maxLength.message
            ? maxLength.message
            : `Expected maximum length of ${length} items, got ${value.length} items`
        this.error(message)
        return false
      }
    }
    const uniqueItems = metadata.get('expect.array.uniqueItems') as { message?: string } | undefined
    if (uniqueItems) {
      const separator = '▼↩'
      const seen = new Set<string>()
      const keyProps = new Set<string>()
      if (of?.type.kind === 'object') {
        for (const [key, val] of of.type.props.entries()) {
          if (val.metadata.get('expect.array.key')) {
            keyProps.add(key)
          }
        }
      }
      for (let idx = 0; idx < value.length; idx++) {
        const item = value[idx]
        let key: string
        if (keyProps.size > 0) {
          key = ''
          for (const prop of keyProps) {
            key += JSON.stringify(item[prop]) + separator
          }
        } else {
          key = JSON.stringify(item)
        }
        if (seen.has(key)) {
          this.push(String(idx))
          this.error(uniqueItems.message || 'Duplicate items are not allowed')
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
      this.error('Expected object')
      return false
    }
    let passed = true
    let keysToStrip: string[] | undefined

    // prepare skipList for this object (rare)
    let skipList: Set<string> | undefined
    if (this.opts.skipList) {
      const path = this.depth > 0 ? `${this.buildPath()}.` : ''
      for (const item of this.opts.skipList) {
        if (item.startsWith(path)) {
          const key = item.slice(path.length)
          if (!skipList) {
            skipList = new Set()
          }
          skipList.add(key)
        }
      }
    }

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
          for (const { def: propDef } of matched) {
            if (this.validateSafe(propDef, value[key])) {
              keyPassed = true
              break
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
        } else if (this.opts.unknownProps === 'error') {
          this.push(key)
          this.error(`Unexpected property`)
          this.pop(true)
          if (this.limitExceeded) {
            return false
          }
          passed = false
        } else if (this.opts.unknownProps === 'strip') {
          if (!keysToStrip) {
            keysToStrip = []
          }
          keysToStrip.push(key)
        }
      }
    }
    if (passed && keysToStrip) {
      for (const key of keysToStrip) {
        delete value[key]
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
        this.error(`Expected ${def.type.value}, got ${value}`)
        return false
      }
      return true
    }
    const typeOfValue = Array.isArray(value) ? 'array' : typeof value
    switch (def.type.designType) {
      case 'never': {
        this.error(`This type is impossible, must be an internal problem`)
        return false
      }
      case 'any': {
        return true
      }
      case 'string': {
        if (typeOfValue !== def.type.designType) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return this.validateString(def, value)
      }
      case 'number': {
        if (typeOfValue !== def.type.designType) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        if (!Number.isFinite(value)) {
          this.error(`Expected finite number, got ${value}`)
          return false
        }
        return this.validateNumber(def, value)
      }
      case 'boolean': {
        if (typeOfValue !== def.type.designType) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return this.validateBoolean(def, value)
      }
      case 'undefined': {
        if (value !== undefined) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return true
      }
      case 'null': {
        if (value !== null) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return true
      }
      case 'decimal': {
        if (typeOfValue !== 'string') {
          this.error(`Expected string (decimal), got ${typeOfValue}`)
          return false
        }
        if (!DECIMAL_RE.test(value as string)) {
          this.error(`Invalid decimal format: ${JSON.stringify(value)}`)
          return false
        }
        return true
      }
      default: {
        throw new Error(`Unknown type "${def.type.designType}"`)
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
    metadata: TMetadataMap<AtscriptMetadata>,
    value: string
  ): boolean {
    if (metadata.size === 0) {
      return true
    }
    const filled = metadata.get('meta.required')
    if (filled) {
      if (value.trim().length === 0) {
        const message =
          typeof filled === 'object' && filled.message ? filled.message : `Must not be empty`
        this.error(message)
        return false
      }
    }
    const minLength = metadata.get('expect.minLength')
    if (minLength !== undefined) {
      const length = typeof minLength === 'number' ? minLength : minLength.length
      if (value.length < length) {
        const message =
          typeof minLength === 'object' && minLength.message
            ? minLength.message
            : `Expected minimum length of ${length} characters, got ${value.length} characters`
        this.error(message)
        return false
      }
    }
    const maxLength = metadata.get('expect.maxLength')
    if (maxLength !== undefined) {
      const length = typeof maxLength === 'number' ? maxLength : maxLength.length
      if (value.length > length) {
        const message =
          typeof maxLength === 'object' && maxLength.message
            ? maxLength.message
            : `Expected maximum length of ${length} characters, got ${value.length} characters`
        this.error(message)
        return false
      }
    }
    const patterns = metadata.get('expect.pattern')
    for (const { pattern, flags, message } of patterns || []) {
      if (!pattern) {
        continue
      }
      if (!getRegex(pattern, flags).test(value)) {
        this.error(message || `Value is expected to match pattern "${pattern}"`)
        return false
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

  /** `@expect.int` / `min` / `max` checks for a number value. */
  protected validateNumberConstraints(
    metadata: TMetadataMap<AtscriptMetadata>,
    value: number
  ): boolean {
    if (metadata.size === 0) {
      return true
    }
    const int = metadata.get('expect.int') as boolean | { message?: string }
    if (int && value % 1 !== 0) {
      const message =
        typeof int === 'object' && int.message ? int.message : `Expected integer, got ${value}`
      this.error(message)
      return false
    }
    const min = metadata.get('expect.min')
    if (min !== undefined) {
      const minValue = typeof min === 'number' ? min : min.minValue
      if (value < minValue) {
        const message =
          typeof min === 'object' && min.message
            ? min.message
            : `Expected minimum ${minValue}, got ${value}`
        this.error(message)
        return false
      }
    }
    const max = metadata.get('expect.max')
    if (max !== undefined) {
      const maxValue = typeof max === 'number' ? max : max.maxValue
      if (value > maxValue) {
        const message =
          typeof max === 'object' && max.message
            ? max.message
            : `Expected maximum ${maxValue}, got ${value}`
        this.error(message)
        return false
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
    metadata: TMetadataMap<AtscriptMetadata>,
    value: boolean
  ): boolean {
    if (metadata.size === 0) {
      return true
    }
    const filled = metadata.get('meta.required')
    if (filled) {
      if (value !== true) {
        const message =
          typeof filled === 'object' && filled.message ? filled.message : `Must be checked`
        this.error(message)
        return false
      }
    }
    return true
  }
}

/** The `@meta.required` error message for `def` (custom message or the type's default). */
function requiredMessage(def: TAtscriptAnnotatedType): string {
  const filled = def.metadata.get('meta.required')
  if (typeof filled === 'object' && filled.message) {
    return filled.message
  }
  return def.type.kind === '' && (def.type as TAtscriptTypeFinal).designType === 'boolean'
    ? 'Must be checked'
    : 'Must not be empty'
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

/** Error thrown by {@link Validator.validate} when validation fails. Contains structured error details. */
export class ValidatorError extends Error {
  name = 'Validation Error'
  constructor(public readonly errors: TError[]) {
    // oxlint-disable-next-line prefer-template
    super(`${errors[0].path ? errors[0].path + ': ' : ''}${errors[0].message}`)
  }
}
