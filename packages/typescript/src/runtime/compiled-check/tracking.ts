/**
 * Mutation tracking for build-time compiled validator checks and cached layered metadata reads.
 *
 * A compiled check is bound to the live type tree before use (see registry.ts): the bind
 * verifies that the tree still has the structure the check was compiled for and snapshots
 * the constraint values the check reads. Every tracked mutation of an object a bind has
 * read bumps one global epoch, which makes every compiled check re-bind on its next use.
 *
 * Tracked: `annotate()`, the metadata / props `Map` methods (`set` / `delete` / `clear`),
 * the `defineAnnotatedType()` handle methods. Raw writes (`node.optional = …`,
 * `node.metadata = …`, `type.items.push(…)`, editing a constraint object in place, …) cannot
 * be seen: call {@link invalidateCompiledValidators} after them, with either validator engine.
 */
import { VALIDATOR_KEYS } from '../validator-keys'

const VALIDATOR_KEY_SET = new Set<unknown>(VALIDATOR_KEYS)

const mapSet = Map.prototype.set

/** Global mutation epoch: compiled checks bound in an older epoch re-bind before use. */
let epoch = 0

/**
 * Writes of metadata maps so far (any map, any key: `annotate()`, the `Map` methods, a node's map
 * replaced, a layer flag or intrinsic mark registered): a lazy JSON schema or a layered map's
 * flattened view built before the last one is built again (see `lazyJsonSchema`, `LayerMap`).
 */
let metadataWrites = 0

/** Some bind has watched an object (until then no mutation can affect a compiled check). */
let tracking = false

/** Objects (nodes, type defs, metadata / props maps) read by some compiled-check bind. */
const watched = new WeakSet<object>()

/** The current mutation epoch. */
export function currentEpoch(): number {
  return epoch
}

/** Marks `obj` as read by a bind: tracked mutations of it invalidate compiled checks. */
export function watch(obj: object): void {
  tracking = true
  watched.add(obj)
}

/** Records a tracked mutation of `obj` (a no-op unless some bind has read it). */
export function touched(obj: object): void {
  if (tracking && watched.has(obj)) {
    epoch++
  }
}

/**
 * Makes every compiled validator check re-verify the type tree it was compiled for, and every
 * node that reads metadata through other nodes re-read them, before its next use.
 *
 * Validators (compiled checks emitted with `tsPlugin({ compileValidators: true })` and the
 * interpreted walk alike) see mutations made through `annotate()`, the metadata / props `Map`
 * methods and the `defineAnnotatedType()` handle methods automatically. Call this after
 * changing a type tree any other way:
 * - a raw property write: `node.optional = …`, `node.type = …`, `node.metadata = …`,
 *   `type.items.push(…)`, `type.of = …`, `type.propsPatterns.push(…)`;
 * - an in-place edit of an annotation value: mutating a constraint object
 *   (`metadata.get('expect.min').minValue = 5`), editing or pushing onto an
 *   `@expect.pattern` array directly (use `annotate(metadata, key, value, true)` instead).
 *
 * Without it a compiled check may keep validating against the old shape or values, and a
 * node that reads metadata through other nodes (a reference, a merged field, a path override)
 * may keep reading the old values: the rule is the same for both engines.
 *
 * Any mutation of a type a compiled check has bound to (tracked or invalidated) makes every
 * compiled check re-bind once on its next use: cheap during startup / configuration, but
 * avoid mutating validated types per request.
 */
export function invalidateCompiledValidators(): void {
  epoch++
  // (a raw write it announces may be a node's metadata replaced: layered reads re-flatten)
  metadataWrites++
}

/** The number of metadata writes so far (see `metadataWrites`). */
export function metadataWriteCount(): number {
  return metadataWrites
}

/** Records a write of a node's metadata the maps do not see: the node's map replaced. */
export function metadataReplaced(): void {
  metadataWrites++
}

/**
 * `annotate(m, key, value, true)` where map `m` holds `own` as its own value of `key`: appended in
 * place to an own list (the map sees no write: tracked here as one), else a list of both.
 */
export function appendOwn(
  m: Map<unknown, unknown>,
  key: unknown,
  own: unknown,
  value: unknown
): void {
  if (Array.isArray(own)) {
    own.push(value)
    if (VALIDATOR_KEY_SET.has(key)) {
      touched(m)
    }
    metadataWrites++
  } else {
    m.set(key, [own, value])
  }
}

/**
 * Metadata map of runtime type nodes: a `Map` whose writes to validator annotation keys
 * are tracked (see {@link invalidateCompiledValidators}). Reads are the builtin ones.
 */
export class AnnotationMap<K = unknown, V = unknown> extends Map<K, V> {
  /** A new map holding `entries`: no write (a new map is in no compiled check nor schema). */
  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super()
    if (entries) {
      for (const [key, value] of entries) {
        mapSet.call(this, key, value)
      }
    }
  }

  override set(key: K, value: V): this {
    super.set(key, value)
    if (tracking && VALIDATOR_KEY_SET.has(key)) {
      touched(this)
    }
    metadataWrites++
    return this
  }

  override delete(key: K): boolean {
    const deleted = super.delete(key)
    if (deleted) {
      if (tracking && VALIDATOR_KEY_SET.has(key)) {
        touched(this)
      }
      metadataWrites++
    }
    return deleted
  }

  override clear(): void {
    super.clear()
    touched(this)
    metadataWrites++
  }
}

/** Props map of runtime object types: a `Map` whose writes are tracked. */
// oxlint-disable-next-line max-classes-per-file
export class PropsMap<K = unknown, V = unknown> extends Map<K, V> {
  /** A new map holding `entries` (untracked: a new map is in no compiled check). */
  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super()
    if (entries) {
      for (const [key, value] of entries) {
        mapSet.call(this, key, value)
      }
    }
  }

  override set(key: K, value: V): this {
    super.set(key, value)
    touched(this)
    return this
  }

  override delete(key: K): boolean {
    const deleted = super.delete(key)
    if (deleted) {
      touched(this)
    }
    return deleted
  }

  override clear(): void {
    super.clear()
    touched(this)
  }
}
