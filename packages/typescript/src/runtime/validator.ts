// oxlint-disable max-depth
// eslint-disable max-lines
import type {
  TAtscriptAnnotatedType,
  TAtscriptDataType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { isPhantomType } from './annotated-type'

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

const regexCache = new Map<string, RegExp>()

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
    let details: TError[] | undefined

    for (const item of items) {
      // Use stackErrors for error isolation only — no depth/path tracking.
      // Branch sub-errors get paths relative to the parent (e.g. "payment.number"
      // instead of "payment.[object(0)].number"), which is cleaner since they're
      // already grouped in the details array.
      this.stackErrors.push(null)

      if (this.validateSafe(item, value)) {
        this.stackErrors.pop()
        return true
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
    const minLength = def.metadata.get('expect.minLength')
    if (minLength) {
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
    const maxLength = def.metadata.get('expect.maxLength')
    if (maxLength) {
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
    const uniqueItems = def.metadata.get('expect.array.uniqueItems') as
      | { message?: string }
      | undefined
    if (uniqueItems) {
      const separator = '▼↩'
      const seen = new Set<string>()
      const keyProps = new Set<string>()
      if (def.type.of.type.kind === 'object') {
        for (const [key, val] of def.type.of.type.props.entries()) {
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
          if (!skipList) { skipList = new Set() }
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
    if (def.metadata.size === 0) {
      return true
    }
    const filled = def.metadata.get('meta.required')
    if (filled) {
      if (value.trim().length === 0) {
        const message =
          typeof filled === 'object' && filled.message ? filled.message : `Must not be empty`
        this.error(message)
        return false
      }
    }
    const minLength = def.metadata.get('expect.minLength')
    if (minLength) {
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
    const maxLength = def.metadata.get('expect.maxLength')
    if (maxLength) {
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
    const patterns = def.metadata.get('expect.pattern')
    for (const { pattern, flags, message } of patterns || []) {
      if (!pattern) {
        continue
      }

      const cacheKey = `${pattern}//${flags || ''}`

      let regex = regexCache.get(cacheKey)
      if (!regex) {
        regex = new RegExp(pattern, flags)
        regexCache.set(cacheKey, regex)
      }
      if (!regex.test(value)) {
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
    if (def.metadata.size === 0) {
      return true
    }
    const int = def.metadata.get('expect.int') as boolean | { message?: string }
    if (int && value % 1 !== 0) {
      const message =
        typeof int === 'object' && int.message ? int.message : `Expected integer, got ${value}`
      this.error(message)
      return false
    }
    const min = def.metadata.get('expect.min')
    if (min) {
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
    const max = def.metadata.get('expect.max')
    if (max) {
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
    if (def.metadata.size === 0) {
      return true
    }
    const filled = def.metadata.get('meta.required')
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

/** Error thrown by {@link Validator.validate} when validation fails. Contains structured error details. */
export class ValidatorError extends Error {
  name = 'Validation Error'
  constructor(public readonly errors: TError[]) {
    // oxlint-disable-next-line prefer-template
    super(`${errors[0].path ? errors[0].path + ': ' : ''}${errors[0].message}`)
  }
}
