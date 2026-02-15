import { Validator, type TValidatorOptions } from './validator'

// eslint-disable max-lines

/** Type definition for union, intersection, or tuple types. */
export interface TAtscriptTypeComplex<DataType = unknown> {
  kind: 'union' | 'intersection' | 'tuple'
  items: TAtscriptAnnotatedType[]

  tags: Set<AtscriptPrimitiveTags>

  /** @internal phantom — carries the DataType at the type level, never set at runtime */
  __dataType?: DataType
}

/** Type definition for array types. */
export interface TAtscriptTypeArray<DataType = unknown[]> {
  kind: 'array'
  of: TAtscriptAnnotatedType

  tags: Set<AtscriptPrimitiveTags>

  /** @internal phantom — carries the DataType at the type level, never set at runtime */
  __dataType?: DataType
}

/** Type definition for object types with named and pattern-matched properties. */
export interface TAtscriptTypeObject<K extends string = string, DataType = Record<K, unknown>> {
  kind: 'object'

  props: Map<K, TAtscriptAnnotatedType>
  propsPatterns: { pattern: RegExp; def: TAtscriptAnnotatedType }[]

  tags: Set<AtscriptPrimitiveTags>

  /** @internal phantom — carries the DataType at the type level, never set at runtime */
  __dataType?: DataType
}

/** Type definition for primitive/literal types (string, number, boolean, null, etc.). */
export interface TAtscriptTypeFinal<DataType = unknown> {
  kind: ''

  /**
   * design type
   */
  designType: 'string' | 'number' | 'boolean' | 'undefined' | 'null' | 'object' | 'any' | 'never'

  /**
   * value for literals
   */
  value?: string | number | boolean

  tags: Set<AtscriptPrimitiveTags>

  /** @internal phantom — carries the DataType at the type level, never set at runtime */
  __dataType?: DataType
}

/**
 * Extract DataType from a type def's phantom generic
 */
export type InferDataType<T> = T extends { __dataType?: infer D } ? D : unknown

/** Union of all possible type definition shapes. */
export type TAtscriptTypeDef<DataType = unknown> =
  | TAtscriptTypeComplex<DataType>
  | TAtscriptTypeFinal<DataType>
  | TAtscriptTypeArray<DataType>
  | TAtscriptTypeObject<string, DataType>

/**
 * Core annotated type — wraps a type definition with metadata and a validator factory.
 *
 * Generated `.as` files produce classes/namespaces that conform to this interface.
 * The `DataType` phantom generic carries the TypeScript data shape for type-safe validation.
 *
 * @typeParam T - The underlying type definition (e.g. {@link TAtscriptTypeObject}).
 * @typeParam DataType - The TypeScript type the validated data narrows to (auto-inferred from `T`).
 */
export interface TAtscriptAnnotatedType<T = TAtscriptTypeDef, DataType = InferDataType<T>> {
  __is_atscript_annotated_type: true
  type: T
  validator: (opts?: Partial<TValidatorOptions>) => Validator
  metadata: TMetadataMap<AtscriptMetadata>
  optional?: boolean
}

/** An annotated type that is also a class constructor (i.e. a generated interface class). */
export type TAtscriptAnnotatedTypeConstructor = TAtscriptAnnotatedType &
  (new (...args: any[]) => any)

/**
 * Type Guard to check if a type is atscript-annotated
 */
export function isAnnotatedType(type: any): type is TAtscriptAnnotatedType {
  return type && type.__is_atscript_annotated_type
}

/**
 * Standalone annotate function that handles both replace and append (array) strategies.
 * Used by the handle's .annotate() method and by generated mutation statements.
 */
export function annotate<K extends keyof AtscriptMetadata>(
  metadata: TMetadataMap<AtscriptMetadata> | undefined,
  key: K,
  value: AtscriptMetadata[K] extends (infer E)[] ? E : AtscriptMetadata[K],
  asArray?: boolean
): void {
  if (!metadata) return
  if (asArray) {
    if (metadata.has(key)) {
      const a = metadata.get(key)
      if (Array.isArray(a)) {
        a.push(value as any)
      } else {
        metadata.set(key, [a, value] as any)
      }
    } else {
      metadata.set(key, [value] as any)
    }
  } else {
    metadata.set(key, value as any)
  }
}

type TKind = '' | 'array' | 'object' | 'union' | 'intersection' | 'tuple'

/**
 * Creates a builder handle for constructing a {@link TAtscriptAnnotatedType} at runtime.
 *
 * This is primarily used by generated `.as.js` code. The returned handle provides
 * a fluent API for setting the type definition, metadata, and properties.
 *
 * @example
 * ```ts
 * const handle = defineAnnotatedType('object')
 *   .prop('name', defineAnnotatedType().designType('string').$type)
 *   .prop('age', defineAnnotatedType().designType('number').$type)
 *
 * handle.$type // the resulting TAtscriptAnnotatedType
 * ```
 *
 * @param _kind - The kind of type to create (e.g. `'object'`, `'array'`, `'union'`). Defaults to `''` (primitive/final).
 * @param base - Optional existing object to augment with annotated type fields.
 * @returns A builder handle for fluent type construction.
 */
