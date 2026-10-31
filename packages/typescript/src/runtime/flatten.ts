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
import { touched } from './compiled-check/tracking'
import { enterCut, type TCutPath } from './cut'

/**
 * Options for controlling the flattening process.
 */
export interface TFlattenOptions {
  /**
   * Called for each field (with a non-empty path prefix) after it has been added to the flat map.
   * Use this to inspect field type and metadata for domain-specific logic (e.g. index extraction).
   */
  onField?: (
    path: string,
    type: TAtscriptAnnotatedType,
    metadata: TMetadataMap<AtscriptMetadata>
  ) => void

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

type TPath = TCutPath | undefined

/**
 * Flattens an annotated object type into a map of dot-separated paths to their annotated types.
 *
 * For an object like `{ address: { street: string, city: string } }`, the result contains:
 * - `''` → the root object type
 * - `'address'` → the address object type
 * - `'address.street'` → string type
 * - `'address.city'` → string type
 *
 * Arrays are recursed into (their element types are flattened with the same prefix). Unions,
 * tuples and intersections are recursed into (each item contributes to the same path, merging
 * via synthetic union types when paths collide). A recursive type is listed where it is reached
 * again, not expanded (the readers' recursion cut, see `cut.ts`). `onField` runs for a path once
 * its sub-paths are flattened.
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
  /** The walk's pending steps, last first: a type of any depth flattens without recursion. */
  const tasks: Array<() => void> = []

  function addFieldToFlatMap(name: string, def: TAtscriptAnnotatedType) {
    const existing = flatMap.get(name) as
      | (TAtscriptAnnotatedType & { __flat_union?: boolean })
      | undefined
    if (existing?.__flat_union) {
      // The union of the path's definitions (built here): one more of them. Like a new union of
      // all of them, it is not optional (see the union case of `flattenType`). Built anew on
      // every definition, a path many branches reach copied all the previous ones every time.
      const union = existing as TAtscriptAnnotatedType<TAtscriptTypeComplex>
      for (const [key, value] of def.metadata) {
        union.metadata.set(key, value)
      }
      union.type.items.push(def)
      touched(union.type)
      delete union.optional
    } else if (existing) {
      const flatUnion = $('union').copyMetadata(existing.metadata).copyMetadata(def.metadata)
      flatUnion.item(existing).item(def)
      const unionType = flatUnion.$type as TAtscriptAnnotatedType & { __flat_union?: boolean }
      unionType.__flat_union = true
      flatMap.set(name, flatUnion.$type)
    } else {
      flatMap.set(name, def)
    }
  }

  const fieldDone = (prefix: string, def: TAtscriptAnnotatedType) => {
    if (prefix) {
      options?.onField?.(prefix, def, def.metadata)
    }
  }

  /** The props of object `def` at `prefix` (`inComplex`: as array elements / union items). */
  function props(def: TAtscriptAnnotatedType, prefix: string, inComplex: boolean, path: TPath) {
    const entries = [...(def as TAtscriptAnnotatedType<TAtscriptTypeObject>).type.props]
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i]
      if (!(skipPhantom && isPhantomType(value))) {
        tasks.push(() => flattenType(value, prefix ? `${prefix}.${key}` : key, inComplex, path))
      }
    }
  }

  /** The sub-paths of array element / union item `def` at `name` (no entry of its own). */
  function flattenArray(def: TAtscriptAnnotatedType, name: string, path: TPath) {
    // (siblings reaching the same type are distinct paths and each expand)
    const below = enterCut(path, def)
    if (below === false) {
      return
    }
    switch (def.type.kind) {
      case 'object': {
        props(def, name, true, below)
        break
      }
      case 'union':
      case 'intersection':
      case 'tuple': {
        const items = (def.type as TAtscriptTypeComplex).items
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i]
          tasks.push(() => flattenArray(item, name, below))
        }
        break
      }
      case 'array': {
        const of = (def as TAtscriptAnnotatedType<TAtscriptTypeArray>).type.of
        tasks.push(() => flattenArray(of, name, below))
        break
      }
      default:
    }
  }

  /** Flattens `def` at `prefix`, below `path`. */
  function flattenType(
    def: TAtscriptAnnotatedType,
    prefix: string,
    inComplexTypeOrArray: boolean,
    path: TPath
  ) {
    const below = enterCut(path, def)
    if (below === false) {
      // (a recursion: listed, not expanded)
      addFieldToFlatMap(prefix, def)
      fieldDone(prefix, def)
      return
    }
    switch (def.type.kind) {
      case 'object': {
        addFieldToFlatMap(prefix, def)
        tasks.push(() => fieldDone(prefix, def))
        props(def, prefix, inComplexTypeOrArray, below)
        break
      }
      case 'array': {
        let typeArray = def as TAtscriptAnnotatedType<TAtscriptTypeArray>
        if (!inComplexTypeOrArray) {
          typeArray = $().type(def).copyMetadata(def.metadata)
            .$type as TAtscriptAnnotatedType<TAtscriptTypeArray>
          if (def.optional) {
            typeArray.optional = def.optional
          }
          if (options?.topLevelArrayTag) {
            // @ts-expect-error dynamic metadata key
            typeArray.metadata.set(options.topLevelArrayTag, true)
          }
        }
        addFieldToFlatMap(prefix, typeArray)
        tasks.push(() => fieldDone(prefix, def))
        if (!isAnnotatedTypeOfPrimitive(typeArray.type.of)) {
          const of = typeArray.type.of
          tasks.push(() => flattenArray(of, prefix, below))
        }
        break
      }
      case 'intersection':
      case 'tuple':
      case 'union': {
        tasks.push(() => {
          addFieldToFlatMap(prefix, def)
          if (def.optional) {
            const entry = flatMap.get(prefix)
            if (entry) {
              entry.optional = def.optional
            }
          }
          fieldDone(prefix, def)
        })
        const items = (def.type as TAtscriptTypeComplex).items
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i]
          tasks.push(() => flattenType(item, prefix, true, below))
        }
        break
      }
      default: {
        addFieldToFlatMap(prefix, def)
        fieldDone(prefix, def)
        break
      }
    }
  }

  flattenType(type, '', false, undefined)
  for (let task = tasks.pop(); task; task = tasks.pop()) {
    task()
  }
  return flatMap
}
