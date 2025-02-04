import { Validator, type TValidatorOptions } from './validator'

// eslint-disable max-lines
export interface TAnscriptTypeComplex {
  kind: 'union' | 'intersection' | 'tuple'
  items: TAnscriptAnnotatedType[]

  flags: Set<string>
}

export interface TAnscriptTypeArray {
  kind: 'array'
  of: TAnscriptAnnotatedType

  flags: Set<string>
}

export interface TAnscriptTypeObject<K extends string = string> {
  kind: 'object'

  props: Map<K, TAnscriptAnnotatedType>

  flags: Set<string>
}

export interface TAnscriptTypeFinal {
  kind: ''

  /**
   * design type
   */
  designType: 'string' | 'number' | 'boolean' | 'undefined' | 'null' | 'object' | 'any' | 'never'

  /**
   * value for literals
   */
  value?: string | number | boolean

  flags: Set<string>
}

export type TAnscriptTypeDef =
  | TAnscriptTypeComplex
  | TAnscriptTypeFinal
  | TAnscriptTypeArray
  | TAnscriptTypeObject

export interface TAnscriptAnnotatedType<T = TAnscriptTypeDef> {
  __is_anscript_annotated_type: true
  type: T
  validator: (opts?: TValidatorOptions) => Validator
  metadata: Map<string, unknown>
  optional?: boolean
}

/**
 * Type Guard to check if a type is anscript-annotated
 */
export function isAnnotatedType(type: any): type is TAnscriptAnnotatedType {
  return type && type.__is_anscript_annotated_type
}

type TKind = '' | 'array' | 'object' | 'union' | 'intersection' | 'tuple'

export function defineAnnotatedType(_kind?: TKind, base?: any) {
  const kind = _kind || ''
  const type = (base?.type || {}) as { kind: TKind } & Omit<TAnscriptTypeComplex, 'kind'> &
    Omit<TAnscriptTypeFinal, 'kind'> &
    Omit<TAnscriptTypeArray, 'kind'> &
    Omit<TAnscriptTypeObject, 'kind'>
  type.kind = kind
  if (['union', 'intersection', 'tuple'].includes(kind)) {
    type.items = []
  }
  if (kind === 'object') {
    type.props = new Map()
  }
  type.flags = new Set()
  const metadata = (base?.metadata || new Map<string, unknown>()) as Map<string, unknown>
  if (base) {
    Object.assign(base, {
      __is_anscript_annotated_type: true,
      metadata,
      type,
      validator(opts?: TValidatorOptions) {
        return new Validator(this as TAnscriptAnnotatedType, opts)
      },
    })
  } else {
    base = {
      __is_anscript_annotated_type: true,
      metadata,
      type,
      validator(opts?: TValidatorOptions) {
        return new Validator(this, opts)
      },
    }
  }
  const handle = {
    $type: base,
    $def: type,
    $metadata: metadata,
    _existingObject: undefined as TAnscriptAnnotatedType<TAnscriptTypeObject> | undefined,
    flags(...flags: string[]) {
      for (const flag of flags) {
        this.$def.flags.add(flag)
      }
      return this
    },
    designType(value: TAnscriptTypeFinal['designType']) {
      this.$def.designType = value
      return this
    },
    value(value: string | number | boolean) {
      this.$def.value = value
      return this
    },
    of(value: TAnscriptAnnotatedType) {
      this.$def.of = value
      return this
    },
    item(value: TAnscriptAnnotatedType) {
      this.$def.items.push(value)
      return this
    },
    prop(name: string, value: TAnscriptAnnotatedType) {
      this.$def.props.set(name, value)
      return this
    },
    optional() {
      this.$type.optional = true
      return this
    },
    refTo(type: any, chain?: string[]) {
      let newBase = type
      const typeName = type.name || 'Unknown'
      if (isAnnotatedType(newBase)) {
        let keys = ''
        for (const c of chain || []) {
          keys += `["${c}"]`
          if (newBase.type.kind === 'object') {
            newBase = newBase.type.props.get(c)
          } else {
            throw new Error(`Can't find prop ${typeName}${keys}`)
          }
        }
        if (!newBase && keys) {
          throw new Error(`Can't find prop ${typeName}${keys}`)
        } else if (!newBase) {
          throw new Error(`"${typeName}" is not annotated type`)
        }
        this.$type = {
          __is_anscript_annotated_type: true,
          type: newBase.type,
          metadata: newBase.metadata ? new Map<string, unknown>(newBase.metadata) : metadata,
        }
        this.$metadata = this.$type.metadata
      } else {
        throw new Error(`${type} is not annotated type`)
      }
      return this
    },
    annotate(key: string, value: any, asArray?: boolean) {
      if (asArray) {
        if (this.$metadata.has(key)) {
          const a = this.$metadata.get(key)
          if (Array.isArray(a)) {
            a.push(value)
          } else {
            this.$metadata.set(key, [a, value])
          }
        } else {
          this.$metadata.set(key, [value])
        }
      } else {
        this.$metadata.set(key, value)
      }
      return this
    },
  }
  return handle
}

/**
 * Anscript Metadata Map with typed setters/getters
 */
export interface TMetadataMap<O extends object> extends Map<keyof O, O[keyof O]> {
  // Get returns O[K] for exactly that key (plus undefined if key not present)
  get<K extends keyof O>(key: K): O[K] | undefined

  // Set enforces that the value must match O[K]
  set<K extends keyof O>(key: K, value: O[K]): this
}