export function defineAnnotatedType(_kind?: TKind, base?: any): TAnnotatedTypeHandle {
  const kind = _kind || ''
  const type = (base?.type || {}) as { kind: TKind } & Omit<TAtscriptTypeComplex, 'kind'> &
    Omit<TAtscriptTypeFinal, 'kind'> &
    Omit<TAtscriptTypeArray, 'kind'> &
    Omit<TAtscriptTypeObject, 'kind'>
  type.kind = kind
  if (['union', 'intersection', 'tuple'].includes(kind)) {
    type.items = []
  }
  if (kind === 'object') {
    type.props = new Map()
    type.propsPatterns = []
  }
  type.tags = new Set()
  const metadata = (base?.metadata || new Map<string, unknown>()) as TMetadataMap<AtscriptMetadata>
  if (base) {
    Object.assign(base, {
      __is_atscript_annotated_type: true,
      metadata,
      type,
      validator(opts?: Partial<TValidatorOptions>) {
        return new Validator(this as TAtscriptAnnotatedType, opts)
      },
    })
  } else {
    base = {
      __is_atscript_annotated_type: true,
      metadata,
      type,
      validator(opts?: Partial<TValidatorOptions>) {
        return new Validator(this as TAtscriptAnnotatedType, opts)
      },
    }
  }
  const handle = {
    $type: base as TAtscriptAnnotatedType,
    $def: type,
    $metadata: metadata,
    _existingObject: undefined as TAtscriptAnnotatedType | undefined,
    tags(...tags: string[]) {
      for (const tag of tags) {
        this.$def.tags.add(tag)
      }
      return this
    },
    designType(value: TAtscriptTypeFinal['designType']) {
      this.$def.designType = value
      return this
    },
    value(value: string | number | boolean) {
      this.$def.value = value
      return this
    },
    of(value: TAtscriptAnnotatedType) {
      this.$def.of = value
      return this
    },
    item(value: TAtscriptAnnotatedType) {
      this.$def.items.push(value)
      return this
    },
    prop(name: string, value: TAtscriptAnnotatedType) {
      this.$def.props.set(name, value)
      return this
    },
    propPattern(pattern: RegExp, def: TAtscriptAnnotatedType) {
      this.$def.propsPatterns.push({ pattern, def })
      return this
    },
    optional(value = true) {
      this.$type.optional = value
      return this
    },
    copyMetadata(fromMetadata: TMetadataMap<AtscriptMetadata>, ignore?: Set<string>) {
      for (const [key, value] of fromMetadata.entries()) {
        if (!ignore || !ignore.has(key)) {
          this.$metadata.set(key, value)
        }
      }
      return this
    },
    refTo(type: TAtscriptAnnotatedType & { name?: string }, chain?: string[]) {
      let newBase = type
      const typeName = type.name || 'Unknown'
      if (isAnnotatedType(newBase)) {
        let keys = ''
        for (const c of chain || []) {
          keys += `["${c}"]`
          if (newBase.type.kind === 'object' && newBase.type.props.has(c)) {
            newBase = newBase.type.props.get(c)!
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
          __is_atscript_annotated_type: true,
          type: newBase.type,
          metadata,
          validator(opts?: Partial<TValidatorOptions>) {
            return new Validator(this as TAtscriptAnnotatedType, opts)
          },
        }
      } else {
        throw new Error(`${type} is not annotated type`)
      }
      return this
    },
    annotate(key: keyof AtscriptMetadata, value: any, asArray?: boolean) {
      annotate(this.$metadata, key, value, asArray)
      return this
    },
  }
  return handle
}

/**
 * Atscript Metadata Map with typed setters/getters
 */
export interface TMetadataMap<O extends object> extends Map<keyof O, O[keyof O]> {
  // Get returns O[K] for exactly that key (plus undefined if key not present)
  get<K extends keyof O>(key: K): O[K] | undefined

  // Set enforces that the value must match O[K]
  set<K extends keyof O>(key: K, value: O[K]): this
}

/** Fluent builder handle returned by {@link defineAnnotatedType}. */
export interface TAnnotatedTypeHandle {
  $type: TAtscriptAnnotatedType
  $def: {
    kind: TKind
  } & Omit<TAtscriptTypeComplex, 'kind'> &
    Omit<TAtscriptTypeFinal, 'kind'> &
    Omit<TAtscriptTypeArray, 'kind'> &
    Omit<TAtscriptTypeObject<string>, 'kind'>
  $metadata: TMetadataMap<AtscriptMetadata>
  _existingObject: TAtscriptAnnotatedType | undefined
  tags(...tags: string[]): TAnnotatedTypeHandle
  designType(value: TAtscriptTypeFinal['designType']): TAnnotatedTypeHandle
  value(value: string | number | boolean): TAnnotatedTypeHandle
  of(value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  item(value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  prop(name: string, value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  propPattern(pattern: RegExp, value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  optional(value?: boolean): TAnnotatedTypeHandle
  copyMetadata(fromMetadata: TMetadataMap<AtscriptMetadata>): TAnnotatedTypeHandle
  refTo(type: TAtscriptAnnotatedType & { name?: string }, chain?: string[]): TAnnotatedTypeHandle
  annotate(key: keyof AtscriptMetadata, value: any, asArray?: boolean): TAnnotatedTypeHandle
}

/**
 * Checks whether an annotated type resolves to a primitive (non-object, non-array) shape.
 *
 * Returns `true` for final types and for unions/intersections/tuples
 * whose members are all primitives.
 */
export function isAnnotatedTypeOfPrimitive(t: TAtscriptAnnotatedType) {
  if (['array', 'object'].includes(t.type.kind)) {
    return false
  }
  if (!t.type.kind) {
    return true
  }
  if (['union', 'tuple', 'intersection'].includes(t.type.kind)) {
    for (const item of (t.type as TAtscriptTypeComplex).items) {
      if (!isAnnotatedTypeOfPrimitive(item)) {
        return false
      }
    }
    return true
  }
  return false
}
