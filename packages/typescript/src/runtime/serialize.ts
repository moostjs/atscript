import {
  type TAtscriptAnnotatedType,
  type TAtscriptTypeDef,
  type TAtscriptTypeFinal,
  type TMetadataMap,
  createAnnotatedTypeNode,
  createMetadataMap,
  createObjectTypeDef,
  isAnnotatedType,
} from './annotated-type'
import { cutAs, cutKey } from './cut'
import { statelessRegExp } from './stateless-regex'
import { runWalk, type TWalk } from './traverse'
import { uniqueName } from './unique-name'
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
  /**
   * The type's own id when the payload `id` differs from it: distinct types sharing a name
   * (from different modules) get unique payload ids (`Name`, `Name@1`, `Name@2`, …), which
   * `$ref` entries use; `deserializeAnnotatedType` restores this one as the type's `id`.
   */
  origId?: string
  /**
   * The node has no id of its own: `id` is a payload id given to a reference without one that
   * reaches itself (a reference to a prop of a type, inside that prop: `d?: { x?: T.d }`), so
   * the `$ref` entries below it can point to it. `deserializeAnnotatedType` gives it no id.
   */
  anon?: true
  /**
   * The readers' recursion cut (see `cut.ts`) of a node without an id whose def stands for the
   * same type as other defs of the payload (a path override's copy of a def and that def): one
   * tag per type, restored on the deserialized defs.
   */
  cut?: number
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

  /**
   * Per-node annotation overrides, applied over the node's own metadata BEFORE
   * `ignoreAnnotations` / `processAnnotation` (which still filter them). Called with the owning
   * annotated type node for every serialized metadata block (type nodes and shallow ref /
   * annotation-value targets; never for collapsed `$ref` uses). Keys absent from the node are
   * added, existing keys are replaced, and a key whose value is `undefined` is removed. Must be a
   * pure function of the node: the repeated-type detector compares the nodes' own metadata, and a
   * collapsed use restores to the first node's (overridden) metadata. Runtime metadata is never
   * mutated.
   */
  annotationOverrides?: (
    type: TAtscriptAnnotatedType
  ) => Readonly<Record<string, unknown>> | undefined
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
  const refDepth = options?.refDepth ?? 0
  indexPayload(type, refDepth, visited)
  const result = runWalk(serializeNode(type, [], options, visited)) as TSerializedAnnotatedType
  result.$v = SERIALIZE_VERSION
  return result
}

/**
 * Named types serialized so far, by payload id (see {@link Visited.keyOf}). `own` keeps, per
 * id, the first node serialized under it (and the `refDepth` it was serialized at); a later
 * reference is compared against it, by a fingerprint of what it carries (metadata, `optional`
 * and `ref`), to tell a reference that adds nothing from one whose prop annotations or FK target
 * differ. The first node's fingerprint is computed only when a revisit needs it, and memoized.
 */
class Visited {
  readonly own = new Map<string, { def: TAtscriptAnnotatedType; refDepth: number }>()
  /**
   * The nodes without an id met more than once (see `indexPayload`): serialized once, with a
   * payload id, and referenced (`$ref`, `anon`) wherever else they are.
   */
  readonly repeated = new Set<object>()
  private readonly firstKeys = new Map<string, string>()
  private readonly identities = new WeakMap<object, number>()
  private nextId = 0
  /** Payload ids by type def (see {@link keyOf}). */
  private readonly keys = new WeakMap<object, string>()
  /** The payload ids given so far. */
  private readonly taken = new Set<string>()
  /** The `cut` payload of defs (see `indexPayload`). */
  readonly cutKeys = new WeakMap<object, number>()

  /**
   * The payload id of named type `def`: its id, unless a different type (another type def)
   * took it first (`Name@1`, `Name@2`, …) — distinct types never collapse onto one another.
   */
  keyOf(def: TAtscriptAnnotatedType): string {
    let key = this.keys.get(def.type)
    if (key === undefined) {
      key = uniqueName(def.id ?? ANON_ID, k => this.taken.has(k), '@')
      this.taken.add(key)
      this.keys.set(def.type, key)
    }
    return key
  }

