import type { TAtscriptAnnotatedType } from './annotated-type'

/*
 * The readers' recursion cut (flattening, default / example values, and a deserialized copy's
 * through the serialized payload): going down a path, a node is cut (listed, not expanded) where
 * the type it is is expanded on the path above it already. The type a node is — its cut key:
 *
 * - the declaration it names: its `id` (a declaration's class, a reference to one, a shell over
 *   one, an alias's or `as` copy's own class — each its own declaration, as in 0.1.110);
 * - else its def: a hidden merge class (one per distinct merge of a module), an object
 *   written in place, an array, a union. A shell's def (a path override's copy of the def it
 *   shells) is the def it was made from: a block changes metadata, not structure.
 *
 * Primitives are never cut. The key of a node does not depend on where or in what order a
 * reader meets it.
 */

/**
 * Defs standing for another one to the cut (a shell's def → the def it shells; a deserialized
 * def → its payload tag's token). Shared by every copy of the runtime (types built by one, read
 * by another).
 */
const origins: WeakMap<object, unknown> = ((globalThis as Record<symbol, unknown>)[
  Symbol.for('@atscript/typescript:cut-origins:1')
] ??= new WeakMap()) as WeakMap<object, unknown>

/** Def `copy` stands for def `of` to the cut (for what `of` stands for). */
export function cutAs(copy: object, of: unknown): void {
  origins.set(copy, (typeof of === 'object' && of !== null && origins.get(of)) || of)
}

/** The cut key of `node` (see above). */
export function cutKey(node: TAtscriptAnnotatedType): unknown {
  // (the def first: a lazy reference gets its id on the first read of its type)
  const def = node.type
  return node.id ?? origins.get(def) ?? def
}

/** The keys expanded on a path, innermost first (`undefined`: above the root). */
export interface TCutPath {
  readonly key: unknown
  readonly up: TCutPath | undefined
}

/** Whether `key` is expanded on `path`. */
function onPath(path: TCutPath | undefined, key: unknown): boolean {
  for (let p = path; p; p = p.up) {
    if (p.key === key) {
      return true
    }
  }
  return false
}

/** The path below `node` reached on `path`; `false` where `node` is cut. */
export function enterCut(
  path: TCutPath | undefined,
  node: TAtscriptAnnotatedType
): TCutPath | undefined | false {
  if (node.type.kind === '') {
    return path
  }
  const key = cutKey(node)
  return onPath(path, key) ? false : { key, up: path }
}
