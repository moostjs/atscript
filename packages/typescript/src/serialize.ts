import {
  type TAtscriptAnnotatedType,
  type TAtscriptTypeDef,
  type TAtscriptTypeFinal,
  type TMetadataMap,
} from './annotated-type'
import { forAnnotatedType } from './traverse'
import { Validator, type TValidatorOptions } from './validator'

// ---------------------------------------------------------------------------
// Serialized format types (plain JSON-safe mirrors of runtime types)
// ---------------------------------------------------------------------------

/** Current serialization format version. Bumped on breaking changes to the serialized shape. */
export const SERIALIZE_VERSION = 1

/** Top-level serialized annotated type. JSON-safe representation of a {@link TAtscriptAnnotatedType}. */
export interface TSerializedAnnotatedType extends TSerializedAnnotatedTypeInner {
  /** Format version for forward compatibility */
  $v: number
}

/** Serialized annotated type node (used for nested types within the top-level). */
export interface TSerializedAnnotatedTypeInner {
  type: TSerializedTypeDef
  metadata: Record<string, unknown>
  optional?: boolean
  id?: string
}

export interface TSerializedTypeFinal {
  kind: ''
  designType: string
  value?: string | number | boolean
  tags: string[]
}

export interface TSerializedTypeObject {
  kind: 'object'
  props: Record<string, TSerializedAnnotatedTypeInner>
  propsPatterns: Array<{
    pattern: { source: string; flags: string }
    def: TSerializedAnnotatedTypeInner
  }>
  tags: string[]
}

export interface TSerializedTypeArray {
  kind: 'array'
  of: TSerializedAnnotatedTypeInner
  tags: string[]
}

export interface TSerializedTypeComplex {
  kind: 'union' | 'intersection' | 'tuple'
  items: TSerializedAnnotatedTypeInner[]
  tags: string[]
}

export type TSerializedTypeDef =
  | TSerializedTypeFinal
  | TSerializedTypeObject
  | TSerializedTypeArray
  | TSerializedTypeComplex

// ---------------------------------------------------------------------------
// Serialization options
// ---------------------------------------------------------------------------

/** Context passed to {@link TSerializeOptions.processAnnotation} for each annotation entry. */
export interface TProcessAnnotationContext {
  /** Annotation key, e.g. "meta.label" */
  key: string
  /** Annotation value */
  value: unknown
  /** Property path to the current node, e.g. ["address", "city"] */
  path: string[]
  /** The `kind` of the current type node */
  kind: '' | 'object' | 'array' | 'union' | 'intersection' | 'tuple'
}

/** Options for controlling which annotations are included during serialization. */
export interface TSerializeOptions {
  /** Simple list of annotation keys to strip */
  ignoreAnnotations?: string[]

