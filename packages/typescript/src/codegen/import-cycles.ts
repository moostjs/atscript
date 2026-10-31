/*
 * Import cycles of generated modules with mutating annotates: `unplugin-atscript` keeps such a
 * module's side effects (see `importCycle` in `js-next.ts`).
 */
import type { AtscriptDoc } from '@atscript/core'
import { components, documentsEpoch, hasMutatingAnnotates } from '@atscript/core'

/** The documents whose generated modules the generated module of a document imports. */
export type TGeneratedImports = (doc: AtscriptDoc) => Iterable<AtscriptDoc>

/**
 * Whether `doc` is on an import cycle with mutating annotates (in any of its modules), by the
 * imports the generated modules keep (`imports`: those whose names they use, and the ones they
 * add). A cycle of the `.as` files only (an import whose names the module does not use, dropped
 * from its generated module) is not one: those modules are evaluated in import order. Found for
 * every module of the cycle at once (`cache`).
 */
export function findImportCycle(
  doc: AtscriptDoc,
  imports: TGeneratedImports,
  cache: Map<AtscriptDoc, boolean>
): boolean {
  const known = cache.get(doc)
  if (known !== undefined) {
    return known
  }
  let cycle = false
  // The `.as` cycle (the modules it imports, directly or not, that import it): the generated
  // modules import a subset of what the `.as` files do (directly or not), so their cycle is
  // within it.
  const candidates = componentOf(doc)
  if (candidates.size > 1 && componentHasBlocks(candidates)) {
    const docs = generatedCycle(doc, candidates, imports)
    if (docs.length > 1 && docs.some(hasMutatingAnnotates)) {
      for (const d of docs) {
        cache.set(d, true)
      }
      cycle = true
    }
  }
  cache.set(doc, cycle)
  return cycle
}

/** The strongly connected component of each document's imports (see {@link componentOf}). */
const componentMemo = new WeakMap<AtscriptDoc, { epoch: number; docs: Set<AtscriptDoc> }>()

/**
 * The documents `doc` imports (directly or not) that import it (directly or not), and `doc`: its
 * strongly connected component of the import graph — found for every document reached at once,
 * memoized until a document changes (components found already are not entered again: a build
 * checking each module of a large graph is linear, not quadratic).
 */
function componentOf(doc: AtscriptDoc): Set<AtscriptDoc> {
  const epoch = documentsEpoch()
  const known = componentMemo.get(doc)
  if (known?.epoch === epoch) {
    return known.docs
  }
  const found = components([doc], d =>
    [...d.dependencies].filter(to => componentMemo.get(to)?.epoch !== epoch)
  )
  const sets = new Map<AtscriptDoc[], Set<AtscriptDoc>>()
  for (const [d, c] of found) {
    let docs = sets.get(c)
    if (!docs) {
      sets.set(c, (docs = new Set(c)))
    }
    componentMemo.set(d, { epoch, docs })
  }
  return componentMemo.get(doc)!.docs
}

/** Whether a component (see {@link componentOf}) has mutating annotates, found once. */
const componentBlocks = new WeakMap<Set<AtscriptDoc>, boolean>()
function componentHasBlocks(docs: Set<AtscriptDoc>): boolean {
  let has = componentBlocks.get(docs)
  if (has === undefined) {
    has = [...docs].some(hasMutatingAnnotates)
    componentBlocks.set(docs, has)
  }
  return has
}

/** The modules of `candidates` on a cycle of generated imports through `doc` (and `doc`). */
function generatedCycle(
  doc: AtscriptDoc,
  candidates: Set<AtscriptDoc>,
  imports: TGeneratedImports
): AtscriptDoc[] {
  const forward = new Map<AtscriptDoc, AtscriptDoc[]>()
  const backward = new Map<AtscriptDoc, AtscriptDoc[]>()
  for (const d of candidates) {
    for (const to of imports(d)) {
      if (candidates.has(to) && to !== d) {
        forward.set(d, [...(forward.get(d) ?? []), to])
        backward.set(to, [...(backward.get(to) ?? []), d])
      }
    }
  }
  const reach = (edges: Map<AtscriptDoc, AtscriptDoc[]>) => {
    const out = new Set([doc])
    // The array iterator also visits the documents pushed meanwhile.
    const queue = [doc]
    for (const d of queue) {
      for (const next of edges.get(d) ?? []) {
        if (!out.has(next)) {
          out.add(next)
          queue.push(next)
        }
      }
    }
    return out
  }
  const imported = reach(forward)
  return [...reach(backward)].filter(d => imported.has(d))
}