  /** Whether `def` (revisiting `key` at `refDepth`) carries something other than the first node. */
  differsFromFirst(def: TAtscriptAnnotatedType, key: string, refDepth: number): boolean {
    let first = this.firstKeys.get(key)
    if (first === undefined) {
      const { def: firstDef, refDepth: firstDepth } = this.own.get(key)!
      first = ownKey(firstDef, this, firstDepth)
      this.firstKeys.set(key, first)
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

/**
 * Comparison key of a resolved annotation target: its type def's identity (two references to
 * one type compare equal; distinct types sharing an id do not).
 */
function targetKey(target: TAtscriptAnnotatedType, visited: Visited): string {
  return `ref@${visited.identity(target.type ?? target)}`
}

/** What a node carries of its own (metadata, optionality, FK target), as a comparison key. */
function ownKey(def: TAtscriptAnnotatedType, visited: Visited, refDepth: number): string {
  const entries = [...def.metadata.entries()].map(
    ([k, v]) => `${JSON.stringify(k)}:${fingerprint(v, visited)}`
  )
  const refTarget = refDepth > 0 ? def.ref?.type() : undefined
  const ref = def.ref && refTarget ? `${targetKey(refTarget, visited)}.${def.ref.field}` : ''
  return `${entries.join(',')}|${def.optional ? 1 : 0}|${ref}`
}

function* serializeRef(
  def: TAtscriptAnnotatedType,
  options: TSerializeOptions | undefined,
  visited: Visited
): TWalk<TSerializedAnnotatedTypeInner['ref']> {
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
            : ((yield serializeNode(
                refTarget,
                [],
                { ...options!, refDepth: refDepth - 1 },
                visited
              )) as TSerializedAnnotatedTypeInner),
      }
    }
  }
  return undefined
}

function* serializeNode(
  def: TAtscriptAnnotatedType,
  path: string[],
  options: TSerializeOptions | undefined,
  visited: Visited
): TWalk<TSerializedAnnotatedTypeInner> {
  const refDepth = options?.refDepth ?? 0
  const metadata = () =>
    serializeMetadata(def, { path, kind: def.type.kind }, options, { visited, depth: 0 })
  // Cycle detection: if this named type was already serialized, emit a $ref. A reference
  // whose own metadata / optionality / ref differ from the first node's (a prop annotation
  // merged over the type's, another FK target) says so (`own`), so it does not collapse onto
  // the first node on the way back. A collapsed reference carries no metadata, so
  // `processAnnotation` is not consulted for it.
  // (a node without an id held in several places of the tree — a type built from another holds
  // its nodes, a reference to a prop of a type, `T.d`, may reach itself through that prop —:
  // keyed by its type def like a named one, see `anon`; once, it is serialized in place, so the
  // payload is the same after a round trip)
  const key = def.id || visited.repeated.has(def.type) ? visited.keyOf(def) : undefined
  if (key !== undefined && visited.own.has(key)) {
    // (another declaration over the same def — an annotated alias reached inside its target —
    // is a node of its own too: read back as the first node, it would lose its id, which the
    // readers' recursion cut keys it by)
    const differs =
      (def.id !== undefined && def.id !== visited.own.get(key)!.def.id) ||
      visited.differsFromFirst(def, key, refDepth)
    const ref = differs
      ? ((yield serializeRef(def, options, visited)) as TSerializedAnnotatedTypeInner['ref'])
      : undefined
    const node: TSerializedAnnotatedTypeInner = {
      type: { kind: '$ref' as const, id: key, ...(differs ? { own: true as const } : {}) },
      metadata: differs ? metadata() : {},
    }
    if (def.optional) {
      node.optional = true
    }
    node.id = key
    if (!def.id) {
      node.anon = true
    } else if (key !== def.id) {
      node.origId = def.id
    }
    if (ref) {
      node.ref = ref
    }
    return node
  }
  if (key !== undefined) {
    visited.own.set(key, { def, refDepth })
  }
  const result: TSerializedAnnotatedTypeInner = {
    type: (yield serializeTypeDef(def, path, options, visited)) as TSerializedTypeDef,
    metadata: metadata(),
  }
  if (def.optional) {
    result.optional = true
  }
  if (key !== undefined) {
    result.id = key
    if (!def.id) {
      result.anon = true
    } else if (key !== def.id) {
      result.origId = def.id
    }
  }
  const cutTag = visited.cutKeys.get(def.type)
  if (cutTag !== undefined) {
    result.cut = cutTag
  }
  const ref = (yield serializeRef(def, options, visited)) as TSerializedAnnotatedTypeInner['ref']
  if (ref) {
    result.ref = ref
  }
  return result
}

