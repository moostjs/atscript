// eslint-disable max-lines
import {
  isAnnotatedType,
  TAtscriptAnnotatedType,
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

export interface TValidatorOptions {
  partial: boolean | 'deep'
  unknwonProps: 'strip' | 'ignore' | 'error'
  errorLimit: number
}

const regexCache = new Map<string, RegExp>()

export class Validator {
  protected opts: TValidatorOptions

  constructor(
    protected readonly def: TAtscriptAnnotatedType,
    opts?: Partial<TValidatorOptions>
  ) {
    this.opts = {
      partial: false,
      unknwonProps: 'error',
      errorLimit: 10,
      ...opts,
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
      path: path || this.stackPath.join('.').slice(1),
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

  public validate(value: any, safe?: boolean): boolean {
    this.push('')
    this.errors = []
    this.stackErrors = []
    const passed = this._validate(this.def, value)
    this.pop(!passed)
    if (!passed) {
      if (safe) {
        return false
      }
      this.throw()
    }
    return true
  }

  protected _validate(def: TAtscriptAnnotatedType, value: any): boolean {
    if (this.isLimitExceeded()) {
      return false
    }
    if (!isAnnotatedType(def)) {
      throw new Error('Can not validate not-annotated type')
    }
    if (def.optional && value === undefined) {
      return true
    }
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
      if (this._validate(item, value)) {
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
      if (!this._validate(item, value)) {
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
      if (!this._validate(item, value[i])) {
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
      if (!this._validate(def.type.of, item)) {
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
    for (const [key, item] of def.type.props.entries()) {
      typeKeys.add(key)
      if (value[key] === undefined) {
        if (
          this.opts.partial === 'deep' ||
          (this.opts.partial === true && this.stackPath.length <= 1)
        ) {
          continue
        }
      }
      this.push(key)
      if (this._validate(item, value[key])) {
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
      if (this.opts.unknwonProps !== 'ignore') {
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
      if (!pattern) continue

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
