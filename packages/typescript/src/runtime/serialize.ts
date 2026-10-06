import {
  type TAtscriptAnnotatedType,
  type TAtscriptTypeDef,
  type TAtscriptTypeFinal,
  type TMetadataMap,
  createAnnotatedTypeNode,
  isAnnotatedType,
} from './annotated-type'
import { forAnnotatedType } from './traverse'
import type { Validator } from './validator'

// ---------------------------------------------------------------------------
// Serialized format types (plain JSON-safe mirrors of runtime types)
// ---------------------------------------------------------------------------

/** Current serialization format version. Bumped on breaking changes to the serialized shape. */
export const SERIALIZE_VERSION = 2

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
  /** Reference to another named type (chain/FK or plain); shallow `{ id, metadata }` target when `refDepth` has a `.5` fractional part. */
  ref?: { type: TSerializedAnnotatedTypeInner | TSerializedShallowRefTarget; field: string }
}

/** Shallow ref-target shape: identity + interface-level metadata only, no structural body. */
export interface TSerializedShallowRefTarget {
  id: string
  metadata: Record<string, unknown>
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

export interface TSerializedTypeRef {
  kind: '$ref'
  id: string
  /**
   * The entry's `metadata` / `optional` belong to the referencing node (a prop's own
   * annotations merged over the type's), not to the first node serialized under `id`.
   * The deserializer then builds a node of its own over the shared type. The entry then also
   * carries the use-site `ref` (FK target) when `refDepth` > 0 and the node has one.
   */
  own?: true
}

export type TSerializedTypeDef =
  | TSerializedTypeFinal
  | TSerializedTypeObject
  | TSerializedTypeArray
  | TSerializedTypeComplex
  | TSerializedTypeRef

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

  /**
   * How many levels of `.ref` (references to other named types) to expand. `0` (default) strips refs; integer
   * `N` expands N levels with full target bodies. A `.5` fractional part (e.g. `0.5`, `1.5`)
   * emits a shallow `{ id, metadata }` at the tail level instead of the full body.
   */
  refDepth?: number
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
  const visited = new Visited()
  const result = serializeNode(type, [], options, visited) as TSerializedAnnotatedType
  result.$v = SERIALIZE_VERSION
  return result
}

/**
 * Named types serialized so far. `own` keeps, per id, the first node serialized under it (and
 * the `refDepth` it was serialized at); a later reference is compared against it, by a
 * fingerprint of what it carries (metadata, `optional` and `ref`), to tell a reference that adds
 * nothing from one whose prop annotations or FK target differ. The first node's key is computed
 * only when a revisit needs it, and memoized.
 */
class Visited extends Set<string> {
  readonly own = new Map<string, { def: TAtscriptAnnotatedType; refDepth: number }>()
  private readonly firstKeys = new Map<string, string>()
  private readonly identities = new WeakMap<object, number>()
  private nextId = 0

  /** Whether `def` (revisiting its id at `refDepth`) carries something other than the first node. */
  differsFromFirst(def: TAtscriptAnnotatedType, refDepth: number): boolean {
    const id = def.id!
    let first = this.firstKeys.get(id)
    if (first === undefined) {
      const { def: firstDef, refDepth: firstDepth } = this.own.get(id)!
      first = ownKey(firstDef, this, firstDepth)
      this.firstKeys.set(id, first)
    }
    return first !== ownKey(def, this, refDepth)
  }

  /** Stable per-run identity of a function / class instance (compared by reference). */
  identity(value: object): number {
    let id = this.identities.get(value)
    if (id === undefined) {
      id = ++this.nextId
      this.identities.set(value, id)
    }
    return id
  }
}

/**
 * A stable, cycle-safe, BigInt-tolerant comparison key of raw annotation values. Plain objects
 * and arrays compare structurally; a type reference (a getter or an annotated type) by the type it
 * resolves to, so equal targets collapse and different ones do not; other functions and objects by
 * identity.
 */
