import {
  type TAtscriptAnnotatedType,
  type TAtscriptTypeArray,
  type TAtscriptTypeComplex,
  type TAtscriptTypeObject,
  type TMetadataMap,
  defineAnnotatedType as $,
  isAnnotatedTypeOfPrimitive,
  isPhantomType,
} from './annotated-type'

/**
 * Options for controlling the flattening process.
 */
export interface TFlattenOptions {
  /**
   * Called for each field (with a non-empty path prefix) after it has been added to the flat map.
   * Use this to inspect field type and metadata for domain-specific logic (e.g. index extraction).
   */
  onField?: (path: string, type: TAtscriptAnnotatedType, metadata: TMetadataMap<AtscriptMetadata>) => void

  /**
   * When set, top-level array fields get this metadata key set to `true`.
   * For example, `'mongo.__topLevelArray'` marks arrays that are direct collection fields.
   * Omit to skip tagging.
   */
  topLevelArrayTag?: string

  /**
   * Whether to exclude phantom types from the flat map.
   * When `true`, phantom-typed properties are skipped during traversal.
   * By default phantom types are included.
   */
  excludePhantomTypes?: boolean
}

/**
 * Flattens an annotated object type into a map of dot-separated paths to their annotated types.
 *
 * For an object like `{ address: { street: string, city: string } }`, the result contains:
 * - `''` → the root object type
 * - `'address'` → the address object type
 * - `'address.street'` → string type
 * - `'address.city'` → string type
 *
 * Arrays are recursed into (their element types are flattened with the same prefix).
 * Unions/intersections/tuples are recursed into (each branch contributes to the same path,
 * merging via synthetic union types when paths collide).
 *
 * @param type - The root annotated type (must be an object type).
 * @param options - Optional hooks for domain-specific processing.
 * @returns A map of dot-separated field paths to their annotated types.
 */
export function flattenAnnotatedType(
  type: TAtscriptAnnotatedType<TAtscriptTypeObject>,
  options?: TFlattenOptions
): Map<string, TAtscriptAnnotatedType> {
  const flatMap = new Map<string, TAtscriptAnnotatedType>()
  const skipPhantom = !!options?.excludePhantomTypes

  function addFieldToFlatMap(name: string, def: TAtscriptAnnotatedType) {
    const existing = flatMap.get(name) as
      | (TAtscriptAnnotatedType & { __flat_union?: boolean })
      | undefined
    if (existing) {
      const flatUnion = $('union').copyMetadata(existing.metadata).copyMetadata(def.metadata)
      if (existing.__flat_union) {
        ;(existing as TAtscriptAnnotatedType<TAtscriptTypeComplex>).type.items.forEach(item =>
          flatUnion.item(item)
        )
      } else {
        flatUnion.item(existing)
      }
      flatUnion.item(def)
      const unionType = flatUnion.$type as TAtscriptAnnotatedType & { __flat_union?: boolean }
      unionType.__flat_union = true
      flatMap.set(name, flatUnion.$type)
    } else {
      flatMap.set(name, def)
    }
  }

  function flattenArray(def: TAtscriptAnnotatedType, name: string) {
    switch (def.type.kind) {
      case 'object': {
        const items = Array.from(def.type.props.entries())
        for (const [key, value] of items) {
          if (skipPhantom && isPhantomType(value)) continue
          flattenType(value, name ? `${name}.${key}` : key, true)
        }
        break
      }
      case 'union':
      case 'intersection':
      case 'tuple':
        for (const item of def.type.items) {
          flattenArray(item, name)
        }
        break
      case 'array':
        flattenArray((def as TAtscriptAnnotatedType<TAtscriptTypeArray>).type.of, name)
        break
      default:
    }
  }

  function flattenType(def: TAtscriptAnnotatedType, prefix = '', inComplexTypeOrArray = false) {
    switch (def.type.kind) {
      case 'object':
        addFieldToFlatMap(prefix || '', def)
        for (const [key, value] of def.type.props.entries()) {
          if (skipPhantom && isPhantomType(value)) continue
          flattenType(value, prefix ? `${prefix}.${key}` : key, inComplexTypeOrArray)
        }
        break
      case 'array': {
        let typeArray = def as TAtscriptAnnotatedType<TAtscriptTypeArray>
        if (!inComplexTypeOrArray) {
          typeArray = $().refTo(def).copyMetadata(def.metadata)
            .$type as TAtscriptAnnotatedType<TAtscriptTypeArray>
          if (options?.topLevelArrayTag) {
            // @ts-expect-error dynamic metadata key
            typeArray.metadata.set(options.topLevelArrayTag, true)
          }
        }
        addFieldToFlatMap(prefix || '', typeArray)
        if (!isAnnotatedTypeOfPrimitive(typeArray.type.of)) {
          flattenArray(typeArray.type.of, prefix)
        }
        break
      }
      case 'intersection':
      case 'tuple':
      case 'union':
        for (const item of def.type.items) {
          flattenType(item, prefix, true)
        }
      // falls through
      default:
        addFieldToFlatMap(prefix || '', def)
        break
    }
    if (prefix) {
      options?.onField?.(prefix, def, def.metadata)
    }
  }

  flattenType(type)
  return flatMap
}
