// oxlint-disable max-depth
// eslint-disable max-lines
import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'
import { isAnnotatedType, isPhantomType } from './annotated-type'
import { forAnnotatedType } from './traverse'

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
  DataType = T extends { type: { __dataType?: infer D } }
    ? unknown extends D
      ? T extends new (...args: any[]) => infer I
        ? I
        : unknown
      : D
    : unknown,
> {
  protected opts: TValidatorOptions

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
  }

  /** Validation errors collected during the last {@link validate} call. */
  public errors: TError[] = []
  protected stackErrors: TError[][] = []
  protected stackPath: string[] = []
  protected context: unknown

  protected isLimitExceeded() {
    if (this.stackErrors.length > 0) {
      return this.stackErrors[this.stackErrors.length - 1].length >= this.opts.errorLimit
    }
    return this.errors.length >= this.opts.errorLimit
  }

  protected push(name: string) {
    this.stackPath.push(name)
    this.stackErrors.push([])
  }

  protected pop(saveErrors: boolean) {
    this.stackPath.pop()
    const popped = this.stackErrors.pop()
    if (saveErrors && popped?.length) {
      popped.forEach(error => {
        this.error(error.message, error.path, error.details)
      })
    }
    return popped
  }

  protected clear() {
    this.stackErrors[this.stackErrors.length - 1] = []
  }

  protected error(message: string, path?: string, details?: TError[]) {
    const errors = this.stackErrors[this.stackErrors.length - 1] || this.errors
    const error: TError = {
      path: path || this.path,
      message,
    }
    if (details?.length) {
      error.details = details
    }
    errors.push(error)
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
    this.push('')
    this.errors = []
    this.stackErrors = []
    this.context = context
    const passed = this.validateSafe(this.def, value)
    this.pop(!passed)
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
    if (this.isLimitExceeded()) {
      return false
    }
    if (!isAnnotatedType(def)) {
      throw new Error('Can not validate not-annotated type')
    }
    if (typeof this.opts.replace === 'function') {
      def = this.opts.replace(def, this.path)
    }
    if (def.optional && value === undefined) {
      return true
    }

    for (const plugin of this.opts.plugins) {
      const result = plugin(this as unknown as TValidatorPluginContext, def, value)
      if (result === false || result === true) {
        return result
      }
    }
    return this.validateAnnotatedType(def, value)
  }

  protected get path() {
    return this.stackPath.slice(1).join('.')
  }

  protected validateAnnotatedType(def: TAtscriptAnnotatedType, value: any) {
    return forAnnotatedType(def, {
      final: d => this.validatePrimitive(d, value),
      phantom: () => true,
      object: d => this.validateObject(d, value),
      array: d => this.validateArray(d, value),
      union: d => this.validateUnion(d, value),
      intersection: d => this.validateIntersection(d, value),
      tuple: d => this.validateTuple(d, value),
    })
  }

  protected validateUnion(def: TAtscriptAnnotatedType<TAtscriptTypeComplex>, value: any): boolean {
    let i = 0
    const popped = [] as TError[]
    for (const item of def.type.items) {
      this.push(`[${item.type.kind || item.type.designType}(${i})]`)
      if (this.validateSafe(item, value)) {
        this.pop(false)
        return true
      }
      const errors = this.pop(false)
      if (errors) {
        popped.push(...errors)
      }
      i++
    }
    this.clear()
    const expected = def.type.items
      .map((item, i) => `[${item.type.kind || item.type.designType}(${i})]`)
      .join(', ')
    this.error(`Value does not match any of the allowed types: ${expected}`, undefined, popped)
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
    let i = 0
    let passed = true
    for (const item of value) {
      this.push(String(i))
      if (!this.validateSafe(def.type.of, item)) {
        passed = false
        this.pop(true)
        if (this.isLimitExceeded()) {
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
    const valueKeys = new Set(Object.keys(value))
    const typeKeys = new Set()

    // prepare skipList for this object
    const skipList = new Set()
    if (this.opts.skipList) {
      const path = this.stackPath.length > 1 ? `${this.path}.` : ''
      this.opts.skipList.forEach(item => {
        if (item.startsWith(path)) {
          const key = item.slice(path.length)
          skipList.add(key)
          valueKeys.delete(key)
        }
      })
    }

    let partialFunctionMatched = false
    if (typeof this.opts.partial === 'function') {
      partialFunctionMatched = this.opts.partial(def, this.path)
    }

    for (const [key, item] of def.type.props.entries()) {
      if (skipList.has(key) || isPhantomType(item)) {
        continue
      }
      typeKeys.add(key)
      if (value[key] === undefined) {
        if (
          partialFunctionMatched ||
          this.opts.partial === 'deep' ||
          (this.opts.partial === true && this.stackPath.length <= 1)
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
        if (this.isLimitExceeded()) {
          return false
        }
      }
    }
    for (const key of valueKeys) {
      /** matched patterns for unknown keys */
      if (!typeKeys.has(key)) {
        const matched: typeof def.type.propsPatterns = []
        for (const { pattern, def: propDef } of def.type.propsPatterns) {
          // check if key matches any pattern
          if (pattern.test(key)) {
            matched.push({ pattern, def: propDef })
          }
        }
        if (matched.length > 0) {
          // some patterns matched, we have to make sure that
          // at least one type validation passes
          let keyPassed = false
          for (const { def } of matched) {
            if (this.validateSafe(def, value[key])) {
              this.pop(false)
              keyPassed = true
              break
            }
          }
          if (!keyPassed) {
            // no type validations passed, we have to save error
            this.push(key)
            this.validateSafe(matched[0].def, value[key])
            this.pop(true)
            passed = false
            if (this.isLimitExceeded()) {
              return false
            }
          }
        } else if (this.opts.unknownProps !== 'ignore') {
          // no keys matched, no patterns matched:
          if (this.opts.unknownProps === 'error') {
            this.push(key)
            this.error(`Unexpected property`)
            this.pop(true)
            if (this.isLimitExceeded()) {
              return false
            }
            passed = false
          } else if (this.opts.unknownProps === 'strip') {
            delete value[key]
          }
        }
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
      default: {
        throw new Error(`Unknown type "${def.type.designType}"`)
      }
    }
  }

  protected validateString(
    def: TAtscriptAnnotatedType<TAtscriptTypeFinal>,
    value: string
  ): boolean {
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
    const int = def.metadata.get('expect.int')
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
