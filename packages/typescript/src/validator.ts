// eslint-disable max-lines
import {
  isAnnotatedType,
  TAnscriptAnnotatedType,
  TAnscriptTypeArray,
  TAnscriptTypeComplex,
  TAnscriptTypeFinal,
  TAnscriptTypeObject,
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

export class Validator {
  protected opts: TValidatorOptions

  constructor(
    protected readonly def: TAnscriptAnnotatedType,
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

  protected _validate(def: TAnscriptAnnotatedType, value: any): boolean {
    if (!isAnnotatedType(def)) {
      throw new Error('Can not validate not-annotated type')
    }
    if (def.optional && value === undefined) {
      return true
    }
    switch (def.type.kind) {
      case 'object':
        return this.validateObject(def as TAnscriptAnnotatedType<TAnscriptTypeObject>, value)
      case 'union':
        return this.validateUnion(def as TAnscriptAnnotatedType<TAnscriptTypeComplex>, value)
      case 'intersection':
        return this.validateIntersection(def as TAnscriptAnnotatedType<TAnscriptTypeComplex>, value)
      case 'tuple':
        return this.validateTuple(def as TAnscriptAnnotatedType<TAnscriptTypeComplex>, value)
      case 'array':
        return this.validateArray(def as TAnscriptAnnotatedType<TAnscriptTypeArray>, value)
      case '':
        return this.validatePrimitive(def as TAnscriptAnnotatedType<TAnscriptTypeFinal>, value)
      default:
        throw new Error(`Unknown type "${(def.type as { kind: string }).kind}"`)
    }
  }

  protected validateUnion(def: TAnscriptAnnotatedType<TAnscriptTypeComplex>, value: any): boolean {
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
    def: TAnscriptAnnotatedType<TAnscriptTypeComplex>,
    value: any
  ): boolean {
    for (const item of def.type.items) {
      if (!this._validate(item, value)) {
        return false
      }
    }
    return true
  }

  protected validateTuple(def: TAnscriptAnnotatedType<TAnscriptTypeComplex>, value: any): boolean {
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

  protected validateArray(def: TAnscriptAnnotatedType<TAnscriptTypeArray>, value: any): boolean {
    if (!Array.isArray(value)) {
      this.error('Expected array')
      return false
    }
    let i = 0
    for (const item of value) {
      this.push(`[${i}]`)
      if (!this._validate(def.type.of, item)) {
        this.pop(true)
        return false
      }
      this.pop(false)
      i++
    }
    return true
  }

  protected validateObject(def: TAnscriptAnnotatedType<TAnscriptTypeObject>, value: any): boolean {
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
      }
    }
    for (const key of valueKeys) {
      if (this.opts.unknwonProps !== 'ignore') {
        if (!typeKeys.has(key)) {
          if (this.opts.unknwonProps === 'error') {
            this.push(key)
            this.error(`Unexpected property`)
            this.pop(true)
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
    def: TAnscriptAnnotatedType<TAnscriptTypeFinal>,
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
        return this.validateString(def.type.flags, value)
      case 'number':
        if (typeOfValue !== def.type.designType) {
          this.error(`Expected ${def.type.designType}, got ${typeOfValue}`)
          return false
        }
        return this.validateNumber(def.type.flags, value)
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

  protected validateString(flags: Set<string>, value: string): boolean {
    // We iterate over all string flags in case more than one is supplied.
    for (const flag of flags) {
      switch (flag) {
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            this.error(`Expected email, got "${value}"`)
            return false
          }
          break

        case 'phone':
          // E.164-like pattern for phone numbers
          if (!/^\+?[0-9\s-]{10,15}$/.test(value)) {
            this.error(`Expected phone number, got "${value}"`)
            return false
          }
          break

        case 'url':
          try {
            new URL(value) // Will throw if invalid
          } catch {
            this.error(`Expected valid URL, got "${value}"`)
            return false
          }
          break

        default:
      }
    }
    return true
  }

  protected validateNumber(flags: Set<string>, value: number): boolean {
    for (const flag of flags) {
      switch (flag) {
        case 'int':
          if (!Number.isInteger(value)) {
            this.error(`Expected integer, got ${value}`)
            return false
          }
          break

        case 'positive':
          if (value <= 0) {
            this.error(`Expected a positive number, got ${value}`)
            return false
          }
          break

        case 'negative':
          if (value >= 0) {
            this.error(`Expected a negative number, got ${value}`)
            return false
          }
          break

        default:
      }
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
