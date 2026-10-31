import { $ft, fieldOf, readyNode } from './blocks'
import {
  AnnotationMap,
  appendOwn,
  metadataReplaced,
  PropsMap,
  touched,
} from './compiled-check/tracking'
import { annotateLayer, LayerMap, markIntrinsic, moveIntrinsic, ownEntries } from './layers'
import { statelessRegExp } from './stateless-regex'
import { Validator, type TValidatorOptions } from './validator'

// eslint-disable max-lines

const COMPLEX_KINDS = new Set(['union', 'intersection', 'tuple'])
const NON_PRIMITIVE_KINDS = new Set(['array', 'object'])

/** Shared validator method reused by all annotated type nodes. */
export function validatorMethod(this: TAtscriptAnnotatedType, opts?: Partial<TValidatorOptions>) {
  return new Validator(this, opts)
}

/**
 * Creates a minimal annotated type node from a type def and metadata map.
 * Centralises the shape so callers never duplicate the boilerplate.
 *
 * `metadata` is used as-is (the node keeps the caller's map, so later writes through it
 * apply). When omitted, the node gets a new, tracked metadata map. Compiled validator
 * checks only bind to nodes whose metadata is tracked; nodes built over a caller-supplied
 * `Map` are always validated by the interpreted validator.
 */
export function createAnnotatedTypeNode(
  type: TAtscriptTypeDef,
  metadata: Map<string, unknown> | TMetadataMap<AtscriptMetadata> = new AnnotationMap(),
  opts?: {
    id?: string
    optional?: boolean
    ref?: { type: () => TAtscriptAnnotatedType; field: string }
  }
): TAtscriptAnnotatedType {
  // (the shape `defineAnnotatedType` gives its nodes, every field present: one shape for every
  // node, so the validators' reads of them stay monomorphic)
  return {
    __is_atscript_annotated_type: true,
    metadata: metadata as TMetadataMap<AtscriptMetadata>,
    type,
    validator: validatorMethod,
    ref: opts?.ref,
    id: opts?.id,
    optional: opts?.optional,
  }
}

/** A new tracked metadata map holding `entries` (see {@link createAnnotatedTypeNode}). */
export function createMetadataMap(
  entries?: Iterable<readonly [string, unknown]>
): TMetadataMap<AtscriptMetadata> {
  return new AnnotationMap(entries) as unknown as TMetadataMap<AtscriptMetadata>
}

/**
 * The metadata map `defineAnnotatedType()` installs on `base`: `base.metadata` itself, except
 * that an absent map or an empty plain `Map` (what a generated class starts with:
 * `static metadata = new Map()`) is replaced by a new tracked map, so the node can bind to a
 * compiled validator check. A non-empty map or a `Map` subclass is always kept as-is (its
 * identity and overrides preserved; such a node stays interpreted).
 */
function baseMetadata(metadata: unknown): TMetadataMap<AtscriptMetadata> {
  const replace =
    !metadata ||
    (Object.getPrototypeOf(metadata) === Map.prototype &&
      (metadata as Map<unknown, unknown>).size === 0)
  return replace ? createMetadataMap() : (metadata as TMetadataMap<AtscriptMetadata>)
}

/** A new object type def (its props map is tracked, see {@link createAnnotatedTypeNode}). */
export function createObjectTypeDef(
  tags = new Set<AtscriptPrimitiveTags>(),
  propsPatterns: TAtscriptTypeObject['propsPatterns'] = []
): TAtscriptTypeObject {
  return {
    kind: 'object',
    props: new PropsMap<string, TAtscriptAnnotatedType>(),
    propsPatterns,
    tags,
  }
}

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
  propsPatterns: Array<{ pattern: RegExp; def: TAtscriptAnnotatedType }>

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
  designType:
    | 'string'
    | 'number'
    | 'boolean'
    | 'undefined'
    | 'null'
    | 'object'
    | 'any'
    | 'never'
    | 'phantom'
    | 'decimal'

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

/**
 * Extract the DataType from a {@link TAtscriptAnnotatedType}.
 *
 * Resolves the phantom `__dataType` carried by the type definition.
 * When `__dataType` is `unknown` (unset), falls back to the constructor
 * instance type if `T` is also a class (i.e. a generated interface).
 *
 * @example
 * ```ts
 * import type { TAtscriptDataType } from '@atscript/typescript/utils'
 * import MyInterface from './my-interface.as'
 *
 * type Data = TAtscriptDataType<typeof MyInterface>
 * ```
 */
