/**
 * Mutation tracking for build-time compiled validator checks.
 *
 * A compiled check is bound to the live type tree before use (see registry.ts): the bind
 * verifies that the tree still has the structure the check was compiled for and snapshots
 * the constraint values the check reads. Every tracked mutation of an object a bind has
 * read bumps one global epoch, which makes every compiled check re-bind on its next use.
 *
 * Tracked: `annotate()`, the metadata / props `Map` methods (`set` / `delete` / `clear`),
 * the `defineAnnotatedType()` handle methods and `cloneRefProp()`. Raw property writes
 * (`node.optional = …`, `type.items.push(…)`, editing a constraint object in place, …)
 * cannot be seen: call {@link invalidateCompiledValidators} after them.
 */
import { VALIDATOR_KEYS } from '../validator-keys'

const VALIDATOR_KEY_SET = new Set<unknown>(VALIDATOR_KEYS)

/** Global mutation epoch: compiled checks bound in an older epoch re-bind before use. */
let epoch = 0

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
 * Makes every compiled validator check re-verify the type tree it was compiled for before
 * its next use.
 *
 * Compiled checks (emitted with `tsPlugin({ compileValidators: true })`) see mutations made
 * through `annotate()`, the metadata / props `Map` methods, the `defineAnnotatedType()`
 * handle methods and `cloneRefProp()` automatically. Call this after changing a type tree
 * any other way:
 * - a raw property write: `node.optional = …`, `node.type = …`, `node.metadata = …`,
 *   `type.items.push(…)`, `type.of = …`, `type.propsPatterns.push(…)`;
 * - an in-place edit of an annotation value: mutating a constraint object
 *   (`metadata.get('expect.min').minValue = 5`), editing or pushing onto an
 *   `@expect.pattern` array directly (use `annotate(metadata, key, value, true)` instead).
 *
 * Without it the compiled check may keep validating against the old shape or values.
 * Types without compiled checks are always read live and never need it.
 *
 * Any mutation of a type a compiled check has bound to (tracked or invalidated) makes every
 * compiled check re-bind once on its next use: cheap during startup / configuration, but
 * avoid mutating validated types per request.
 */
export function invalidateCompiledValidators(): void {
  epoch++
}

/**
 * Metadata map of runtime type nodes: a `Map` whose writes to validator annotation keys
 * are tracked (see {@link invalidateCompiledValidators}). Reads are the builtin ones.
 */
export class AnnotationMap<K = unknown, V = unknown> extends Map<K, V> {
  override set(key: K, value: V): this {
    super.set(key, value)
    if (tracking && VALIDATOR_KEY_SET.has(key)) {
      touched(this)
    }
    return this
  }

  override delete(key: K): boolean {
    const deleted = super.delete(key)
    if (deleted && tracking && VALIDATOR_KEY_SET.has(key)) {
      touched(this)
    }
    return deleted
  }

  override clear(): void {
    super.clear()
    touched(this)
  }
}

/** Props map of runtime object types: a `Map` whose writes are tracked. */
// oxlint-disable-next-line max-classes-per-file
export class PropsMap<K = unknown, V = unknown> extends Map<K, V> {
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

/** `true` when `key` is an annotation the validator pre-check reads. */
export function isValidatorKey(key: unknown): boolean {
  return VALIDATOR_KEY_SET.has(key)
}
