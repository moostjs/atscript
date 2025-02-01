export interface TAnscriptTypeComplex {
  kind: 'union' | 'intersection' | 'tuple'
  items: TAnscriptAnnotatedType[]
}

export interface TAnscriptTypeArray {
  kind: 'array'
  of: TAnscriptAnnotatedType
}

export interface TAnscriptTypeObject<K extends string = string> {
  kind: 'object'

  /**
   * type constructor
   */
  type: Function | undefined
  props: Map<K, TAnscriptAnnotatedType>
}

export interface TAnscriptTypeFinal {
  kind: ''

  /**
   * design type
   */
  designType: 'string' | 'number' | 'boolean' | 'undefined' | 'null' | 'object' | 'any'

  /**
   * type constructor
   */
  type: Function | undefined

  /**
   * value for literals
   */
  value?: string | number | boolean
}

export type TAnscriptTypeDef =
  | TAnscriptTypeComplex
  | TAnscriptTypeFinal
  | TAnscriptTypeArray
  | TAnscriptTypeObject

export interface TAnscriptAnnotatedType {
  __is_anscript_annotated_type: true
  type: TAnscriptTypeDef
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
  const type = {
    kind,
  } as { kind: TKind } & Omit<TAnscriptTypeComplex, 'kind'> &
    Omit<TAnscriptTypeFinal, 'kind'> &
    Omit<TAnscriptTypeArray, 'kind'> &
    Omit<TAnscriptTypeObject, 'kind'>
  if (['union', 'intersection', 'tuple'].includes(kind)) {
    type.items = []
  }
  if (kind === 'object') {
    type.props = new Map()
  }
  const metadata = new Map<string, unknown>()
  if (base) {
    Object.assign(base, {
      __is_anscript_annotated_type: true,
      metadata,
      type,
    })
  } else {
    base = {
      __is_anscript_annotated_type: true,
      metadata,
      type,
    }
  }
  const handle = {
    $type: base,
    $def: type,
    $metadata: metadata,
    designType(value: TAnscriptTypeFinal['designType']) {
      this.$def.designType = value
      return this
    },
    type(value: any) {
      this.$def.type = value
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
        }
      } else {
        this.$metadata.set(key, value)
      }
      // const parts = key.split('.')
      // let currentObj = this.$metadata as any

      // for (let i = 0; i < parts.length; i++) {
      //   const part = parts[i]

      //   // If this is the last part, assign the value
      //   if (i === parts.length - 1) {
      //     currentObj[part] = value
      //   } else {
      //     // Otherwise, ensure the nested object exists, then go deeper
      //     if (!currentObj[part]) {
      //       currentObj[part] = {}
      //     }
      //     currentObj = currentObj[part]
      //   }
      // }

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