/**
 * Walks the nodes the payload of `root` holds, in the order `serializeNode` writes them: its tree
 * and — `refDepth` permitting — the tree of each FK target, right after the node referencing it
 * (at one level less). `reach(node, first)` for every node met; `first` when its type is met for
 * the first time, the only time its children (and FK target) are walked — the payload writes a
 * type's tree once — except a primitive's FK target, written wherever the primitive is.
 */
function walkPayload(
  root: TAtscriptAnnotatedType,
  refDepth: number,
  reach: (node: TAtscriptAnnotatedType, first: boolean) => void
): void {
  const walked = new Set<object>()
  const pending: Array<[TAtscriptAnnotatedType | undefined, number]> = [[root, refDepth]]
  const next: Array<[TAtscriptAnnotatedType | undefined, number]> = []
  while (pending.length > 0) {
    const [node, depth] = pending.pop()!
    const type = node?.type
    if (!node || !type) {
      continue
    }
    const first = !walked.has(type)
    reach(node, first)
    if (first) {
      walked.add(type)
      if (type.kind === 'object') {
        for (const prop of type.props.values()) {
          next.push([prop, depth])
        }
        for (const { def } of type.propsPatterns) {
          next.push([def, depth])
        }
      } else if (type.kind === 'array') {
        next.push([type.of, depth])
      } else if (type.kind !== '') {
        for (const item of type.items) {
          next.push([item, depth])
        }
      }
    }
    if ((first || type.kind === '') && depth >= 1 && node.ref) {
      // (a half step, `refDepth` 0.5, writes the target's metadata only: see `serializeRef`)
      next.push([node.ref.type(), depth - 1])
    }
    while (next.length > 0) {
      pending.push(next.pop()!)
    }
  }
}

/**
 * Indexes the payload of `root` (one walk, see {@link walkPayload}; decided before anything is
 * written, so a copy deserialized from the payload, which shares exactly these nodes, decides
 * alike):
 * - `visited.repeated`: the types (by def) of the nodes without an id (not primitives) the
 *   payload holds in more than one place (FK targets included, so a node shared by the tree and a
 *   target's tree is written once wherever it is met first): a type built from another one
 *   references that one's nodes, a merge with the type itself holds its own merged prop.
 *   Serialized once each (see `serializeNode`).
 * - `visited.cutKeys`: the `cut` payload (see `TSerializedAnnotatedTypeInner.cut`) of the nodes
 *   without an id: the defs standing for one type to the cut (`cutKey`) get one tag, in the order
 *   first met, so a copy cuts and serializes alike.
 */
function indexPayload(root: TAtscriptAnnotatedType, refDepth: number, visited: Visited): void {
  const counted = new Set<object>()
  const groups = new Map<unknown, object[]>()
  walkPayload(root, refDepth, (node, first) => {
    const type = node.type
    if (type.kind === '') {
      return
    }
    // (a node without an id holding a def met before — also one a named node holds: a chain
    // alias `type L = T.x` is the field's def — is written once)
    if (counted.has(type) && !node.id) {
      visited.repeated.add(type)
    }
    counted.add(type)
    if (!first || node.id) {
      return
    }
    const key = cutKey(node)
    const group = groups.get(key)
    if (!group) {
      groups.set(key, [type])
    } else if (!group.includes(type)) {
      group.push(type)
    }
  })
  let tag = 0
  for (const defs of groups.values()) {
    if (defs.length > 1) {
      for (const def of defs) {
        visited.cutKeys.set(def, tag)
      }
      tag++
    }
  }
}