  /**
   * Advanced per-annotation callback. Called after `ignoreAnnotations` filtering.
   * Return `{ key, value }` to keep (possibly renamed/transformed).
   * Return `undefined` or `void` to strip the annotation.
   */
  processAnnotation?: (
    ctx: TProcessAnnotationContext
  ) => { key: string; value: unknown } | undefined | void
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Converts a runtime {@link TAtscriptAnnotatedType} into a plain JSON-safe object.
 *
 * The result can be stored, transmitted over the network, and later
 * restored with {@link deserializeAnnotatedType}.
 *
 * @example
 * ```ts
 * import { serializeAnnotatedType } from '@atscript/typescript'
 *
 * const json = serializeAnnotatedType(MyInterface)
 * // json is a plain object safe for JSON.stringify
 * ```
 *
 * @param type - The annotated type to serialize.
 * @param options - Optional filtering/transformation for annotations.
 * @returns A versioned, JSON-safe representation of the type.
 */
export function serializeAnnotatedType(
  type: TAtscriptAnnotatedType,
  options?: TSerializeOptions
): TSerializedAnnotatedType {
  const result = serializeNode(type, [], options) as TSerializedAnnotatedType
  result.$v = SERIALIZE_VERSION
  return result
}

function serializeNode(
  def: TAtscriptAnnotatedType,
  path: string[],
  options: TSerializeOptions | undefined
): TSerializedAnnotatedTypeInner {
  const result: TSerializedAnnotatedTypeInner = {
    type: serializeTypeDef(def, path, options),
    metadata: serializeMetadata(def.metadata, path, def.type.kind, options),
  }
  if (def.optional) {
    result.optional = true
  }
  if (def.id) {
    result.id = def.id
  }
  return result
}

function serializeTypeDef(
  def: TAtscriptAnnotatedType,
  path: string[],
  options: TSerializeOptions | undefined
): TSerializedTypeDef {
  return forAnnotatedType<TSerializedTypeDef>(def, {
    phantom(d) {
      return {
        kind: '' as const,
        designType: d.type.designType,
        tags: Array.from(d.type.tags),
      }
    },
    final(d) {
      const result: TSerializedTypeFinal = {
        kind: '',
        designType: d.type.designType,
        tags: Array.from(d.type.tags),
      }
      if (d.type.value !== undefined) {
        result.value = d.type.value
      }
      return result
    },
    object(d) {
      const props: Record<string, TSerializedAnnotatedTypeInner> = {}
      for (const [key, val] of d.type.props.entries()) {
        props[key] = serializeNode(val, [...path, key], options)
      }
      const propsPatterns = d.type.propsPatterns.map(pp => ({
        pattern: { source: pp.pattern.source, flags: pp.pattern.flags },
        def: serializeNode(pp.def, path, options),
      }))
      return {
        kind: 'object' as const,
        props,
        propsPatterns,
        tags: Array.from(d.type.tags),
      }
    },
    array(d) {
      return {
        kind: 'array' as const,
        of: serializeNode(d.type.of, path, options),
        tags: Array.from(d.type.tags),
      }
    },
    union(d) {
      return {
        kind: 'union' as const,
        items: d.type.items.map(item => serializeNode(item, path, options)),
        tags: Array.from(d.type.tags),
      }
    },
    intersection(d) {
      return {
        kind: 'intersection' as const,
        items: d.type.items.map(item => serializeNode(item, path, options)),
        tags: Array.from(d.type.tags),
      }
    },
    tuple(d) {
      return {
        kind: 'tuple' as const,
        items: d.type.items.map(item => serializeNode(item, path, options)),
        tags: Array.from(d.type.tags),
      }
    },
  })
}

function serializeMetadata(
  metadata: TMetadataMap<AtscriptMetadata>,
  path: string[],
  kind: string,
  options: TSerializeOptions | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const ignoreSet = options?.ignoreAnnotations ? new Set(options.ignoreAnnotations) : undefined

  for (const [key, value] of metadata.entries()) {
    if (ignoreSet?.has(key as string)) {
      continue
    }

    if (options?.processAnnotation) {
      const processed = options.processAnnotation({
        key: key as string,
        value,
        path,
        kind: kind as TProcessAnnotationContext['kind'],
      })
      if (processed === undefined || processed === null) {
        continue
      }
      result[processed.key] = processed.value
      continue
    }

    result[key as string] = value
  }

  return result
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

/**
 * Restores a runtime {@link TAtscriptAnnotatedType} from its serialized form.
 *
 * The returned object is fully functional — it has a working `.validator()` method
 * and can be used with {@link buildJsonSchema} or the {@link Validator} directly.
 *
 * @example
 * ```ts
 * import { deserializeAnnotatedType } from '@atscript/typescript'
 *
 * const type = deserializeAnnotatedType(json)
 * type.validator().validate(someValue) // works
 * ```
 *
 * @param data - A serialized type produced by {@link serializeAnnotatedType}.
 * @returns A live annotated type with validator support.
 * @throws If the serialized version doesn't match {@link SERIALIZE_VERSION}.
 */
export function deserializeAnnotatedType(data: TSerializedAnnotatedType): TAtscriptAnnotatedType {
  if (data.$v !== SERIALIZE_VERSION) {
    throw new Error(
      `Unsupported serialized type version: ${data.$v} (expected ${SERIALIZE_VERSION})`
    )
  }
  return deserializeNode(data)
}

function deserializeNode(data: TSerializedAnnotatedTypeInner): TAtscriptAnnotatedType {
  const metadata = new Map(Object.entries(data.metadata)) as TMetadataMap<AtscriptMetadata>
  const type = deserializeTypeDef(data.type)

  const result: TAtscriptAnnotatedType = {
    __is_atscript_annotated_type: true,
    type,
    metadata,
    validator(opts?: Partial<TValidatorOptions>) {
      return new Validator(this as TAtscriptAnnotatedType, opts)
    },
  }

  if (data.optional) {
    result.optional = true
  }
  if (data.id) {
    result.id = data.id
  }

  return result
}

function deserializeTypeDef(t: TSerializedTypeDef): TAtscriptTypeDef {
  const tags = new Set(t.tags) as Set<AtscriptPrimitiveTags>

  switch (t.kind) {
    case '': {
      const result: TAtscriptTypeFinal = {
        kind: '',
        designType: t.designType as TAtscriptTypeFinal['designType'],
        tags,
      }
      if (t.value !== undefined) {
        result.value = t.value
      }
      return result
    }
    case 'object': {
      const props = new Map<string, TAtscriptAnnotatedType>()
      for (const [key, val] of Object.entries(t.props)) {
        props.set(key, deserializeNode(val))
      }
      const propsPatterns = t.propsPatterns.map(pp => ({
        pattern: new RegExp(pp.pattern.source, pp.pattern.flags),
        def: deserializeNode(pp.def),
      }))
      return { kind: 'object', props, propsPatterns, tags }
    }
    case 'array': {
      return { kind: 'array', of: deserializeNode(t.of), tags }
    }
    case 'union':
    case 'intersection':
    case 'tuple': {
      return {
        kind: t.kind,
        items: t.items.map(item => deserializeNode(item)),
        tags,
      }
    }
    default: {
      throw new Error(`Unknown serialized type kind "${(t as any).kind}"`)
    }
  }
}
