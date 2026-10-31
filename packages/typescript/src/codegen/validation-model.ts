import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import {
  buildLayout,
  layoutSource,
  LayoutTooLarge,
  type TClassifyType,
} from '../runtime/compiled-check/build-layout'
import {
  emitCheckFactory,
  EXT_MEMO_UNION,
  EXT_MULTI_UNION,
  EXT_OBJECT_UNION,
  type TExtReach,
} from '../runtime/compiled-check/emit'
import { D_UNKNOWN, INTERP, LAYOUT_VERSION } from '../runtime/compiled-check/layout'
import type { TLayout } from '../runtime/compiled-check/layout'
import { getRegex } from '../runtime/validator-fast-check'

/** A generated module, as its compiled checks see it (see {@link compiledCheckRegistrations}). */
export interface TCompiledModule {
  /** Its classes (evaluated), by name. */
  classes: ReadonlyMap<string, TAtscriptAnnotatedType>
  /** The classes that get a compiled check, in the order their chains run. */
  compiled: readonly string[]
  /** The types of every class of the build (the realm's modules). */
  allClasses: ReadonlySet<unknown>
}

/**
 * The arguments of the `$cv(Name, version, layout, factory[, steps])` registrations of a
 * generated module's compiled validator checks (`compileValidators`) — and of the merges written
 * in classes' trees their checks bind to (see `layoutOf`) —, the classes that cannot be compiled
 * left out (their root type unknown: a class whose chain built nothing).
 *
 * Runs in the build-time realm (see `codegen/realm.ts`, `realm-runtime.ts`) on the objects the
 * generated modules of the build build: the layouts describe them, with every block of the build
 * applied. A runtime that differs (another set of modules loaded, a later write) only costs speed:
 * the bind verifies the live tree and the key masks, and the interpreted pre-check runs.
 */
export function compiledCheckRegistrations(module: TCompiledModule): string[] {
  return new CompiledChecks(module).registrations()
}

class CompiledChecks {
  /** The types of the module's classes. */
  private readonly classTypes: Set<unknown>

  constructor(private readonly module: TCompiledModule) {
    this.classTypes = new Set([...module.classes.values()].map(c => c.type as unknown))
  }

  registrations(): string[] {
    const out: string[] = []
    for (const name of this.module.compiled) {
      const cls = this.module.classes.get(name)
      const found = cls && this.layoutOf(cls)
      if (found) {
        const { layout, ext } = found
        out.push(
          `${name}, ${LAYOUT_VERSION}, ${layoutSource(layout)}, ${emitCheckFactory(layout, extReach(ext))}`
        )
      }
    }
    return out
  }

  /**
   * Another module's class: always a site, bound at runtime to that class's own check — at a
   * reference to it, or at a node typed by a merge's hidden class. A node holding the def itself
   * (its own prop, which an alias class of the field shares, `ChainAlias = Address.street`:
   * references, not copies) is inlined like any.
   */
  private readonly foreign: TClassifyType = (type, node) =>
    this.module.allClasses.has(type) &&
    !this.classTypes.has(type) &&
    (node === undefined || (node as TAtscriptAnnotatedType).ref !== undefined)
      ? 'ext'
      : undefined

  /**
   * The layout of the check of class `root`: what it reaches inlined — or, beyond
   * `MAX_INLINED_DEFS`, the other classes it references as sites bound at runtime to their own
   * compiled checks, so its code covers its own tree, however large (a class of thousands of props
   * compiles like any; a chain of classes compiles in code linear in its length), with the node
   * of each of its EXT sites (by its first slot). `undefined` when it cannot be compiled.
   */
  private layoutOf(
    root: TAtscriptAnnotatedType
  ): { layout: TLayout; ext: Map<number, TAtscriptAnnotatedType> } | undefined {
    /** The check of a node holding another class: theirs (`whole`), or only when it is large. */
    const classify =
      (whole: boolean): TClassifyType =>
      (type, node) => {
        if (node === root || type === root.type) {
          return undefined
        }
        if (this.foreign(type, node)) {
          return 'ext'
        }
        if (
          this.classTypes.has(type) &&
          (whole || this.reachesMany(node as TAtscriptAnnotatedType))
        ) {
          return 'ext'
        }
        return undefined
      }
    /** The node of each EXT site (by its first slot). */
    const ext = new Map<number, TAtscriptAnnotatedType>()
    const onExt = (slot: number, node: TAtscriptAnnotatedType) => ext.set(slot, node)
    let layout: TLayout
    try {
      layout = buildLayout(root, { regex: getRegex }, classify(false), {
        maxDefs: MAX_INLINED_DEFS,
        onExt,
      })
    } catch (error) {
      if (!(error instanceof LayoutTooLarge)) {
        return undefined
      }
      ext.clear()
      try {
        layout = buildLayout(root, { regex: getRegex }, classify(true), { onExt })
      } catch {
        return undefined
      }
    }
    const top = layout[1][2]
    // A root only known at runtime, or one the module never builds (a forward alias).
    if (top === INTERP || (top >= 0 && layout[0][top][0] === D_UNKNOWN)) {
      return undefined
    }
    return { layout, ext }
  }