export type TAtscriptDataType<T extends TAtscriptAnnotatedType = TAtscriptAnnotatedType> =
  T extends { type: { __dataType?: infer D } }
    ? unknown extends D
      ? T extends new (...args: any[]) => infer I
        ? I
        : unknown
      : D
    : unknown

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
export interface TAtscriptAnnotatedType<
  T extends TAtscriptTypeDef = TAtscriptTypeDef,
  DataType = InferDataType<T>,
> {
  __is_atscript_annotated_type: true
  type: T
  validator(opts?: Partial<TValidatorOptions>): Validator<this, DataType>
  metadata: TMetadataMap<AtscriptMetadata>
  optional?: boolean
  id?: string
  ref?: { type: () => TAtscriptAnnotatedType; field: string }
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
 *
 * A layered map (a reference, an override, a merged field: see `layers.ts`) appends after the
 * values its bases give.
 */
export function annotate<K extends keyof AtscriptMetadata>(
  metadata: TMetadataMap<AtscriptMetadata> | undefined,
  key: K,
  value: AtscriptMetadata[K] extends Array<infer E> ? E : AtscriptMetadata[K],
  asArray?: boolean
): void {
  if (!metadata) {
    return
  }
  if (asArray && metadata instanceof LayerMap) {
    annotateLayer(metadata, key, value)
    return
  }
  if (asArray) {
    if (metadata.has(key)) {
      appendOwn(metadata as Map<unknown, unknown>, key, metadata.get(key), value)
    } else {
      metadata.set(key, [value] as any)
    }
  } else {
    metadata.set(key, value as any)
  }
}

/** The node at prop path `chain` below `type` (through objects), `undefined` when none. */
export function propAtChain(
  type: TAtscriptAnnotatedType,
  chain: readonly string[]
): TAtscriptAnnotatedType | undefined {
  let node: TAtscriptAnnotatedType | undefined = type
  for (const key of chain) {
    node =
      node?.type?.kind === 'object'
        ? ((node.type as TAtscriptTypeObject).props.get(key) as TAtscriptAnnotatedType | undefined)
        : undefined
  }
  return node
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
  // Re-initialising a base's type def in place is a structural change (a no-op for new defs).
  touched(type)
  // (kind and tags first, whatever the kind: the shape of every def)
  type.kind = kind
  type.tags = new Set()
  if (COMPLEX_KINDS.has(kind)) {
    type.items = []
  }
  if (kind === 'object') {
    type.props = new PropsMap<string, TAtscriptAnnotatedType>()
    type.propsPatterns = []
  }
  const metadata = baseMetadata(base?.metadata)
  if (base && base.metadata !== metadata) {
    metadataReplaced()
  }
  // (a node of its own: the shape of `createAnnotatedTypeNode`'s, every field present; a class
  // keeps its own `id`)
  base = base
    ? Object.assign(base, {
        __is_atscript_annotated_type: true as const,
        metadata,
        type,
        validator: validatorMethod,
      })
    : createAnnotatedTypeNode(type as TAtscriptTypeDef, metadata)
  const handle = {
    $type: base as TAtscriptAnnotatedType,
    $def: type,
    $metadata: metadata,
    tags(...tags: string[]) {
      for (const tag of tags) {
        this.$def.tags.add(tag as AtscriptPrimitiveTags)
      }
      return this
    },
    designType(value: TAtscriptTypeFinal['designType']) {
      this.$def.designType = value
      touched(this.$def)
      return this
    },
    value(value: string | number | boolean) {
      this.$def.value = value
      touched(this.$def)
      return this
    },
    of(value: TAtscriptAnnotatedType) {
      this.$def.of = value
      touched(this.$def)
      return this
    },
    item(value: TAtscriptAnnotatedType) {
      this.$def.items.push(value)
      touched(this.$def)
      return this
    },
    prop(name: string, value: TAtscriptAnnotatedType) {
      this.$def.props.set(name, value)
      return this
    },
    propPattern(pattern: RegExp, def: TAtscriptAnnotatedType) {
      // stateless: a `g` / `y` key pattern would match a key on alternate calls only
      this.$def.propsPatterns.push({ pattern: statelessRegExp(pattern), def })
      touched(this.$def)
      return this
    },
    optional(value = true) {
      this.$type.optional = value
      touched(this.$type)
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
    ref(target: TAtscriptAnnotatedType, chain?: string[]) {
      // (a reference node: the target's def, metadata layered over it — a reference layer, see
      // `layers.ts`; the target not built yet, a CommonJS cycle's `undefined`: see `$q`)
      const at = $ft(target, ...(chain ?? []))
      const node = this.$type
      touched(node)
      node.type = at.type
      node.ref = { type: () => target, field: chain ? fieldOf(chain) : '' }
      node.id ??= at.id
      return this.over([at], true)
    },
    over(bases: TAtscriptAnnotatedType[], reference?: boolean) {
      for (const b of bases) {
        readyNode(b)
      }
      const node = this.$type
      touched(node)
      const metadata = new LayerMap(
        bases,
        reference,
        ownEntries(this.$metadata as unknown as Map<unknown, unknown>)
      ) as unknown as TMetadataMap<AtscriptMetadata>
      moveIntrinsic(this.$metadata, metadata)
      node.metadata = metadata
      this.$metadata = metadata
      metadataReplaced()
      return this
    },
    type(of: TAtscriptAnnotatedType) {
      const node = this.$type
      touched(node)
      node.type = readyNode(of).type
      return this
    },
    annotate(key: keyof AtscriptMetadata, value: any, asArray?: boolean) {
      annotate(this.$metadata, key, value, asArray)
      return this
    },
    intrinsic(...keys: string[]) {
      // (a primitive extension's own annotations pass every reference)
      markIntrinsic(this.$metadata, keys)
      return this
    },
    id(value: string) {
      this.$type.id = value
      return this
    },
  }
  return handle
}

/**
 * Atscript Metadata Map with typed setters/getters
 */
export interface TMetadataMap<O extends object> extends Map<keyof O, O[keyof O]> {
  // Typed overload: returns O[K] for a known key
  get<K extends keyof O>(key: K): O[K] | undefined
  // Untyped overload: accepts any string key (for cross-package access where AtscriptMetadata may not include all keys)
  get(key: string): unknown

  // Set enforces that the value must match O[K]
  set<K extends keyof O>(key: K, value: O[K]): this

  // Typed overload
  has<K extends keyof O>(key: K): boolean
  // Untyped overload
  has(key: string): boolean
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
  tags(...tags: string[]): TAnnotatedTypeHandle
  designType(value: TAtscriptTypeFinal['designType']): TAnnotatedTypeHandle
  value(value: string | number | boolean): TAnnotatedTypeHandle
  of(value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  item(value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  prop(name: string, value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  propPattern(pattern: RegExp, value: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  optional(value?: boolean): TAnnotatedTypeHandle
  copyMetadata(
    fromMetadata: TMetadataMap<AtscriptMetadata>,
    ignore?: Set<string>
  ): TAnnotatedTypeHandle
  /**
   * A reference node: `target`'s def (at `chain`: a chain ref), metadata
   * layered over it (a reference layer: `passedWhenReferred: false` keys are not read through).
   */
  ref(target: TAtscriptAnnotatedType, chain?: string[]): TAnnotatedTypeHandle
  /** The node's metadata layered over `bases` (priority order), its own entries kept. */
  over(bases: TAtscriptAnnotatedType[], reference?: boolean): TAnnotatedTypeHandle
  /** The node's def is `of`'s (a merged field typed by a hidden class), with no layer over it. */
  type(of: TAtscriptAnnotatedType): TAnnotatedTypeHandle
  annotate(key: keyof AtscriptMetadata, value: any, asArray?: boolean): TAnnotatedTypeHandle
  /** Marks keys of this node intrinsic: a primitive extension's own annotations. */
  intrinsic(...keys: string[]): TAnnotatedTypeHandle
  id(value: string): TAnnotatedTypeHandle
}

/**
 * Checks whether an annotated type is a phantom type.
 *
 * Phantom types do not affect the data type, validation, or schema,
 * but are discoverable via runtime type traversal.
 */
export function isPhantomType(def: TAtscriptAnnotatedType): boolean {
  return def.type.kind === '' && (def.type as TAtscriptTypeFinal).designType === 'phantom'
}

/**
 * Checks whether an annotated type resolves to a primitive (non-object, non-array) shape.
 *
 * Returns `true` for final types and for unions/intersections/tuples
 * whose members are all primitives.
 */
export function isAnnotatedTypeOfPrimitive(t: TAtscriptAnnotatedType) {
  if (NON_PRIMITIVE_KINDS.has(t.type.kind)) {
    return false
  }
  if (!t.type.kind) {
    return true
  }
  if (COMPLEX_KINDS.has(t.type.kind)) {
    for (const item of (t.type as TAtscriptTypeComplex).items) {
      if (!isAnnotatedTypeOfPrimitive(item)) {
        return false
      }
    }
    return true
  }
  return false
}
