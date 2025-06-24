// oxlint-disable max-depth
// eslint-disable max-lines
import {
  isAnnotatedType,
  TAtscriptAnnotatedType,
  TAtscriptAnnotatedTypeConstructor,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'

interface TError {
  path: string
  message: string
  details?: TError[]
}

export type TValidatorPlugin = (
  ctx: TValidatorPluginContext,
  def: TAtscriptAnnotatedType,
  value: any
) => boolean | undefined

export interface TValidatorOptions {
  partial:
    | boolean
    | 'deep'
    | ((type: TAtscriptAnnotatedType<TAtscriptTypeObject>, path: string) => boolean)
  replace?: (type: TAtscriptAnnotatedType, path: string) => TAtscriptAnnotatedType
  plugins: TValidatorPlugin[]
  unknwonProps: 'strip' | 'ignore' | 'error'
  errorLimit: number
  skipList?: Set<string>
}

const regexCache = new Map<string, RegExp>()

export interface TValidatorPluginContext {
  opts: Validator<any>['opts']
  validateAnnotatedType: Validator<any>['validateAnnotatedType']
  error: Validator<any>['error']
  path: Validator<any>['path']
}

export class Validator<T extends TAtscriptAnnotatedTypeConstructor> {
  protected opts: TValidatorOptions

  constructor(
    protected readonly def: T | TAtscriptAnnotatedType<any>,
    opts?: Partial<TValidatorOptions>
  ) {
    this.opts = {
      partial: false,
      unknwonProps: 'error',
      errorLimit: 10,
      ...opts,
      plugins: opts?.plugins || [],
    }
  }

  public errors: TError[] = []
  protected stackErrors: TError[][] = []
  protected stackPath: string[] = []

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

  public validate<TT = T>(value: any, safe?: boolean): value is TT {
    this.push('')
    this.errors = []
    this.stackErrors = []
    const passed = this.validateSafe(this.def, value)
    this.pop(!passed)
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
    switch (def.type.kind) {
      case 'object':
        return this.validateObject(def as TAtscriptAnnotatedType<TAtscriptTypeObject>, value)
      case 'union':
        return this.validateUnion(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>, value)
      case 'intersection':
        return this.validateIntersection(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>, value)
      case 'tuple':
        return this.validateTuple(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>, value)
      case 'array':
        return this.validateArray(def as TAtscriptAnnotatedType<TAtscriptTypeArray>, value)
      case '':
        return this.validatePrimitive(def as TAtscriptAnnotatedType<TAtscriptTypeFinal>, value)
      default:
        throw new Error(`Unknown type "${(def.type as { kind: string }).kind}"`)
    }
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
      this.error('Expected array of length ' + def.type.items.length)
      return false
    }
    let i = 0
    for (const item of def.type.items) {
      this.push(`[${i}]`)
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
    if (typeof minLength === 'number' && value.length < minLength) {
      this.error(`Expected minimum length of ${minLength} items, got ${value.length} items`)
      return false
    }
    const maxLength = def.metadata.get('expect.maxLength')
    if (typeof maxLength === 'number' && value.length > maxLength) {
      this.error(`Expected maximum length of ${maxLength} items, got ${value.length} items`)
      return false
    }
    let i = 0
    let passed = true
    for (const item of value) {
      this.push(`[${i}]`)
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
      const path = this.stackPath.length > 1 ? this.path + '.' : ''
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
      if (skipList.has(key)) {
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
      const matched: typeof def.type.propsPatterns = []
      for (const { pattern, def: propDef } of def.type.propsPatterns) {
        // check if key matches any pattern
        if (pattern.test(key)) {
          matched.push({ pattern, def: propDef })
        }
      }
      if (matched.length) {
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
      } else if (this.opts.unknwonProps !== 'ignore') {
        // no keys matched, no patterns matched:
        if (!typeKeys.has(key)) {
          if (this.opts.unknwonProps === 'error') {
            this.push(key)
            this.error(`Unexpected property`)
            this.pop(true)
            if (this.isLimitExceeded()) {
              return false
            }
            passed = false
          } else if (this.opts.unknwonProps === 'strip') {
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
    if (typeof def.type.value !== 'undefined') {
      if (value !== def.type.value) {
        this.error(`Expected ${def.type.value}, got ${value}`)
        return false
      }
      return true
    }
    const typeOfValue = Array.isArray(value) ? 'array' : typeof value
    switch (def.type.designType) {
      case 'never':
        this.error(`This type is impossible, must be an internal problem`)
        return false
      case 'any':
        return true
      case 'string':
        if (typeOfValue !== def.type.designType) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return this.validateString(def, value)
      case 'number':
        if (typeOfValue !== def.type.designType) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return this.validateNumber(def, value)
      case 'boolean':
        if (typeOfValue !== def.type.designType) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return true
      case 'undefined':
        if (value !== undefined) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return true
      case 'null':
        if (value !== null) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return true
      default:
        throw new Error(`Unknown type "${def.type.designType}"`)
    }
  }

  protected validateString(
    def: TAtscriptAnnotatedType<TAtscriptTypeFinal>,
    value: string
  ): boolean {
    const minLength = def.metadata.get('expect.minLength')
    if (typeof minLength === 'number' && value.length < minLength) {
      this.error(
        `Expected minimum length of ${minLength} characters, got ${value.length} characters`
      )
      return false
    }
    const maxLength = def.metadata.get('expect.maxLength')
    if (typeof maxLength === 'number' && value.length > maxLength) {
      this.error(
        `Expected maximum length of ${maxLength} characters, got ${value.length} characters`
      )
      return false
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
    if (typeof int === 'boolean' && int && value % 1 !== 0) {
      this.error(`Expected integer, got ${value}`)
      return false
    }
    const min = def.metadata.get('expect.min')
    if (typeof min === 'number' && value < min) {
      this.error(`Expected minimum ${min}, got ${value}`)
      return false
    }
    const max = def.metadata.get('expect.max')
    if (typeof max === 'number' && value > max) {
      this.error(`Expected maximum ${max}, got ${value}`)
      return false
    }
    return true
  }
}

export class ValidatorError extends Error {
  name = 'Validation Error'
  constructor(public readonly errors: TError[]) {
    super(`${errors[0].path ? errors[0].path + ': ' : ''}${errors[0].message}`)
  }
}