  /** Whether node `node` reaches more than `MAX_SHARED_INLINED_DEFS` type defs (by type). */
  private reachesMany(node: TAtscriptAnnotatedType): boolean {
    let many = this.many.get(node.type)
    if (many === undefined) {
      try {
        buildLayout(node, { regex: getRegex }, this.foreign, {
          maxDefs: MAX_SHARED_INLINED_DEFS,
        })
        many = false
      } catch {
        many = true
      }
      this.many.set(node.type, many)
    }
    return many
  }

  private readonly many = new Map<unknown, boolean>()
}

/**
 * A class, or a merge, reaching more type defs than this has its own check, which the checks of
 * other classes and merges call instead of inlining it (see `layoutOf`): small ones are inlined
 * (what makes compiled checks fast), large ones compile once, not once per class reaching them.
 */
const MAX_SHARED_INLINED_DEFS = 128

/**
 * The most type defs a class's compiled check inlines of the other classes of its module it
 * reaches: beyond it, they are sites bound at runtime to their own compiled checks (see
 * `layoutOf`) — a chain of classes compiles in code linear in its length, not quadratic.
 * Every class compiles whatever its size.
 */
const MAX_INLINED_DEFS = 500

/** The defs of the sites below def `def`, as a layout describes them (see `buildLayout`). */
function childDefs(def: any): object[] {
  let nodes: TAtscriptAnnotatedType[]
  switch (def.kind) {
    case 'object': {
      nodes = def.propsPatterns?.length > 0 ? [] : [...def.props.values()]
      break
    }
    case 'array': {
      nodes = [def.of]
      break
    }
    case 'union':
    case 'intersection':
    case 'tuple': {
      nodes = def.items
      break
    }
    default: {
      nodes = []
    }
  }
  return nodes.map(n => n?.type).filter(d => d && typeof d === 'object') as object[]
}

/** What each def reaches (see {@link unionReach}), once known. */
const reachMemo = new WeakMap<object, number>()

/** What the EXT sites of a layout reach in the whole type tree (`ext`: their nodes, by slot). */
function extReach(ext: Map<number, TAtscriptAnnotatedType>): TExtReach {
  return slot => {
    const node = ext.get(slot)
    return node ? unionReach(node) : 0
  }
}

/**
 * What the check of `node` reaches in the whole type tree — across modules: a union over objects
 * ({@link EXT_OBJECT_UNION}), a union branching into several branches reaching such unions
 * ({@link EXT_MULTI_UNION}), a union taking part in the memo ({@link EXT_MEMO_UNION}) — the rules
 * of `CheckEmitter.memoDefs`, on the tree as if nothing were cut into modules' checks. An EXT
 * site counts so in the check that calls it: a structure exponential only across modules
 * memoizes as one inlined would, and an ordinary union of imported types gets the code it gets
 * inlined.
 */
function unionReach(node: TAtscriptAnnotatedType): number {
  const start = node.type as unknown
  if (!start || typeof start !== 'object') {
    return 0
  }
  const known = reachMemo.get(start)
  if (known !== undefined) {
    return known
  }
  // (the defs below it not known yet; those known are leaves)
  const defs: any[] = []
  const index = new Map<object, number>()
  const kids: object[][] = []
  const stack: object[] = []
  const visit = (d: object) => {
    if (!reachMemo.has(d) && !index.has(d)) {
      index.set(d, defs.length)
      defs.push(d)
      stack.push(d)
    }
  }
  visit(start)
  while (stack.length > 0) {
    const d = stack.pop()!
    const children = childDefs(d)
    kids[index.get(d)!] = children
    children.forEach(visit)
  }
  const parents: number[][] = defs.map(() => [])
  kids.forEach((children, i) => {
    for (const c of children) {
      const j = index.get(c)
      if (j !== undefined) {
        parents[j].push(i)
      }
    }
  })
  const bits: number[] = defs.map(() => 0)
  const has = (c: object, bit: number) => {
    const j = index.get(c)
    return ((j === undefined ? (reachMemo.get(c) ?? 0) : bits[j]) & bit) !== 0
  }
  /** Marks the defs reaching a seed (themselves included), or a known def with `bit`. */
  const spread = (bit: number, seed: (i: number) => boolean) => {
    const work: number[] = []
    defs.forEach((_, i) => {
      if (seed(i) || kids[i].some(c => !index.has(c) && has(c, bit))) {
        bits[i] |= bit
        work.push(i)
      }
    })
    while (work.length > 0) {
      for (const p of parents[work.pop()!]) {
        if ((bits[p] & bit) === 0) {
          bits[p] |= bit
          work.push(p)
        }
      }
    }
  }
  const branches = (i: number, bit: number) =>
    defs[i].kind === 'union' ? kids[i].filter(c => has(c, bit)).length : 0
  // (a union that may hold an object: an item not a final type, or not known)
  const objectUnion = defs.map(
    d =>
      d.kind === 'union' &&
      (d.items as TAtscriptAnnotatedType[]).some(item => {
        const def = item?.type as { kind?: unknown } | undefined
        return !def || def.kind !== ''
      })
  )
  spread(EXT_OBJECT_UNION, i => objectUnion[i])
  const multi = defs.map((_, i) => objectUnion[i] && branches(i, EXT_OBJECT_UNION) >= 2)
  spread(EXT_MULTI_UNION, i => multi[i])
  spread(EXT_MEMO_UNION, i => multi[i] && branches(i, EXT_MULTI_UNION) >= 2)
  defs.forEach((d, i) => reachMemo.set(d, bits[i]))
  return bits[0]
}