function fingerprint(value: unknown, visited: Visited, ancestors = new Set<object>()): string {
  switch (typeof value) {
    case 'bigint': {
      return `${value}n`
    }
    case 'string': {
      return JSON.stringify(value)
    }
    case 'function': {
      const target = resolveAnnotationTarget(value)
      if (target) {
        return targetKey(target, visited)
      }
      return `fn#${visited.identity(value)}`
    }
    case 'object': {
      if (value === null) {
        return 'null'
      }
      const target = resolveAnnotationTarget(value)
      if (target) {
        return targetKey(target, visited)
      }
      if (!isPlainOrArray(value)) {
        return `obj#${visited.identity(value)}`
      }
      if (ancestors.has(value)) {
        return '[circular]'
      }
      ancestors.add(value)
      const body = Array.isArray(value)
        ? value.map(v => fingerprint(v, visited, ancestors)).join(',')
        : Object.entries(value)
            .map(([k, v]) => `${JSON.stringify(k)}:${fingerprint(v, visited, ancestors)}`)
            .join(',')
      ancestors.delete(value)
      return `[${body}]`
    }
    default: {
      return String(value)
    }
  }
}

/** A plain object or an array (as opposed to a class instance), the shapes compared structurally. */
function isPlainOrArray(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return Array.isArray(value) || proto === Object.prototype || proto === null
}

/** Comparison key of a resolved annotation target: its id, else its identity. */
function targetKey(target: TAtscriptAnnotatedType, visited: Visited): string {
  return target.id ? `ref#${target.id}` : `ref@${visited.identity(target)}`
}

/** What a node carries of its own (metadata, optionality, FK target), as a comparison key. */
function ownKey(def: TAtscriptAnnotatedType, visited: Visited, refDepth: number): string {
  const entries = [...def.metadata.entries()].map(
    ([k, v]) => `${JSON.stringify(k)}:${fingerprint(v, visited)}`
  )
  const refTarget = refDepth > 0 ? def.ref?.type() : undefined
  const ref = def.ref && refTarget ? `${refTarget.id ?? ''}.${def.ref.field}` : ''
  return `${entries.join(',')}|${def.optional ? 1 : 0}|${ref}`
}

function serializeRef(
  def: TAtscriptAnnotatedType,
  options: TSerializeOptions | undefined,
  visited: Visited
): TSerializedAnnotatedTypeInner['ref'] {
  const refDepth = options?.refDepth ?? 0
  if (refDepth > 0 && def.ref) {
    const refTarget = def.ref.type()
    if (refTarget) {
      return {
        field: def.ref.field,
        type:
          refDepth < 1 && isHalfStep(refDepth)
            ? (shallowTarget(
                refTarget,
                options,
                { visited, depth: 1 },
                true
              ) as TSerializedShallowRefTarget)
            : serializeNode(refTarget, [], { ...options!, refDepth: refDepth - 1 }, visited),
      }
    }
  }
  return undefined
}

function serializeNode(
  def: TAtscriptAnnotatedType,
  path: string[],
  options: TSerializeOptions | undefined,
  visited: Visited
): TSerializedAnnotatedTypeInner {
  const refDepth = options?.refDepth ?? 0
  const metadata = () =>
    serializeMetadata(def.metadata, { path, kind: def.type.kind }, options, { visited, depth: 0 })
  // Cycle detection: if this named type was already serialized, emit a $ref. A reference
  // whose own metadata / optionality / ref differ from the first node's (a prop annotation
  // merged over the type's, another FK target) says so (`own`), so it does not collapse onto
  // the first node on the way back. A collapsed reference carries no metadata, so
  // `processAnnotation` is not consulted for it.
  if (def.id && visited.has(def.id)) {
    const differs = visited.differsFromFirst(def, refDepth)
    const ref = differs ? serializeRef(def, options, visited) : undefined
    return {
      type: { kind: '$ref' as const, id: def.id, ...(differs ? { own: true as const } : {}) },
      metadata: differs ? metadata() : {},
      ...(def.optional ? { optional: true } : {}),
      id: def.id,
      ...(ref ? { ref } : {}),
    }
  }
  if (def.id) {
    visited.add(def.id)
    visited.own.set(def.id, { def, refDepth })
  }
  const result: TSerializedAnnotatedTypeInner = {
    type: serializeTypeDef(def, path, options, visited),
    metadata: metadata(),
  }
  if (def.optional) {
    result.optional = true
  }
  if (def.id) {
    result.id = def.id
  }
  const ref = serializeRef(def, options, visited)
  if (ref) {
    result.ref = ref
  }
  return result
}

function isHalfStep(refDepth: number): boolean {
  return refDepth - Math.floor(refDepth) === 0.5
}