/** The payload id base of a reference without an id (see `anon`). */
const ANON_ID = 'Recursive'

function isHalfStep(refDepth: number): boolean {
  return refDepth - Math.floor(refDepth) === 0.5
}

function* serializeTypeDef(
  def: TAtscriptAnnotatedType,
  path: string[],
  options: TSerializeOptions | undefined,
  visited: Visited
): TWalk<TSerializedTypeDef> {
  const type = def.type
  switch (type.kind) {
    case '': {
      const result: TSerializedTypeFinal = {
        kind: '',
        designType: type.designType,
        tags: Array.from(type.tags),
      }
      if (type.value !== undefined && type.designType !== 'phantom') {
        result.value = type.value
      }
      return result
    }
    case 'object': {
      const props: Record<string, TSerializedAnnotatedTypeInner> = {}
      for (const [key, val] of type.props.entries()) {
        props[key] = (yield serializeNode(
          val,
          [...path, key],
          options,
          visited
        )) as TSerializedAnnotatedTypeInner
      }
      const propsPatterns: TSerializedTypeObject['propsPatterns'] = []
      for (const pp of type.propsPatterns) {
        propsPatterns.push({
          pattern: { source: pp.pattern.source, flags: pp.pattern.flags },
          def: (yield serializeNode(
            pp.def,
            path,
            options,
            visited
          )) as TSerializedAnnotatedTypeInner,
        })
      }
      return {
        kind: 'object' as const,
        props,
        propsPatterns,
        tags: Array.from(type.tags),
      }
    }
    case 'array': {
      return {
        kind: 'array' as const,
        of: (yield serializeNode(type.of, path, options, visited)) as TSerializedAnnotatedTypeInner,
        tags: Array.from(type.tags),
      }
    }
    case 'union':
    case 'intersection':
    case 'tuple': {
      const items: TSerializedAnnotatedTypeInner[] = []
      for (const item of type.items) {
        items.push(
          (yield serializeNode(item, path, options, visited)) as TSerializedAnnotatedTypeInner
        )
      }
      return { kind: type.kind, items, tags: Array.from(type.tags) }
    }
    default: {
      throw new Error(`Unknown type kind "${(type as { kind: string }).kind}"`)
    }
  }
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
          metadata: serializeMetadata(target, { path: [], kind: target.type.kind }, options, state),
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
  owner: TAtscriptAnnotatedType,
  site: { path: string[]; kind: string },
  options: TSerializeOptions | undefined,
  state: { visited: Visited; depth: number }
): Record<string, unknown> {
  const { path, kind } = site
  const result: Record<string, unknown> = {}
  const ignoreSet = options?.ignoreAnnotations ? new Set(options.ignoreAnnotations) : undefined

  const overrides = options?.annotationOverrides?.(owner)
  let entries: Iterable<[string, unknown]> = owner.metadata.entries() as Iterable<[string, unknown]>
  if (overrides) {
    const merged = new Map<string, unknown>(entries)
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        merged.delete(key)
      } else {
        merged.set(key, value)
      }
    }
    entries = merged
  }

  for (const [key, value] of entries) {
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
  return runWalk(deserializeNode(data, resolved))
}

/** The anonymous type of each `cut` tag of a payload being deserialized (by its `resolved`). */
const cutTokens = new WeakMap<object, Map<number, object>>()

/** The anonymous type `cut` tag `tag` of the payload `resolved` belongs to stands for. */
function cutToken(resolved: Map<string, TAtscriptAnnotatedType>, tag: number): object {
  let tokens = cutTokens.get(resolved)
  if (!tokens) {
    tokens = new Map()
    cutTokens.set(resolved, tokens)
  }
  let token = tokens.get(tag)
  if (!token) {
    token = {}
    tokens.set(tag, token)
  }
  return token
}

