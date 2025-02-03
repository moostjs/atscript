import { Validator, type TValidatorOptions } from './validator'

// eslint-disable max-lines
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
  designType: 'string' | 'number' | 'boolean' | 'undefined' | 'null' | 'object' | 'any' | 'never'

  /**
   * type constructor
   */
  type: Function | undefined

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
  if (!kind) {
    type.flags = new Set()
  }
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
      // If not an intersection, just push the item.
      if (this.$def.kind !== 'intersection') {
        this.$def.items.push(value)
        return this
      }

      // We are in "intersection" mode:
      const newItemDef = value.type

      // 1. If the incoming item is an object, try merging it with an existing object item.
      if (newItemDef.kind === 'object') {
        if (!this._existingObject) {
          // No object item yet, so just add this one.
          this._existingObject = value as TAnscriptAnnotatedType<TAnscriptTypeObject>
          // cloning props to avoid mutation to the original type when merging
          const oldPropsMap = this._existingObject.type.props
          this._existingObject.type = {
            kind: 'object',
            type: Object,
            props: new Map(),
          }
          for (const [propName, propType] of oldPropsMap.entries()) {
            this._existingObject.type.props.set(propName, propType)
          }
          this.$def.items.push(value)
        } else {
          const existingObject = this._existingObject
          // Merge object-level metadata (right overrides left).
          existingObject.metadata = mergeMetadata(existingObject.metadata, value.metadata)

          // Merge props with the existing object item.
          for (const [propName, newPropType] of newItemDef.props.entries()) {
            const oldPropType = existingObject.type.props.get(propName)
            if (oldPropType) {
              // Merge these two prop types into a single intersection type.
              existingObject.type.props.set(propName, mergeIntersection(oldPropType, newPropType))
            } else {
              // If this prop doesn't exist in old object, just add it.
              existingObject.type.props.set(propName, newPropType)
            }
          }
        }
      } else {
        // 2. If the new item isn't an object, just push it into the intersection items.
        this.$def.items.push(value)
      }

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

/**
 * Merges two annotated types into a single intersection type.
 * Also merges metadata so right side's keys override left side's.
 *
 * Additional rule for final, same-designType:
 * If both sides are final (kind === '') and share the same designType,
 * simply merge metadata + flags (no intersection node is created).
 */
function mergeIntersection(
  left: TAnscriptAnnotatedType,
  right: TAnscriptAnnotatedType
): TAnscriptAnnotatedType {
  // Special case: both final and same designType => no intersection node needed.
  if (left.type.kind === '' && right.type.kind === '') {
    return {
      __is_anscript_annotated_type: true,
      type: {
        kind: '',
        designType: left.type.designType === right.type.designType ? left.type.designType : 'never',
        type: left.type.type,
        flags: new Set([...left.type.flags, ...right.type.flags]),
      },
      metadata: mergeMetadata(left.metadata, right.metadata),
      optional: left.optional || right.optional,
      validator(opts?: TValidatorOptions) {
        return new Validator(this, opts)
      },
    }
  }

  // If `left` is already an intersection...
  if (left.type.kind === 'intersection') {
    // Merge all items from right into left's items
    return {
      __is_anscript_annotated_type: true,
      type: {
        ...left.type,
        items:
          right.type.kind === 'intersection'
            ? [...left.type.items, ...right.type.items]
            : [...left.type.items, right],
      },
      metadata: mergeMetadata(left.metadata, right.metadata),
      optional: left.optional || right.optional,
      validator(opts?: TValidatorOptions) {
        return new Validator(this, opts)
      },
    }
  } else {
    // If `left` is not an intersection, but `right` is, flatten into right:
    if (right.type.kind === 'intersection') {
      return {
        __is_anscript_annotated_type: true,
        type: {
          ...right.type,
          items: [left, ...right.type.items],
        },
        metadata: mergeMetadata(left.metadata, right.metadata),
        optional: left.optional || right.optional,
        validator(opts?: TValidatorOptions) {
          return new Validator(this, opts)
        },
      }
    } else {
      // Neither is an intersection => create new intersection with both.
      const merged = defineAnnotatedType('intersection').item(left).item(right)
      // Combine their metadata on the new intersection type.
      merged.$type.metadata = mergeMetadata(left.metadata, right.metadata)
      merged.$type.optional = left.optional || right.optional
      return merged.$type
    }
  }
}

/**
 * Copies all entries from `leftMeta` into a new Map, then overrides
 * any matching keys with `rightMeta` entries. Right wins on conflicts.
 */
function mergeMetadata(
  leftMeta: Map<string, unknown>,
  rightMeta: Map<string, unknown>
): Map<string, unknown> {
  const result = new Map(leftMeta)
  for (const [key, val] of rightMeta.entries()) {
    result.set(key, val)
  }
  return result
}