function serializeTypeDef(
  def: TAtscriptAnnotatedType,
  path: string[],
  options: TSerializeOptions | undefined,
  visited: Visited
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
        props[key] = serializeNode(val, [...path, key], options, visited)
      }
      const propsPatterns = d.type.propsPatterns.map(pp => ({
        pattern: { source: pp.pattern.source, flags: pp.pattern.flags },
        def: serializeNode(pp.def, path, options, visited),
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
        of: serializeNode(d.type.of, path, options, visited),
        tags: Array.from(d.type.tags),
      }
    },
    union(d) {
      return {
        kind: 'union' as const,
        items: d.type.items.map(item => serializeNode(item, path, options, visited)),
        tags: Array.from(d.type.tags),
      }
    },
    intersection(d) {
      return {
        kind: 'intersection' as const,
        items: d.type.items.map(item => serializeNode(item, path, options, visited)),
        tags: Array.from(d.type.tags),
      }
    },
    tuple(d) {
      return {
        kind: 'tuple' as const,
        items: d.type.items.map(item => serializeNode(item, path, options, visited)),
        tags: Array.from(d.type.tags),
      }
    },
  })
}

/**
 * Resolves a type reference held in an annotation value: an annotated type itself (same-file
 * refs) or the getter generated for a cross-file ref. Generated getters are zero-arity, plain
 * synchronous arrow functions (no `prototype`, `Function` constructor); that is the only shape
 * invoked. Classes, `function` expressions, async/generator functions and any other function
 * are never called, so serializing never runs user code.
 */
function resolveAnnotationTarget(value: unknown): TAtscriptAnnotatedType | undefined {
  if (isAnnotatedType(value)) {
    return value
  }
  if (
    typeof value === 'function' &&
    value.length === 0 &&
    !Object.prototype.hasOwnProperty.call(value, 'prototype') &&
    value.constructor === Function
  ) {
    const fn = value as () => unknown
    try {
      const target = fn()
      return isAnnotatedType(target) ? target : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * `{ id }` for a referenced type, plus its metadata (serialized at the next depth, so every
 * nested reference collapses to `{ id }`) when `withMetadata`.
 */
function shallowTarget(
  target: TAtscriptAnnotatedType,
  options: TSerializeOptions | undefined,
  state: { visited: Visited; depth: number },
  withMetadata: boolean
): { id: string; metadata?: Record<string, unknown> } {
  return {
    id: target.id ?? '',
    ...(withMetadata
      ? {
          metadata: serializeMetadata(
            target.metadata,
            { path: [], kind: target.type.kind },
            options,
            state
          ),
        }
      : {}),
  }
}

/**
 * Makes an annotation value JSON-safe: type references (a getter or a class, as emitted for `ref`
 * arguments and qualified query field refs) become shallow targets `{ id, metadata }`
 * (`refDepth > 0`) or `{ id }` (`refDepth` 0). Inside a shallow target's own metadata (`depth` >= 1)
 * every reference is `{ id }`, so the output is bounded and cycle-free. Plain objects and arrays
 * recurse; other values pass unchanged.
 */
function serializeAnnotationValue(
  value: unknown,
  options: TSerializeOptions | undefined,
  state: { visited: Visited; depth: number; ancestors?: Set<object> }
): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value
  }
  const target = resolveAnnotationTarget(value)
  if (target) {
    return shallowTarget(
      target,
      options,
      { visited: state.visited, depth: state.depth + 1 },
      state.depth === 0 && (options?.refDepth ?? 0) > 0
    )
  }
  if (typeof value === 'function') {
    return value
  }
  if (!isPlainOrArray(value)) {
    return value
  }
  // A cyclic plain object / array cannot be expressed as JSON: cut the cycle.
  const ancestors = (state.ancestors ??= new Set())
  if (ancestors.has(value)) {
    return '[Circular]'
  }
  ancestors.add(value)
  const out = Array.isArray(value)
    ? value.map(item => serializeAnnotationValue(item, options, state))
    : Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, serializeAnnotationValue(v, options, state)])
      )
  ancestors.delete(value)
  return out
}

function serializeMetadata(
  metadata: TMetadataMap<AtscriptMetadata>,
  site: { path: string[]; kind: string },
  options: TSerializeOptions | undefined,
  state: { visited: Visited; depth: number }
): Record<string, unknown> {
  const { path, kind } = site
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
      result[processed.key] = serializeAnnotationValue(processed.value, options, state)
      continue
    }

    result[key as string] = serializeAnnotationValue(value, options, state)
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
  const resolved = new Map<string, TAtscriptAnnotatedType>()
  return deserializeNode(data, resolved)
}