function emptyObjectTypeDef(): TAtscriptTypeDef {
  return createObjectTypeDef() as TAtscriptTypeDef
}

function toMetadataMap(record: Record<string, unknown>): TMetadataMap<AtscriptMetadata> {
  return createMetadataMap(Object.entries(record))
}

function* deserializeRef(
  data: TSerializedAnnotatedTypeInner,
  resolved: Map<string, TAtscriptAnnotatedType>
): TWalk<{ type: () => TAtscriptAnnotatedType; field: string } | undefined> {
  if (!data.ref) {
    return undefined
  }
  const refTargetData = data.ref.type
  if ('type' in refTargetData) {
    const deserializedRefTarget = (yield deserializeNode(
      refTargetData,
      resolved
    )) as TAtscriptAnnotatedType
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

function* deserializeNode(
  data: TSerializedAnnotatedTypeInner,
  resolved: Map<string, TAtscriptAnnotatedType>
): TWalk<TAtscriptAnnotatedType> {
  if (data.type.kind === '$ref') {
    const { id: refId, own } = data.type as TSerializedTypeRef
    const target = resolved.get(refId)
    const id = data.anon ? undefined : (data.origId ?? target?.id ?? refId)
    if (!own) {
      return target || createAnnotatedTypeNode(emptyObjectTypeDef(), createMetadataMap(), { id })
    }
    // A node of its own (the referencing prop's annotations) over the shared type. The type is
    // read through the target, which may still be under construction (a cyclic reference).
    const node = createAnnotatedTypeNode(
      target?.type ?? emptyObjectTypeDef(),
      toMetadataMap(data.metadata),
      {
        id,
        optional: data.optional || undefined,
        ref: (yield deserializeRef(data, resolved)) as TAtscriptAnnotatedType['ref'],
      }
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
      id: data.anon ? undefined : (data.origId ?? data.id),
    })
    resolved.set(data.id, result)
  }

  const type = (yield deserializeTypeDef(data.type, resolved)) as TAtscriptTypeDef

  const ref = (yield deserializeRef(data, resolved)) as TAtscriptAnnotatedType['ref']

  if (data.cut !== undefined) {
    cutAs(type, cutToken(resolved, data.cut))
  }

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

function* deserializeTypeDef(
  t: TSerializedTypeDef,
  resolved: Map<string, TAtscriptAnnotatedType>
): TWalk<TAtscriptTypeDef> {
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
      const def = createObjectTypeDef(tags)
      for (const [key, val] of Object.entries(t.props)) {
        def.props.set(key, (yield deserializeNode(val, resolved)) as TAtscriptAnnotatedType)
      }
      const patterns: typeof def.propsPatterns = []
      for (const pp of t.propsPatterns) {
        patterns.push({
          pattern: statelessRegExp(new RegExp(pp.pattern.source, pp.pattern.flags)),
          def: (yield deserializeNode(pp.def, resolved)) as TAtscriptAnnotatedType,
        })
      }
      def.propsPatterns = patterns
      return def
    }
    case 'array': {
      return {
        kind: 'array',
        of: (yield deserializeNode(t.of, resolved)) as TAtscriptAnnotatedType,
        tags,
      }
    }
    case 'union':
    case 'intersection':
    case 'tuple': {
      const items: TAtscriptAnnotatedType[] = []
      for (const item of t.items) {
        items.push((yield deserializeNode(item, resolved)) as TAtscriptAnnotatedType)
      }
      return { kind: t.kind, items, tags }
    }
    case '$ref': {
      // $ref is normally handled in deserializeNode; this is a defensive fallback.
      const existing = resolved.get(t.id)
      if (existing) {
        return existing.type
      }
      return createObjectTypeDef(tags)
    }
    default: {
      throw new Error(`Unknown serialized type kind "${(t as any).kind}"`)
    }
  }
}