function emptyObjectTypeDef(): TAtscriptTypeDef {
  return {
    kind: 'object',
    props: new Map(),
    propsPatterns: [],
    tags: new Set(),
  } as TAtscriptTypeDef
}

function toMetadataMap(record: Record<string, unknown>): TMetadataMap<AtscriptMetadata> {
  return new Map(Object.entries(record)) as TMetadataMap<AtscriptMetadata>
}

function deserializeRef(
  data: TSerializedAnnotatedTypeInner,
  resolved: Map<string, TAtscriptAnnotatedType>
): { type: () => TAtscriptAnnotatedType; field: string } | undefined {
  if (!data.ref) {
    return undefined
  }
  const refTargetData = data.ref.type
  if ('type' in refTargetData) {
    const deserializedRefTarget = deserializeNode(refTargetData, resolved)
    return { type: () => deserializedRefTarget, field: data.ref.field }
  }
  // Shallow ref: empty props is the "body unavailable" signal; consumers must fetch
  // the body from the target's own meta endpoint using refTarget.id.
  const sentinel = createAnnotatedTypeNode(
    emptyObjectTypeDef(),
    toMetadataMap(refTargetData.metadata),
    { id: refTargetData.id || undefined }
  )
  return { type: () => sentinel, field: data.ref.field }
}

function deserializeNode(
  data: TSerializedAnnotatedTypeInner,
  resolved: Map<string, TAtscriptAnnotatedType>
): TAtscriptAnnotatedType {
  if (data.type.kind === '$ref') {
    const { id: refId, own } = data.type as TSerializedTypeRef
    const target = resolved.get(refId)
    if (!own) {
      return (
        target ||
        createAnnotatedTypeNode(emptyObjectTypeDef(), new Map() as TMetadataMap<AtscriptMetadata>, {
          id: refId,
        })
      )
    }
    // A node of its own (the referencing prop's annotations) over the shared type. The type is
    // read through the target, which may still be under construction (a cyclic reference).
    const node = createAnnotatedTypeNode(
      target?.type ?? emptyObjectTypeDef(),
      toMetadataMap(data.metadata),
      { id: refId, optional: data.optional || undefined, ref: deserializeRef(data, resolved) }
    )
    if (target) {
      Object.defineProperty(node, 'type', {
        get: () => target.type,
        set: v => {
          target.type = v
        },
        enumerable: true,
        configurable: true,
      })
    }
    return node
  }

  const metadata = toMetadataMap(data.metadata)

  // Register placeholder before recursing to break cycles
  let result: TAtscriptAnnotatedType | undefined
  if (data.id) {
    const existing = resolved.get(data.id)
    if (existing) {
      return existing
    }
    result = createAnnotatedTypeNode(emptyObjectTypeDef(), metadata, {
      optional: data.optional || undefined,
      id: data.id,
    })
    resolved.set(data.id, result)
  }

  const type = deserializeTypeDef(data.type, resolved)

  const ref = deserializeRef(data, resolved)

  if (result) {
    result.type = type
    if (ref) {
      result.ref = ref
    }
    return result
  }

  return createAnnotatedTypeNode(type, metadata, {
    optional: data.optional || undefined,
    id: data.id || undefined,
    ref,
  })
}

function deserializeTypeDef(
  t: TSerializedTypeDef,
  resolved: Map<string, TAtscriptAnnotatedType>
): TAtscriptTypeDef {
  const tags = ('tags' in t ? new Set(t.tags) : new Set()) as Set<AtscriptPrimitiveTags>

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
        props.set(key, deserializeNode(val, resolved))
      }
      const propsPatterns = t.propsPatterns.map(pp => ({
        pattern: new RegExp(pp.pattern.source, pp.pattern.flags),
        def: deserializeNode(pp.def, resolved),
      }))
      return { kind: 'object', props, propsPatterns, tags }
    }
    case 'array': {
      return { kind: 'array', of: deserializeNode(t.of, resolved), tags }
    }
    case 'union':
    case 'intersection':
    case 'tuple': {
      return {
        kind: t.kind,
        items: t.items.map(item => deserializeNode(item, resolved)),
        tags,
      }
    }
    case '$ref': {
      // $ref is normally handled in deserializeNode; this is a defensive fallback.
      const existing = resolved.get(t.id)
      if (existing) {
        return existing.type
      }
      return { kind: 'object', props: new Map(), propsPatterns: [], tags }
    }
    default: {
      throw new Error(`Unknown serialized type kind "${(t as any).kind}"`)
    }
  }
}
