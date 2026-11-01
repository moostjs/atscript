/**
 * The final structure of a build's declarations: which runtime node every position of every
 * declaration is, what def (type object) it has, which merges are written out as hidden classes,
 * where blocks shell their paths, and in which static order blocks apply. Generated code prints
 * it; diagnostics read it.
 *
 * Vocabulary:
 * - a *def* ({@link TStructDef}) is a type object as the runtime builds it: a declaration's class,
 *   a builder def written in place (`{…}`, `T[]`), a union def, a hidden merge class (one per
 *   distinct operand list per module), a shell def (a copy of a shared def a path override needs);
 * - a *slot* ({@link TStructSlot}) is the node a def holds under a prop name / `[]`: `loc` is its
 *   identity (equal locs = the same node object), `def` the def it has;
 * - *steps* are internal paths: prop names, `[]` for array elements, `|i` for union branches.
 *
 * Identity: every prop / element is its holder's own node (a reference
 * `p?: T` is a thin node over T whose def is T's); a merged field with one contributor IS that
 * node; with several it is the merge's own node; a unit's layers (blocks, `as` entries) at path L
 * give it shells at every prefix of L.
 */
import type { AtscriptDoc } from './document'
import { isDbEntityNode } from './flatten'
import { moduleId } from './module-id'
import { SemanticGroup } from './parser/nodes'
import type {
  SemanticAnnotateNode,
  SemanticNode,
  SemanticPrimitiveNode,
  SemanticPropNode,
  SemanticRefNode,
  SemanticStructureNode,
} from './parser/nodes'
import {
  entryParts,
  isAnnotate,
  isArray,
  isConst,
  isGroup,
  isInterface,
  isPrimitive,
  isRef,
  isStructure,
  isTuple,
} from './parser/nodes'
import type { Token } from './parser/token'

/** More hidden merge classes than this in one module is a compile error. */
export const MERGE_CAP = 200
/**
 * The branch combinations a distributed merge may have; past it the merge is the compile error
 * "merge too complex" at its module, never a truncated union.
 */
export const PRODUCT_CAP = 1 << 14
export const UNION_IN_RECURSIVE_MERGE =
  'union members are not supported in recursive merges; split with named types'
export const MERGE_TOO_COMPLEX = 'merge too complex: split it with named types'
/** Why scalars (or an object and a scalar) merge to `never`. */
export const NOTHING_IN_COMMON = 'values with nothing in common'
/** A type written as an operand of its own merge (`type X = A & X`). */
export const SELF_OPERAND =
  'a type cannot be an operand of its own merge; recurse through a field instead'
/** A db entity whose flattening reaches a web of mutually recursive merges. */
export const FLATTEN_WEB =
  'flattening this type reaches mutually recursive merges; split it with named types'

/** A declaration of the build: an interface, a `type`, or an `annotate T as X` copy. */
export interface TStructDecl {
  /** unique in the model: `name@<document index>` */
  id: string
  name: string
  doc: AtscriptDoc
  node: SemanticNode
  kind: 'interface' | 'type' | 'as'
}

/** A written type expression, resolved. */
export type TStructExpr =
  | { k: 'ref'; decl: TStructDecl; node: SemanticNode }
  | { k: 'chain'; decl: TStructDecl; path: string[]; node: SemanticNode }
  | { k: 'obj'; node: SemanticNode; props: TStructProp[] }
  | { k: 'arr'; node: SemanticNode; of: TStructExpr }
  | { k: 'nul'; node: SemanticNode; of: TStructExpr }
  | { k: 'and'; node: SemanticNode; items: TStructExpr[] }
  | { k: 'uni'; node: SemanticNode; items: TStructExpr[] }
  | { k: 'tup'; node: SemanticNode; items: TStructExpr[] }
  /** a primitive (`string`, `string.email`, `null`) or a literal */
  | { k: 'scalar'; node: SemanticNode; doc: AtscriptDoc }
  | { k: 'unknown'; node?: SemanticNode }

export interface TStructProp {
  name: string
  optional: boolean
  node: SemanticPropNode
  type: TStructExpr
}

/** An intersection written in the build: its merge, module, and place (see `StructureModel.mergeRoots`). */
export interface TMergeRoot {
  mod: AtscriptDoc
  def: TStructDef
  own?: boolean
  decl: TStructDecl
  path: string[]
}

/** A def as the runtime builds it. */
export interface TStructDef {
  /** identity: equal keys = the same def object */
  key: string
  /**
   * `class`: a declaration's class def (interface, named merge); `builder`: written in place;
   * `union`: a union of objects; `merge`: a hidden merge class; `umerge`: a merge with a union
   * operand (distributes: a union of branch merges); `shell`: a shell def; `view`: an
   * `annotate T as X` copy's view of T's def (the runtime shares T's def, shelled where X has
   * entries or blocks)
   */
  kind: 'class' | 'builder' | 'union' | 'merge' | 'umerge' | 'shell' | 'view'
  /** the unit (declaration id) whose own def this is (class, builder, union, shell) */
  unit?: string
  /** a shell def: its position in its unit */
  at?: string[]
  slot: (k: string) => TStructSlot | undefined
  /** the slot as built before the unit's own shells (class / builder defs; shell step kinds) */
  raw?: (k: string) => TStructSlot | undefined
  branch?: (i: number) => TStructDef | undefined
  /** the number of branches of a union / distributed merge (`branch(i)` for i < size) */
  size?: number
  uni?: boolean
  names?: () => string[]
  /** a hidden merge's operands */
  ops?: TStructDef[]
  /** a shell def's base; an annotated-alias operand's (`a:<id>`) target def */
  base?: TStructDef
  /** the module a hidden merge class is written in */
  module?: AtscriptDoc
  /** the written type expressions the def stands for (its shape; a merge: its operands') */
  src?: TStructExpr[]
  /** a union / distributed merge: the written expressions of branch `i` (a merge branch: its members') */
  bsrc?: (i: number) => TStructExpr[]
  /**
   * a distributed merge: the member each union operand gives branch `i` — the operand (its
   * structure key) and the item path of that member in it
   */
  bpick?: (i: number) => Array<{ key: string; at: number[] }>
}

/** {@link StructureModel.slotAt}'s walk after a step: the def there, its slot, the written types. */
interface TSlotAtState {
  def: TStructDef | undefined
  slot: TStructSlot | undefined
  ends: TStructExpr[]
}

/** A node held by a def (a prop, an element, a merged field). */
export interface TStructSlot {
  /** identity: equal locs = the same node object (`unit:steps`, `m:<merge>/<name>`) */
  loc: string
  def?: TStructDef
  /** the written type expressions of its contributors */
  ends: TStructExpr[]
  /** `?`: only if every contributor is optional */
  optional: boolean
  /** a merged field's contributor nodes (several distinct ones), in operand order */
  contributors?: TStructSlot[]
  /**
   * Where the node is defined: a unit (a declaration id, or `m:<key>` for a hidden merge class's
   * own field) and the steps from its root (`$f(Root, …path)`; `&i` steps: an in-place merge
   * operand). A reference slot is its target's own slot object (same owner).
   */
  owner?: { unit: string; path: string[] }
  /** a shell node: the node it shells (its base) */
  shell?: TStructSlot
  /** the prop declaring the node (an own field; a shell keeps its base's): none for an element or a merged field */
  prop?: SemanticPropNode
}

/** The shape at a position (coarse). */
export type TStructShape =
  | { k: 'obj'; props: Map<string, { optional: boolean }> }
  | { k: 'arr' }
  /** a union holding objects: `items` = its branches' shapes */
  | { k: 'uni'; n: number; items: TStructShape[] }
  | { k: 'scalar' }
  | { k: 'never'; reason: string }
  | { k: 'mixed' }

/** A block (mutating `annotate T { … }`) or an `annotate … as` copy's entries, normalized. */
export interface TStructBlock {
  doc: AtscriptDoc
  node: SemanticAnnotateNode
  /** the declaration it writes into (a plain alias resolved to its target) */
  target: TStructDecl
  /** `undefined` for `as` entries (rank ⊥) */
  rank?: TStructRank
  /** index among its module's blocks, in source order */
  index: number
  entries: TStructEntry[]
}

export interface TStructEntry {
  ref: SemanticRefNode
  /** the path as written */
  names: string[]
  /** normalized internal steps (one per union branch with the prop) */
  paths: string[][]
  /** per path, per step: 0 own node, 1 a reference child of an own def, 2 a shared def */
  kinds: Array<Array<0 | 1 | 2>>
  error?: string
}

/** The static rank of a module's blocks: (import depth, module id); then by source order. */
export interface TStructRank {
  depth: number
  id: string
}

export interface TStructError {
  doc: AtscriptDoc
  node?: SemanticNode
  /** where it is reported, when not at `node`'s name */
  token?: Token
  message: string
  /** an annotate entry the model refuses */
  entry?: boolean
}

/** A position a merge makes `never`, see `StructureModel.neverWarnings`. */
export interface TStructNever {
  decl: TStructDecl
  /** prop names from the declaration's root (array elements and union branches left out) */
  path: string[]
  reason: string
  /** the merged slot (none: the declaration itself) */
  slot?: TStructSlot
  /** reached through a union branch (a distributed merge's) */
  branch: boolean
}

/** One layer of a unit at a path: a block's (or an `as` copy's) entry. */
export interface TStructLayer {
  block: TStructBlock
  entry: TStructEntry
}
type Layer = TStructLayer

const isBranch = (s: string) => s.startsWith('|')
/** A written `null`. */
export const isNull = (x: TStructExpr) =>
  x.k === 'scalar' && isPrimitive(x.node) && (x.node as SemanticPrimitiveNode).key === 'null'
/** A shape that is, or has a branch that is, an array. */
const holdsArray = (s: TStructShape | undefined): boolean =>
  s?.k === 'arr' || (s?.k === 'uni' && s.items.some(holdsArray))
const isMerge = (t: TStructDef) => t.kind === 'merge' || t.kind === 'umerge'
/** (depth, module id, source order); `as` entries (rank ⊥) first */
function blockOrder(a: TStructBlock, b: TStructBlock): number {
  if (!a.rank || !b.rank) {
    return (a.rank ? 1 : 0) - (b.rank ? 1 : 0)
  }
  return (
    a.rank.depth - b.rank.depth ||
    (a.rank.id < b.rank.id ? -1 : a.rank.id > b.rank.id ? 1 : 0) ||
    a.index - b.index
  )
}
const pk = (p: string[]) => p.join('.')
/** A branch of a distributed merge: its members, their written types, and what each union operand gives it. */
interface TBranch {
  defs: TStructDef[]
  src: TStructExpr[]
  pick: Array<{ key: string; at: number[] }>
}

/** Slot `s` with its shells looked through (the node they shell). */
function baseSlot(s: TStructSlot): TStructSlot {
  let n = s
  while (n.shell) {
    n = n.shell
  }
  return n
}
const baseLoc = (s: TStructSlot) => baseSlot(s).loc

/** A def with its shells looked through (the def they shell). */
export function unshell(t: TStructDef): TStructDef {
  let d = t
  while (d.kind === 'shell' && d.base) {
    d = d.base
  }
  return d
}

/**
 * The key of a def for structure: a shell def counts as the def it shells, so a metadata-only
 * block never changes a merge, a distribution, `never` or the structure checks.
 */
const structKey = (t: TStructDef): string => unshell(t).key
/**
 * The identity of def key `key` for structure only (never warnings): a shell is the
 * def it shells (`s:<unit>:<path>:<base>` → base) and a merge is the set of its leaf operands (a
 * nested merge flattened; whether a merge is `never` does not depend on their order).
 */
function mergeLeaves(key: string): string {
  const k = key.replace(/s:[^:,[\]]+:[^:,[\]]*:/g, '')
  let i = 0
  const atom = (): string => {
    const from = i
    for (let depth = 0; i < k.length && !(depth === 0 && (k[i] === ',' || k[i] === ']')); i++) {
      depth += k[i] === '[' ? 1 : k[i] === ']' ? -1 : 0
    }
    return k.slice(from, i)
  }
  const leaves = (): string[] => {
    if (!k.startsWith('m:[', i)) {
      return [atom()]
    }
    i += 3
    const out: string[] = []
    while (i < k.length && k[i] !== ']') {
      out.push(...leaves())
      if (k[i] === ',') {
        i++
      }
    }
    i++
    // (`@<module>`: one merge per module — the outer merge's module is the identity's;
    // a grouping `|w[…]` is node identity, not structure)
    mod = atom().replace(/^\|w\[.*\](?=@)/, '')
    return out
  }
  let mod = ''
  const out = [...new Set(leaves())].sort().join(',')
  return `${out}${mod}`
}

/** Where an own def of a unit is written (`pk` of its steps): a class at the root, a builder / union at its key's path. */
export function defPosition(d: TStructDef): string | undefined {
  if (d.kind === 'class') {
    return ''
  }
  const m = /^[bu]:[^:]*:(.*)$/.exec(d.key)
  return m ? m[1] : undefined
}

/**
 * An intersection's operands as written: inline `&` flattened, `| null` members as their inner
 * type (any other expression: itself).
 */
export function andExprs(t: TStructExpr): TStructExpr[] {
  const ops: TStructExpr[] = []
  const flat = (x: TStructExpr) => {
    while (x.k === 'nul') {
      x = x.of
    }
    if (x.k === 'and') {
      x.items.forEach(flat)
    } else {
      ops.push(x)
    }
  }
  flat(t)
  return ops
}

/**
 * The strongly connected components of the graph reached from `starts` (Tarjan, iterative: chains
 * can be long): node → its component (one array per component).
 */
export function components<T>(starts: Iterable<T>, succ: (k: T) => T[]): Map<T, T[]> {
  const index = new Map<T, number>()
  const low = new Map<T, number>()
  const on = new Set<T>()
  const stack: T[] = []
  const comp = new Map<T, T[]>()
  let idx = 0
  const work: Array<{ v: T; next: T[]; i: number }> = []
  const enter = (v: T) => {
    index.set(v, idx)
    low.set(v, idx)
    idx++
    stack.push(v)
    on.add(v)
    work.push({ v, next: succ(v), i: 0 })
  }
  for (const start of starts) {
    if (index.has(start)) {
      continue
    }
    enter(start)
    while (work.length > 0) {
      const top = work[work.length - 1]
      if (top.i < top.next.length) {
        const w = top.next[top.i++]
        if (!index.has(w)) {
          enter(w)
        } else if (on.has(w)) {
          low.set(top.v, Math.min(low.get(top.v)!, index.get(w)!))
        }
        continue
      }
      work.pop()
      if (work.length > 0) {
        const parent = work[work.length - 1].v
        low.set(parent, Math.min(low.get(parent)!, low.get(top.v)!))
      }
      if (low.get(top.v) === index.get(top.v)) {
        const c: T[] = []
        let w: T
        do {
          w = stack.pop()!
          on.delete(w)
          c.push(w)
        } while (w !== top.v)
        for (const x of c) {
          comp.set(x, c)
        }
      }
    }
  }
  return comp
}

/**
 * Whether a simple cycle of the component `comp` passes through two or more of its merges (a web
 * of mutually recursive merges). Each merge in turn starts a search for a cycle back to it
 * through another merge, the merges searched before left out (a cycle through one of them was
 * found from it).
 */
function webCycle(comp: string[], merges: string[], succ: (k: string) => string[]): boolean {
  const inComp = new Set(comp)
  const done = new Set<string>()
  for (const m of merges) {
    const onPath = new Set<string>([m])
    // (depth-first over simple paths from m: [node, its successors, next index, merges on the path])
    const work: Array<{ v: string; next: string[]; i: number; n: number }> = [
      { v: m, next: succ(m), i: 0, n: 1 },
    ]
    while (work.length > 0) {
      const top = work[work.length - 1]
      if (top.i >= top.next.length) {
        work.pop()
        onPath.delete(top.v)
        continue
      }
      const w = top.next[top.i++]
      if (w === m) {
        if (top.n >= 2) {
          return true
        }
        continue
      }
      if (!inComp.has(w) || done.has(w) || onPath.has(w)) {
        continue
      }
      onPath.add(w)
      work.push({ v: w, next: succ(w), i: 0, n: top.n + (merges.includes(w) ? 1 : 0) })
    }
    done.add(m)
  }
  return false
}

/**
 * The written types of a merged field's contributors as one merge reads them: one written type
 * reached through several operands (`I4 & (I4 | null)`, `I4 & I5` with `I5 extends I4`) counts
 * once, at its last place (MODEL §15 DEDUP-1).
 */
function distinctEnds(ends: TStructExpr[]): TStructExpr[] {
  return ends.filter((e, i) => !ends.includes(e, i + 1))
}

/** Whether a type path's step `s` at `def` fans out into its branches: a union (or a distributed merge without `s`). */
function fansOut(def: TStructDef, s: string): boolean {
  return !!def.branch && def.size !== undefined && (!!def.uni || def.slot(s) === undefined)
}

/** A position of a type path being walked (see `StructureModel.typePathPositions`): its internal path and the def there. */
interface TPathAt {
  path: string[]
  def: TStructDef | undefined
}

/** One structure model per set of documents (a build). */
export class StructureModel {
  readonly docs: AtscriptDoc[]
  private readonly docIndex = new Map<AtscriptDoc, number>()
  private readonly declsByNode = new Map<SemanticNode, TStructDecl>()
  private readonly declsById = new Map<string, TStructDecl>()
  readonly decls: TStructDecl[] = []
  readonly blocks: TStructBlock[] = []
  readonly errors: TStructError[] = []
  /** layers per unit: path key -> layers (blocks and `as` entries) */
  private readonly layers = new Map<string, Map<string, Layer[]>>()
  private readonly exprMemo = new Map<SemanticNode, TStructExpr>()
  /** whether every block's layers are in (see {@link collectLayers}) */
  private layersReady = false
  /** a chain ref's positions (see {@link typePathPositions}), with every block's layers */
  private readonly chainPaths = new Map<SemanticNode, string[][]>()
  /** chain refs walked before every block's layers were in: by declared field only */
  private readonly provisional = new Map<
    SemanticNode,
    { t: TStructExpr & { k: 'chain' }; paths: string[][] }
  >()

  constructor(docs: Iterable<AtscriptDoc>) {
    const all: AtscriptDoc[] = []
    const add = (d: AtscriptDoc) => {
      if (this.docIndex.has(d)) {
        return
      }
      this.docIndex.set(d, all.length)
      all.push(d)
      d.dependencies.forEach(add)
    }
    for (const d of docs) {
      add(d)
    }
    this.docs = all
    for (const doc of all) {
      for (const node of doc.nodes) {
        const kind =
          node.entity === 'interface'
            ? 'interface'
            : node.entity === 'type'
              ? 'type'
              : node.entity === 'annotate' && !(node as SemanticAnnotateNode).isMutating
                ? 'as'
                : undefined
        if (kind && node.id) {
          const decl: TStructDecl = {
            id: `${node.id}@${this.docIndex.get(doc)}`,
            name: node.id,
            doc,
            node,
            kind,
          }
          this.declsByNode.set(node, decl)
          this.declsById.set(decl.id, decl)
          this.decls.push(decl)
        }
      }
    }
    this.collectLayers()
  }

  // ------------------------------------------------------------ declarations and expressions

  /** The declaration `name` resolves to in `doc` (through imports). */
  declOf(doc: AtscriptDoc, name: string): TStructDecl | undefined {
    const owner = doc.getDeclarationOwnerNode(name)
    return owner?.node ? this.declsByNode.get(owner.node) : undefined
  }

  /** The model's declaration of a semantic declaration node. */
  declOfNode(node: SemanticNode): TStructDecl | undefined {
    return this.declsByNode.get(node)
  }

  /** `type P = T` / `type P = (T)`: the declaration it aliases directly. */
  aliasStep(d: TStructDecl): TStructDecl | undefined {
    if (d.kind !== 'type') {
      return undefined
    }
    const t = this.declExpr(d)
    return t.k === 'ref' ? t.decl : undefined
  }

  /**
   * A BARE plain alias (no type-level annotations of its own) is literally its target
   * (`P = T` in the generated JS): its root IS the target's node. An alias with its own
   * type-level annotations is a thin node of its own over its target. (Blocks on any plain alias
   * target its final target: {@link plainTarget}.)
   */
  bareTarget(d: TStructDecl): TStructDecl {
    const seen = new Set<TStructDecl>()
    let cur = d
    while (!seen.has(cur) && !(cur.node.annotations?.length ?? 0)) {
      seen.add(cur)
      const next = this.aliasStep(cur)
      if (!next) {
        break
      }
      cur = next
    }
    return cur
  }

  /** A plain alias is its target (through aliases of aliases). */
  plainTarget(d: TStructDecl): TStructDecl {
    const seen = new Set<TStructDecl>()
    let cur = d
    for (let next = this.aliasStep(cur); next && !seen.has(next); next = this.aliasStep(cur)) {
      seen.add(cur)
      cur = next
    }
    return cur
  }

  /** The expression a `type` declares. */
  declExpr(d: TStructDecl): TStructExpr {
    return d.kind === 'type' ? this.exprOf(d.doc, d.node.def) : { k: 'unknown', node: d.node }
  }

  /** The target of an `annotate T as X` copy. */
  asTarget(d: TStructDecl): TStructDecl | undefined {
    return d.kind === 'as'
      ? this.declOf(d.doc, (d.node as SemanticAnnotateNode).targetName)
      : undefined
  }

  /** The declaration whose structure `d` has: an `as` copy's (through copies of copies) target. */
  structureRoot(d: TStructDecl): TStructDecl | undefined {
    const seen = new Set<TStructDecl>()
    let root: TStructDecl | undefined = d
    while (root?.kind === 'as' && !seen.has(root)) {
      seen.add(root)
      root = this.asTarget(root)
    }
    return root
  }

  /** An interface's parents, in order. */
  extendsOf(d: TStructDecl): TStructDecl[] {
    if (!isInterface(d.node)) {
      return []
    }
    return d.node.extendsTokens
      .map(t => this.declOf(d.doc, t.text))
      .filter((x): x is TStructDecl => !!x)
  }

  /** An interface's own props. */
  ownProps(d: TStructDecl): TStructProp[] {
    if (!isInterface(d.node) || !isStructure(d.node.def)) {
      return []
    }
    return this.propsOf(d.doc, d.node.def)
  }

  private propsOf(doc: AtscriptDoc, struct: SemanticStructureNode): TStructProp[] {
    const out: TStructProp[] = []
    for (const [name, prop] of struct.props) {
      out.push({
        name,
        optional: !!prop.token('optional'),
        node: prop,
        type: this.exprOf(doc, prop.def),
      })
    }
    return out
  }

  /** A written type expression of `doc`, resolved. */
  exprOf(doc: AtscriptDoc, node: SemanticNode | undefined): TStructExpr {
    if (!node) {
      return { k: 'unknown' }
    }
    let hit = this.exprMemo.get(node)
    if (!hit) {
      hit = this.exprOf0(doc, node)
      this.exprMemo.set(node, hit)
      if (hit.k === 'chain') {
        // (set first: a chain whose path reads a chain again sees the plain one)
        hit = this.chainThroughUnions(hit)
        this.exprMemo.set(node, hit)
      }
    }
    return hit
  }

  /**
   * A chain ref through a union of objects: one chain per position the path reaches (see
   * {@link typePathPositions}); one: that field; none: the chain as written (core reports the
   * unknown member). Several fields, every one phantom: one phantom prop none of which is its
   * target, typed by the fields' common phantom primitive (`ui.action`), else `phantom`
   * (MODEL §15 CHAIN-1 U4, POS-1c; a mix is a compile error).
   */
  private chainThroughUnions(t: TStructExpr & { k: 'chain' }): TStructExpr {
    let paths = this.chainPaths.get(t.node)
    if (!paths) {
      const found = this.typePathPositions(t.decl, t.path, this.layersReady)
      paths = found ?? [t.path]
      if (this.layersReady) {
        this.chainPaths.set(t.node, paths)
      } else if (found) {
        this.provisional.set(t.node, { t, paths })
      }
    }
    if (paths.length === 1) {
      return paths[0] === t.path ? t : { ...t, path: paths[0] }
    }
    const chains = paths.map(path => ({ ...t, path }))
    const prims = new Map<string, SemanticPrimitiveNode>()
    const phantom = chains.every(c => this.phantomField(c, prims))
    const prim =
      phantom &&
      (prims.size === 1
        ? [...prims.values()][0]
        : t.decl.doc.getDeclarationOwnerNode('phantom')?.node)
    return prim
      ? { k: 'scalar', node: prim, doc: t.decl.doc }
      : { k: 'uni', node: t.node, items: chains }
  }

  /**
   * Whether the field chain `c` names is phantom: every type written there is a phantom
   * primitive (through aliases, chains), each added to `prims` by its key.
   */
  private phantomField(
    c: TStructExpr & { k: 'chain' },
    prims: Map<string, SemanticPrimitiveNode>,
    seen = new Set<TStructExpr>()
  ): boolean {
    seen.add(c)
    const ends = this.slotAt(c.decl, c.path)?.ends ?? []
    return (
      ends.length > 0 &&
      ends.every(e => {
        const u = this.pastAliases(e)
        if (u.k === 'chain') {
          return !seen.has(u) && this.phantomField(u, prims, seen)
        }
        const prim = u.k === 'scalar' && isPrimitive(u.node) ? u.node : undefined
        if (prim?.config.type !== 'phantom') {
          return false
        }
        prims.set(prim.key, prims.get(prim.key) ?? prim)
        return true
      })
    )
  }

  /**
   * The positions type path `path` of `d` reaches through unions (MODEL §15 CHAIN-1, POS-1), as
   * internal paths (`|i` steps): a union — or a distributed merge without the prop — fans out
   * into its branches (nested unions flattened), each step keeps the positions that have the
   * prop (a branch that dead-ends deeper is skipped), and branches reaching one position
   * ({@link positionKey}; `blocks` false: by the declared field only) are one, the first.
   * `undefined` when the path crosses no union or no position reaches its end.
   *
   * (Core's `AtscriptDoc.pathWalk` is the same chain step on semantic nodes: the two must stay
   * in step.)
   */
  typePathPositions(d: TStructDecl, path: string[], blocks = true): string[][] | undefined {
    let at: TPathAt[] = [{ path: [], def: this.refDef(d) }]
    let crossed = false
    for (const s of path) {
      const next: TPathAt[] = []
      for (const p of at) {
        if (p.def && fansOut(p.def, s)) {
          const branches = this.branchesWith(p.def, p.path, s, new Set())
          next.push(...branches)
          crossed ||= branches.length > 0
        } else if (!crossed || p.def?.slot(s)) {
          next.push({ path: [...p.path, s], def: p.def?.slot(s)?.def })
        }
      }
      at = crossed && next.length > 1 ? this.onePerPosition(d, next, blocks) : next
    }
    return crossed && at.length > 0 ? at.map(p => p.path) : undefined
  }

  /** {@link typePathPositions}'s step into the branches of union `def` (at `p`) that have prop `s`, nested unions flattened. */
  private branchesWith(def: TStructDef, p: string[], s: string, seen: Set<string>): TPathAt[] {
    seen.add(def.key)
    const out: TPathAt[] = []
    for (let i = 0; i < (def.size ?? 0); i++) {
      const b = def.branch?.(i)
      const slot = b?.slot(s)
      if (slot) {
        out.push({ path: [...p, `|${i}`, s], def: slot.def })
      } else if (b && fansOut(b, s) && !seen.has(b.key)) {
        out.push(...this.branchesWith(b, [...p, `|${i}`], s, seen))
      }
    }
    return out
  }

  /** Positions `at` of a type path of `d`, one per {@link positionKey} (the first). */
  private onePerPosition(d: TStructDecl, at: TPathAt[], blocks: boolean): TPathAt[] {
    const keys = new Set<string>()
    return at.filter(p => {
      const k = this.positionKey(d, p.path, blocks)
      return !keys.has(k) && !!keys.add(k)
    })
  }

  /**
   * The identity of position (d, path) of a type path (MODEL §15 POS-1, POS-1a, POS-1b): the
   * field its node is — shells looked through: a declared field, or a merged field's
   * contributors (each counted once, in order) — and the blocks at or below it: per shell (and
   * the field itself), the entries its unit's layers have at or below it, relative to it. Equal
   * keys: one position. `blocks` false: the field only.
   */
  positionKey(d: TStructDecl, path: string[], blocks = true): string {
    const s = this.slotAt(d, path)
    return s ? this.slotKey(s, blocks) : ''
  }

  /** {@link positionKey} of slot `s`. */
  private slotKey(s: TStructSlot, blocks: boolean): string {
    const parts: string[] = []
    for (let c: TStructSlot | undefined = s; c; c = c.shell) {
      if (blocks && c.owner) {
        parts.push(this.entriesBelow(c.owner.unit, c.owner.path))
      }
      if (!c.shell) {
        parts.push(
          c.contributors
            ? `(${[...new Set(c.contributors.map(x => this.slotKey(x, blocks)))].join('+')})`
            : c.loc
        )
      }
    }
    return parts.join('>')
  }

  /**
   * The declared props the field at position (d, path) is (shells looked through): a declared
   * field its prop, a merged field its contributors' (each once, in order; MODEL §15 POS-1b).
   */
  declaredProps(d: TStructDecl, path: string[]): SemanticPropNode[] {
    const s = this.slotAt(d, path)
    return s ? [...new Set(this.slotProps(s))] : []
  }

  private slotProps(s: TStructSlot): SemanticPropNode[] {
    const base = baseSlot(s)
    return base.contributors
      ? base.contributors.flatMap(c => this.slotProps(c))
      : base.prop
        ? [base.prop]
        : []
  }

  private entryIds?: Map<TStructEntry, number>

  /** The entries unit `U`'s layers have at or below `at`: `relative path=entry`, sorted. */
  private entriesBelow(U: string, at: string[]): string {
    const ids = (this.entryIds ??= new Map())
    const pre = pk(at)
    const out: string[] = []
    for (const [k, ls] of this.layers.get(U) ?? []) {
      if (pre === '' || k === pre || k.startsWith(`${pre}.`)) {
        for (const l of ls) {
          let id = ids.get(l.entry)
          if (id === undefined) {
            ids.set(l.entry, (id = ids.size))
          }
          out.push(`${k.slice(pre.length)}=${id}`)
        }
      }
    }
    return out.sort().join(',')
  }

  private exprOf0(doc: AtscriptDoc, node: SemanticNode): TStructExpr {
    if (isRef(node)) {
      const owner = doc.resolveRefOwner(node)
      const target = owner?.node
      if (!target) {
        return { k: 'unknown', node }
      }
      if (isPrimitive(target)) {
        let prim: SemanticPrimitiveNode | undefined = target
        for (const c of node.chain) {
          prim = prim?.props.get(c.text)
        }
        return prim ? { k: 'scalar', node: prim, doc } : { k: 'unknown', node }
      }
      const decl = this.declsByNode.get(target)
      if (!decl) {
        return { k: 'unknown', node }
      }
      return node.hasChain
        ? { k: 'chain', decl, path: node.chain.map(c => c.text), node }
        : { k: 'ref', decl, node }
    }
    if (isConst(node) || isPrimitive(node)) {
      return { k: 'scalar', node, doc }
    }
    if (isStructure(node)) {
      return { k: 'obj', node, props: this.propsOf(doc, node) }
    }
    const n0 = node as SemanticNode
    if (isArray(n0)) {
      return { k: 'arr', node, of: this.exprOf(doc, n0.def) }
    }
    if (isTuple(n0)) {
      return { k: 'tup', node, items: n0.unwrap().map(n => this.exprOf(doc, n)) }
    }
    if (isGroup(node)) {
      const g = node as SemanticGroup
      const items = g.unwrap()
      if (items.length === 1) {
        return this.exprOf(doc, items[0])
      }
      if (g.op === '&') {
        return { k: 'and', node, items: items.map(n => this.exprOf(doc, n)) }
      }
      if (g.op === '|') {
        const xs = items.map(n => this.exprOf(doc, n))
        if (xs.length === 2 && xs.filter(isNull).length === 1) {
          return { k: 'nul', node, of: xs.find(x => !isNull(x))! }
        }
        return { k: 'uni', node, items: xs }
      }
    }
    return { k: 'unknown', node }
  }

  // ------------------------------------------------------------ blocks and layers

  private collectLayers(): void {
    // A chain ref through a union walked while the blocks are collected (an entry through a prop
    // typed by a type path) has its positions by declared field only: POS-1 needs every block's
    // layers. With every block in, they are found again (and kept); when blocks split one, the
    // blocks are collected again over them (each round fixes more chains: it ends).
    for (;;) {
      this.collectBlocks()
      // (defs computed while normalizing lack the later layers)
      this.clearDefs()
      this.layersReady = true
      let split = false
      for (const [node, { t, paths }] of this.provisional) {
        const final = this.typePathPositions(t.decl, t.path) ?? [t.path]
        this.chainPaths.set(node, final)
        split ||= final.length !== paths.length
      }
      this.provisional.clear()
      if (!split) {
        break
      }
      this.layersReady = false
      this.layers.clear()
      this.blocks.length = 0
      this.errors.length = 0
      this.exprMemo.clear()
      this.shapeMemo.clear()
      this.distMemo.clear()
      this.clearDefs()
    }
    // kinds from the final model
    for (const b of this.blocks) {
      for (const e of b.entries) {
        e.kinds = e.paths.map(p => this.shellSteps(b.target, p))
      }
    }
  }

  private clearDefs(): void {
    this.defMemo.clear()
    this.slotAtMemo.clear()
    this.declDefMemo.clear()
    this.layerPathMemo.clear()
    this.locMemo.clear()
  }

  /** Every block's (and `as` copy's) entries, normalized, as layers. */
  private collectBlocks(): void {
    // (`annotate T as X { … }` entries: X's own layers, at their path only: no collapse)
    for (const d of this.decls) {
      if (d.kind !== 'as') {
        continue
      }
      const node = d.node as SemanticAnnotateNode
      const block: TStructBlock = { doc: d.doc, node, target: d, index: 0, entries: [] }
      for (const ref of node.annotatedEntries) {
        const entry = this.entryOf(d, ref, false)
        block.entries.push(entry)
        if (entry.error) {
          this.errors.push({ doc: d.doc, node: ref, message: entry.error, entry: true })
        }
        for (const p of entry.paths) {
          this.addLayer(d.id, p, { block, entry })
        }
      }
      this.blocks.push(block)
    }
    const ranks = this.ranks()
    for (const doc of this.docs) {
      let index = 0
      for (const node of doc.nodes) {
        if (!isAnnotate(node) || !node.isMutating) {
          continue
        }
        const blockIndex = index++
        const resolved = this.declOf(doc, node.targetName)
        if (!resolved) {
          continue
        }
        const target = this.plainTarget(resolved)
        const block: TStructBlock = {
          doc,
          node,
          target,
          rank: ranks.get(doc),
          index: blockIndex,
          entries: [],
        }
        for (const ref of node.annotatedEntries) {
          const entry = this.entryOf(target, ref, true)
          block.entries.push(entry)
          if (entry.error) {
            this.errors.push({ doc, node: ref, message: entry.error, entry: true })
          }
          for (const p of entry.paths) {
            this.addLayer(target.id, p, { block, entry })
          }
        }
        this.blocks.push(block)
      }
    }
  }

  private entryOf(target: TStructDecl, ref: SemanticRefNode, collapse: boolean): TStructEntry {
    const names = entryParts(ref)
    const r = this.normalize(target, names, collapse)
    return typeof r === 'string'
      ? { ref, names, paths: [], kinds: [], error: r }
      : { ref, names, paths: r, kinds: [] }
  }

  private addLayer(unit: string, path: string[], layer: Layer): void {
    let m = this.layers.get(unit)
    if (!m) {
      this.layers.set(unit, (m = new Map()))
    }
    const k = pk(path)
    let ls = m.get(k)
    if (!ls) {
      m.set(k, (ls = []))
    }
    ls.push(layer)
    this.layerPathMemo.delete(unit)
  }

  /** The layers (blocks, `as` entries) of unit `d` at `steps`. */
  layersAt(d: TStructDecl, steps: string[]): Layer[] {
    return this.layers.get(d.id)?.get(pk(steps)) ?? []
  }

  /**
   * An entry path (prop names) → internal steps from `T`'s root: `[]` through arrays, `| null`
   * passes through, and a step reaching T through a direct reference, a plain alias, an array
   * element or `| null` restarts at T's root (never through an intersection member or a merged
   * field). Through a union of objects: one path per branch that has the next prop, no collapse
   * there; no branch has it: an error. A string: the error.
   */
  normalize(T: TStructDecl, names: string[], collapse: boolean): string[][] | string {
    const out: string[][] = []
    let error: string | undefined
    // (whether some path from `start` takes names[from…]; the first failure is the error)
    const go = (start: string[], from: number): boolean => {
      let steps = start
      for (let i = from; i < names.length; i++) {
        const sh = this.shapeAt(T, steps)
        if (sh?.k === 'uni' && !this.slotAt(T, [...steps, names[i]])) {
          // (every branch that has the prop and takes the rest of the
          // path; a branch without it — a scalar, an array, `null` — or failing deeper is skipped;
          // a branch that is a union itself: the same, through its branches; the branch steps
          // stay exact)
          let took = false
          for (let b = 0; b < sh.n; b++) {
            const bs = [...steps, `|${b}`]
            const def = this.defAt(T, bs)
            // (a `never` branch — an unmergeable merge — is no object: without the prop)
            const object = sh.items[b]?.k !== 'never' && sh.items[b]?.k !== 'mixed'
            if (
              object &&
              (def?.slot(names[i]) || (def?.uni && sh.items[b]?.k === 'uni')) &&
              go(bs, i)
            ) {
              took = true
            }
          }
          if (!took) {
            error ??= `no branch of the union at "${names.slice(0, i).join('.') || T.name}" has "${names.slice(i).join('.')}"`
          }
          return took
        }
        steps = [...steps, names[i]]
        if (!this.slotAt(T, steps)) {
          error ??= `unknown path "${names.join('.')}" of ${T.name}`
          return false
        }
        if (i === names.length - 1) {
          break
        }
        const shape = this.shapeAt(T, steps)
        if (shape?.k === 'never' || shape?.k === 'mixed') {
          // (a `never` — an unmergeable merge — or a position no object can be — `null &
          // { … }` — has no props: the path names nothing)
          error ??= `unknown path "${names.join('.')}" of ${T.name}`
          return false
        }
        if (shape?.k === 'arr') {
          steps = [...steps, '[]']
        }
        if (collapse && this.reaches(this.slotAt(T, steps)!, T)) {
          steps = []
        }
      }
      out.push(steps)
      return true
    }
    return go([], 0) ? out : (error ?? `unknown path "${names.join('.')}" of ${T.name}`)
  }

  /**
   * Whether a step reaching a node reaches `T`: every written type there unwraps (`| null`, plain
   * aliases, aliases of `X | null`) to a reference to T, or is an intersection whose operands are
   * all T.
   */
  private reaches(n: TStructSlot, T: TStructDecl): boolean {
    const isT = (e: TStructExpr): boolean => {
      let t = e
      for (;;) {
        if (t.k === 'nul') {
          t = t.of
        } else if (t.k === 'ref' && t.decl.kind === 'type') {
          const x = this.declExpr(t.decl)
          if (x.k === 'ref' || x.k === 'nul') {
            t = x
          } else {
            break
          }
        } else {
          break
        }
      }
      if (t.k === 'and') {
        return t.items.every(isT)
      }
      return t.k === 'ref' && t.decl === T
    }
    return n.ends.length > 0 && n.ends.every(isT)
  }

  // ------------------------------------------------------------ defs

  private readonly defMemo = new Map<string, TStructDef>()
  private readonly slotAtMemo = new Map<string, TSlotAtState>()
  private readonly layerPathMemo = new Map<string, string[][]>()

  private mk(key: string, build: () => Omit<TStructDef, 'key'>): TStructDef {
    let t = this.defMemo.get(key)
    if (!t) {
      t = { key } as TStructDef
      this.defMemo.set(key, t)
      Object.assign(t, build())
    }
    return t
  }

  private layerPaths(U: string): string[][] {
    let ps = this.layerPathMemo.get(U)
    if (!ps) {
      ps = [...(this.layers.get(U)?.keys() ?? [])].filter(k => k !== '').map(k => k.split('.'))
      this.layerPathMemo.set(U, ps)
    }
    return ps
  }

  /** U has a layer at q or below it (a shell at q). */
  private covers(U: string, q: string[]): boolean {
    return this.layerPaths(U).some(L => L.length >= q.length && q.every((s, i) => L[i] === s))
  }

  /** U has a layer strictly below q (shells among q's children). */
  private below(U: string, q: string[]): boolean {
    return this.layerPaths(U).some(L => L.length > q.length && q.every((s, i) => L[i] === s))
  }

  private wrapDef(U: string, q: string[], def: TStructDef | undefined): TStructDef | undefined {
    return def && this.below(U, q) ? this.shellDef(U, q, def) : def
  }

  /** A slot of unit U at Q, shelled when U's layers reach Q. */
  private applyShell(U: string, Q: string[], r: TStructSlot | undefined): TStructSlot | undefined {
    if (!r) {
      return undefined
    }
    if (!this.covers(U, Q)) {
      return r
    }
    const loc = `${U}:${pk(Q)}`
    // (a node already U's own stays itself; another unit's node gets U's shell over it)
    return {
      ...r,
      loc,
      owner: { unit: U, path: Q },
      shell: r.loc === loc ? r.shell : r,
      def: this.wrapDef(U, Q, r.def),
    }
  }

  private shellDef(U: string, q: string[], base: TStructDef): TStructDef {
    return this.mk(`s:${U}:${pk(q)}:${base.key}`, () => ({
      kind: 'shell',
      unit: U,
      at: q,
      base,
      slot: k => this.applyShell(U, [...q, k], base.slot(k)),
      // (a path through a union branch shells it as the unit's own)
      branch: i => this.wrapDef(U, [...q, `|${i}`], base.branch?.(i)),
      bsrc: base.bsrc && (i => base.bsrc?.(i) ?? []),
      size: base.size,
      uni: base.uni,
      names: () => base.names?.() ?? [],
    }))
  }

  /** The node of a field of U at Q written as `t` (a prop `prop`, or an element): U's own. */
  private fieldSlot(U: string, Q: string[], t: TStructExpr, prop?: TStructProp): TStructSlot {
    return {
      loc: `${U}:${pk(Q)}`,
      owner: { unit: U, path: Q },
      def: this.wrapDef(U, Q, this.exprDef(U, Q, t)),
      ends: [t],
      optional: !!prop?.optional,
      prop: prop?.node,
    }
  }

  private builderDef(U: string, q: string[], t: TStructExpr): TStructDef {
    const raw = (k: string): TStructSlot | undefined => {
      if (t.k === 'arr') {
        return k === '[]' ? this.fieldSlot(U, [...q, k], t.of) : undefined
      }
      const p = t.k === 'obj' ? t.props.find(x => x.name === k) : undefined
      return p && this.fieldSlot(U, [...q, k], p.type, p)
    }
    return this.mk(`b:${U}:${pk(q)}`, () => ({
      kind: 'builder',
      unit: U,
      src: [t],
      slot: raw,
      raw,
      names: () => (t.k === 'arr' ? ['[]'] : t.k === 'obj' ? t.props.map(p => p.name) : []),
    }))
  }

  /** The def of the node at (U, q) whose written type is `t`; shells are added by the callers. */
  /**
   * The def written expression `t` produces at (U, q): q may step
   * through in-place merge operands (`&i`), which {@link defAt} does not.
   */
  defOfExpr(U: TStructDecl, q: string[], t: TStructExpr): TStructDef | undefined {
    return this.exprDef(U.id, q, t)
  }

  private exprDef(
    U: string,
    q: string[],
    t: TStructExpr,
    /** a merge operand: an annotated alias member of a union keeps its identity */
    operand = false
  ): TStructDef | undefined {
    switch (t.k) {
      case 'nul': {
        return this.exprDef(U, q, t.of, operand)
      }
      case 'obj':
      case 'arr': {
        return this.builderDef(U, q, t)
      }
      case 'uni': {
        // (a union holding objects — its other branches are branches
        // without props, dropped from merges they cannot take part in)
        // (a union of scalar / array branches too, `string | number[]`: its array branches merge)
        if (this.shape(t).k !== 'uni' && !holdsArray(this.branchShape(t))) {
          return undefined
        }
        const items = t.items.map((it, i) =>
          operand && it.k === 'ref'
            ? this.operandRefDef(it.decl)
            : this.exprDef(U, [...q, `|${i}`], it)
        )
        return this.mk(`u:${U}:${pk(q)}${operand ? ':op' : ''}`, () => ({
          kind: 'union',
          unit: U,
          uni: true,
          size: items.length,
          src: [t],
          bsrc: i => (t.items[i] ? [t.items[i]] : []),
          slot: () => undefined,
          branch: i => items[i],
        }))
      }
      case 'ref': {
        return this.refDef(t.decl)
      }
      case 'chain': {
        return this.fieldTypeDef(t.decl, t.path)
      }
      case 'and': {
        return this.andDef(U, q, t)
      }
      default: {
        return undefined
      }
    }
  }

  /** A reference to a declaration: a plain alias is its target. */
  refDef(d: TStructDecl): TStructDef | undefined {
    return this.declDef(this.plainTarget(d))
  }

  /** The type def of the field node a chain ref names. */
  private fieldTypeDef(d: TStructDecl, path: string[]): TStructDef | undefined {
    // (`|i` steps: a chain through a union, one branch's field; a chain reaching itself —
    // `W { w?: W.w2; w2?: W.w }`, reported as circular — has none)
    return this.guarded(`chain:${d.id}:${pk(path)}`, () => this.defAt(d, path))
  }

  /**
   * The slots several contributors give a class of its own (named merge, extends child): one ->
   * that node (a reference), several -> the class's own node over the merge of their types.
   */
  private classSlot(
    U: string,
    k: string,
    cs: Array<TStructSlot | undefined>,
    mod: AtscriptDoc,
    shell: boolean,
    /** the contributors in written order, when `cs` is not (the merged object's prop order) */
    wcs?: Array<TStructSlot | undefined>,
    /** the contributors of a merged field, when not `cs`: the operands flattened */
    fcs?: Array<TStructSlot | undefined>
  ): TStructSlot | undefined {
    const ws = cs.filter((c): c is TStructSlot => !!c)
    if (ws.length === 0) {
      return undefined
    }
    if (ws.length === 1 || ws.every(x => x.loc === ws[0].loc)) {
      return shell ? this.applyShell(U, [k], ws[0]) : ws[0]
    }
    const xs = fcs ? fcs.filter((c): c is TStructSlot => !!c) : ws
    if (fcs) {
      wcs ??= cs
    }
    const ends = xs.flatMap(x => x.ends)
    const merged: TStructSlot = {
      loc: `${U}:${k}`,
      owner: { unit: U, path: [k] },
      // (unmergeable shapes are `never`: no merge of their types; contributors
      // without a def — scalars — take part in a distribution's `never` test; arrays and
      // tuples: a tuple of the item intersections, written by the core algebra)
      def:
        this.neverShape(ends, xs) || this.tupleShape(ends)
          ? undefined
          : this.mergeOf(
              xs.map(x => x.def),
              mod,
              xs.filter(x => !x.def).flatMap(x => x.ends),
              (wcs ?? xs).map(x => x?.def)
            ),
      ends,
      optional: xs.every(x => x.optional),
      contributors: xs,
    }
    if (shell) {
      merged.def = this.wrapDef(U, [k], merged.def)
    }
    return merged
  }

  /** The def of a declaration: its class (interface, named merge), its written def, a view. */
  declDef(d: TStructDecl): TStructDef | undefined {
    if (this.declDefMemo.has(d.id)) {
      // (null: reached again while its own def is built — `type X = A & X`, a cycle of merge
      // operands: the operand contributes nothing)
      return this.declDefMemo.get(d.id) ?? undefined
    }
    this.declDefMemo.set(d.id, null)
    const r = this.declDef0(d)
    this.declDefMemo.set(d.id, r)
    return r
  }

  private readonly declDefMemo = new Map<string, TStructDef | null | undefined>()
  /** slots being computed (a cycle of `extends` reaching itself: no slot) */
  private readonly slotsInProgress = new Set<string>()

  private guarded<T>(key: string, fn: () => T | undefined): T | undefined {
    if (this.slotsInProgress.has(key)) {
      return undefined
    }
    this.slotsInProgress.add(key)
    try {
      return fn()
    } finally {
      this.slotsInProgress.delete(key)
    }
  }

  private declDef0(d: TStructDecl): TStructDef | undefined {
    const U = d.id
    if (d.kind === 'as') {
      const target = this.asTarget(d)
      const base = target && this.refDef(target)
      return (
        base &&
        this.mk(`d:${U}`, () => ({
          kind: 'view',
          src: [{ k: 'ref', decl: d, node: d.node }],
          bsrc: base.bsrc && (i => base.bsrc?.(i) ?? []),
          slot: k => this.applyShell(U, [k], base.slot(k)),
          raw: k => base.slot(k),
          branch: i => base.branch?.(i),
          size: base.size,
          uni: base.uni,
          names: () => base.names?.() ?? [],
        }))
      )
    }
    if (d.kind === 'interface') {
      const own = this.ownProps(d)
      const ext = this.extendsOf(d)
      const slot = (k: string, shell: boolean) => {
        const p = own.find(x => x.name === k)
        if (p) {
          return this.fieldSlot(U, [k], p.type, p)
        }
        return this.guarded(`${U}/${k}/${shell}`, () =>
          this.classSlot(
            U,
            k,
            ext.map(e => this.refDef(e)?.slot(k)),
            d.doc,
            shell
          )
        )
      }
      return this.mk(`d:${U}`, () => ({
        kind: 'class',
        unit: U,
        src: [{ k: 'ref', decl: d, node: d.node }],
        slot: k => slot(k, true),
        raw: k => slot(k, false),
        names: () => {
          const sh = this.shape({ k: 'ref', decl: d, node: d.node })
          return sh.k === 'obj' ? [...sh.props.keys()] : []
        },
      }))
    }
    const t = this.declExpr(d)
    if (t.k === 'obj' || t.k === 'arr') {
      return this.builderDef(U, [], t)
    }
    if (t.k === 'and') {
      const m = this.andDef(U, [], t)
      if (!m) {
        return this.wrapDef(U, [], m)
      }
      // (a named merge is a class of its own: its fields from the operands — a union
      // operand whose distribution leaves one branch: that branch's operands)
      const written = this.andOps(U, [], t)
      const ops = !m.uni && written.some(o => o?.uni) ? (m.ops ?? [m]) : written
      // (a field several written operands have layers over the operands flattened,
      // in priority order — an in-place one last —; a field one written operand has is its node)
      const fops = m.kind === 'merge' && m.ops && ops === written ? m.ops : undefined
      return this.mk(`d:${U}`, () => ({
        kind: 'class',
        unit: U,
        slot: k =>
          this.classSlot(
            U,
            k,
            ops.map(o => o?.slot(k)),
            d.doc,
            true,
            undefined,
            fops?.map(o => o.slot(k))
          ),
        raw: k =>
          this.classSlot(
            U,
            k,
            ops.map(o => o?.slot(k)),
            d.doc,
            false,
            undefined,
            fops?.map(o => o.slot(k))
          ),
        branch: i => m.branch?.(i),
        src: [{ k: 'ref', decl: d, node: d.node }],
        bsrc: m.bsrc && (i => m.bsrc?.(i) ?? []),
        size: m.size,
        uni: m.uni,
        names: () => m.names?.() ?? [],
      }))
    }
    return this.wrapDef(U, [], this.exprDef(U, [], t))
  }

  /**
   * The operand defs of an intersection written in U at q: inline `&` flattened, `| null`
   * members as their inner type.
   */
  private andOps(
    U: string,
    q: string[],
    t: TStructExpr & { k: 'and' }
  ): Array<TStructDef | undefined> {
    return andExprs(t).map((x, i) =>
      x.k === 'obj' || x.k === 'arr'
        ? this.builderDef(U, [...q, `&${i}`], x)
        : x.k === 'ref'
          ? this.operandRefDef(x.decl)
          : x.k === 'chain'
            ? this.fieldTypeDef(x.decl, x.path)
            : x.k === 'uni'
              ? this.exprDef(U, [...q, `&${i}`], x, true)
              : undefined
    )
  }

  /**
   * A reference written as a merge operand. An annotated alias as written
   * is part of the merge's identity (`P & X` is not `T & X`): a def of its own over its target's
   * (the same slots), so the merge's root reads P's type-level annotations, then T's.
   */
  private operandRefDef(d: TStructDecl): TStructDef | undefined {
    const base = this.refDef(d)
    const P = this.bareTarget(d)
    if (!base || !this.aliasStep(P) || !(P.node.annotations?.length ?? 0)) {
      return base
    }
    return this.mk(`a:${P.id}`, () => ({
      kind: 'view',
      unit: P.id,
      base,
      src: [{ k: 'ref', decl: d, node: d.node }],
      bsrc: base.bsrc && (i => base.bsrc?.(i) ?? []),
      slot: k => base.slot(k),
      raw: k => base.slot(k),
      branch: i => base.branch?.(i),
      size: base.size,
      uni: base.uni,
      names: () => base.names?.() ?? [],
    }))
  }

  private andDef(U: string, q: string[], t: TStructExpr & { k: 'and' }): TStructDef | undefined {
    const defs = this.andOps(U, q, t)
    const xs = andExprs(t)
    // (operands without a def — scalars — take part in the distribution's `never` test)
    const extra = xs.filter((_, i) => !defs[i])
    // (an in-place member — an object / array written in THIS intersection — is its
    // highest contributor: last in priority order. Its rank is this merge's only: a merge that
    // flattens this one, or an `extends` of it, ranks its operands by their own places.)
    const inPlace = (i: number) => xs[i].k === 'obj' || xs[i].k === 'arr'
    const ranked = [...defs.filter((_, i) => !inPlace(i)), ...defs.filter((_, i) => inPlace(i))]
    return this.mergeOf(ranked, this.declById(U)?.doc, extra, this.normOps(defs))
  }

  private readonly exprIds = new WeakMap<object, number>()
  private exprCount = 0
  /** A stable key of written expressions (their nodes' identity). */
  private exprsKey(xs: TStructExpr[]): string {
    return xs
      .map(x => {
        const o = (x.node ?? x) as object
        let id = this.exprIds.get(o)
        if (id === undefined) {
          this.exprIds.set(o, (id = this.exprCount++))
        }
        return id
      })
      .join(',')
  }

  /** The declaration of a unit id ({@link TStructDecl.id}). */
  declById(id: string): TStructDecl | undefined {
    return this.declsById.get(id)
  }

  /** The def of key `key` (a hidden merge class's unit id `m:<key>` is its def's key). */
  defByKey(key: string): TStructDef | undefined {
    return this.defMemo.get(key)
  }

  /**
   * The merge of contributor defs written in module `mod`: one def -> that def; a union operand
   * distributes; else one hidden class per (operand list, module) whose single-contributor
   * fields are references.
   */
  mergeOf(
    defs0: Array<TStructDef | undefined>,
    mod: AtscriptDoc | undefined,
    /** operands without a def (scalars): only their shapes count */
    extra: TStructExpr[] = [],
    /**
     * the operands as written, when `defs0` is in priority order (an in-place one last): the
     * merged object's prop order (as 0.1.110 merged them)
     */
    written?: Array<TStructDef | undefined>
  ): TStructDef | undefined {
    const defs = this.normOps(defs0)
    if (defs.length === 0) {
      return undefined
    }
    if (defs.every(t => t.key === defs[0].key) && !(extra.length > 0 && defs[0].uni)) {
      // (`P & P`, P an annotated alias: P's target def — a place reads P through its written operands)
      return defs[0].key.startsWith('a:') ? defs[0].base : defs[0]
    }
    const key0 = `[${defs.map(t => t.key).join(',')}]@${mod ? this.docIndex.get(mod) : '?'}`
    if (defs.some(t => t.uni)) {
      const key = extra.length > 0 ? `${key0}~${this.exprsKey(extra)}` : key0
      // (the product of the union operands' branches, a branch that cannot merge
      // dropped — `X | never` is X; one branch left: that branch's merge)
      const branches = this.distribute(key, defs, extra, mod)
      if (branches.length <= 1) {
        return branches.length === 1 ? this.mergeOf(branches[0].defs, mod) : undefined
      }
      return this.mk(`x:${key}`, () => ({
        kind: 'umerge',
        module: mod,
        uni: true,
        size: branches.length,
        src: defs.flatMap(t => this.srcOf(t)),
        bsrc: i => branches[i]?.src ?? [],
        bpick: i => branches[i]?.pick ?? [],
        slot: () => undefined,
        branch: i => (branches[i] ? this.mergeOf(branches[i].defs, mod) : undefined),
      }))
    }
    // (a field one operand has is that operand's node — a nested merge flattened
    // but a shell of one an operand (its node is the shell's unit's) —; a field several have
    // layers over the operands flattened through the shells too: the grouping is identity)
    const grouped = this.normOps(defs0, false)
    // (the grouping is a set: which operands' nodes a field one of them has is — not their order,
    // or a recursion through the shells' merges would never reach its fixed point)
    // (a shell of a merge and its per-operand shell parts are one group: the parts drop out)
    const set = (ts: TStructDef[]) => {
      const keys = new Set(ts.map(t => t.key))
      for (const t of ts) {
        if (t.kind === 'shell' && t.unit && t.at && t.base?.ops) {
          for (const o of this.opsOf(t.base)) {
            keys.delete(`s:${t.unit}:${pk(t.at)}:${o.key}`)
          }
        }
      }
      return [...keys].sort().join(',')
    }
    const wkey = set(grouped)
    const regroup = wkey !== set(defs)
    // (the module stays last: readers find it after the last `@`)
    const key = regroup ? key0.replace(/@[^@]*$/, m => `|w[${wkey}]${m}`) : key0
    const wdefs = written ? this.normOps(written) : undefined
    return this.mk(`m:${key}`, () => ({
      kind: 'merge',
      module: mod,
      src: defs.flatMap(t => this.srcOf(t)),
      ops: defs,
      slot: k => {
        // (`defs` in priority order; the merged object's prop order is the written one)
        const cs = defs.map(t => t.slot(k)).filter((c): c is TStructSlot => !!c)
        if (cs.length === 0) {
          return undefined
        }
        if (regroup) {
          const ws = grouped.map(t => t.slot(k)).filter((c): c is TStructSlot => !!c)
          if (ws.length === 1 || ws.every(c => c.loc === ws[0].loc)) {
            return ws[0]
          }
        }
        if (cs.length === 1 || cs.every(c => c.loc === cs[0].loc)) {
          return cs[0]
        }
        const ends = cs.flatMap(c => c.ends)
        return {
          loc: `m:${key}/${k}`,
          owner: { unit: `m:${key}`, path: [k] },
          // (unmergeable shapes are `never`: no merge of their types; arrays and
          // tuples: a tuple of the item intersections, written by the core algebra)
          def:
            this.neverShape(ends, cs) || this.tupleShape(ends)
              ? undefined
              : this.mergeOf(
                  cs.map(c => c.def),
                  mod,
                  cs.filter(c => !c.def).flatMap(c => c.ends),
                  (wdefs ?? defs).map(t => t.slot(k)?.def)
                ),
          ends,
          optional: cs.every(c => c.optional),
          contributors: cs,
        }
      },
      names: () => [
        ...new Set(
          (written?.filter((t): t is TStructDef => !!t) ?? defs).flatMap(t => t.names?.() ?? [])
        ),
      ],
    }))
  }

  /**
   * A merge's operand list normalized: a merge operand is its operands; a repeated
   * operand counts at its last place, where it wins (finitely many distinct merges for recursive
   * ones). A shell def counts as the def it shells: a union and shell defs of it are
   * ONE operand — distributed they would be a product, another structure —, at its last place, the
   * highest shell kept: its blocks still layer below. Object / array defs and their shells merge
   * as a hidden class as before: the same structure, both layered.
   */
  private normOps(defs0: Array<TStructDef | undefined>, shells = true): TStructDef[] {
    const flat = defs0
      .filter((t): t is TStructDef => !!t)
      .flatMap(t => (shells ? this.opsOf(t) : (t.ops ?? [t])))
    const opKey = (t: TStructDef) => (t.uni ? structKey(t) : t.key)
    return flat
      .filter((t, i) => !flat.slice(i + 1).some(u => opKey(u) === opKey(t)))
      .map(t => {
        const same = flat.filter(u => opKey(u) === opKey(t))
        return same.findLast(u => u.kind === 'shell') ?? t
      })
  }

  /**
   * A merge operand's operands: a merge's; a shell of a merge (structurally the
   * merge it shells) is the merge's operands, each under the shell — where the shell's unit has
   * layers, its node; elsewhere the operand's — so a raw write on the inner merge's field stays
   * local, and the unit's blocks still layer.
   */
  private opsOf(t: TStructDef): TStructDef[] {
    if (t.ops) {
      return t.ops
    }
    if (t.kind === 'shell' && t.base && t.at && t.unit) {
      const inner = this.opsOf(t.base)
      if (inner.length > 1 || inner[0] !== t.base) {
        return inner.map(o => this.shellPart(t, o))
      }
    }
    return [t]
  }

  /** Operand `o` of the merge shell def `whole` shells (see {@link opsOf}). */
  private shellPart(whole: TStructDef, o: TStructDef): TStructDef {
    const U = whole.unit!
    const q = whole.at!
    // (keyed as U's shell over `o` at q: for STRUCTURE it is `o` — `structKey`,
    // `mergeLeaves` —; the merge it is a part of is the def at q, so no other shell has this key)
    return this.mk(`s:${U}:${pk(q)}:${o.key}`, () => ({
      kind: 'shell',
      unit: U,
      at: q,
      base: o,
      slot: k => (this.covers(U, [...q, k]) ? whole.slot(k) : o.slot(k)),
      branch: i => this.wrapDef(U, [...q, `|${i}`], o.branch?.(i)),
      bsrc: o.bsrc && (i => o.bsrc?.(i) ?? []),
      size: o.size,
      uni: o.uni,
      names: () => o.names?.() ?? [],
    }))
  }

  /** The written expressions a def stands for (a shell / view: its base's). */
  private srcOf(t: TStructDef): TStructExpr[] {
    return t.src ?? (t.base ? this.srcOf(t.base) : [])
  }

  private readonly distMemo = new Map<string, TBranch[]>()
  /** the modules a distributed merge of which has more than {@link PRODUCT_CAP} branches */
  private readonly tooComplex = new Set<AtscriptDoc | undefined>()

  /** Whether a merge written in module `doc` distributes past {@link PRODUCT_CAP} (so far). */
  tooComplexIn(doc: AtscriptDoc): boolean {
    return this.tooComplex.has(doc)
  }

  /**
   * The branches of a merge with union operands — one member of each union
   * operand (its branches; a branch that is a union itself: its own), first operand outermost —
   * without those whose merge is `never` (unmergeable shapes, disjoint scalars) or holds `null`.
   */
  private distribute(
    key: string,
    defs: TStructDef[],
    extra: TStructExpr[],
    mod: AtscriptDoc | undefined
  ): TBranch[] {
    const hit = this.distMemo.get(key)
    if (hit) {
      return hit
    }
    const out: TBranch[] = []
    this.distMemo.set(key, out)
    const choices = defs.map(t =>
      t.uni
        ? this.leaves(t)
        : [{ def: t as TStructDef | undefined, src: this.srcOf(t), at: [] as number[] }]
    )
    const total = choices.reduce((n, c) => n * c.length, 1)
    if (total > PRODUCT_CAP) {
      // (too many branches — the module's error, no branch of it built)
      this.tooComplex.add(mod)
      return out
    }
    for (let k = 0; k < total; k++) {
      const pick: Array<{ def?: TStructDef; src: TStructExpr[]; at: number[] }> = []
      let r = k
      for (let j = choices.length - 1; j >= 0; j--) {
        pick[j] = choices[j][r % choices[j].length]
        r = Math.floor(r / choices[j].length)
      }
      const src = [...pick.flatMap(p => p.src), ...extra]
      const sh = this.combine(
        src.map(e => this.shape(e)),
        src
      )
      if (sh.k !== 'never' && sh.k !== 'mixed') {
        out.push({
          defs: pick.map(p => p.def).filter((d): d is TStructDef => !!d),
          src,
          pick: defs.flatMap((t, j) => (t.uni ? [{ key: structKey(t), at: pick[j].at }] : [])),
        })
      }
    }
    return out
  }

  /** A union def's branches as merge members: a union branch flattened, `null` / never left out. */
  private leaves(t: TStructDef): Array<{ def?: TStructDef; src: TStructExpr[]; at: number[] }> {
    const out: Array<{ def?: TStructDef; src: TStructExpr[]; at: number[] }> = []
    for (let i = 0; i < (t.size ?? 0); i++) {
      const src = t.bsrc?.(i) ?? []
      const b = t.branch?.(i)
      const sh =
        src.length === 1
          ? this.shape(src[0])
          : this.combine(
              src.map(e => this.shape(e)),
              src
            )
      if (sh.k === 'mixed' || sh.k === 'never') {
        continue
      }
      if (sh.k === 'uni' && b?.uni) {
        out.push(...this.leaves(b).map(x => ({ ...x, at: [i, ...x.at] })))
      } else {
        out.push({ def: b, src, at: [i] })
      }
    }
    return out
  }

  // ------------------------------------------------------------ positions

  /**
   * The item path, in union def `op` (a contributor's), of the member branch `i`
   * of distributed merge `def` takes from it (a branch item of a merged field layers over the
   * contributors' nodes at that branch; `op` the merge itself — every contributor has that type
   * —: its branch `i`); undefined when `op` is not one of its union operands.
   */
  branchItem(def: TStructDef, i: number, op: TStructDef | undefined): number[] | undefined {
    if (op && structKey(op) === structKey(def)) {
      return [i]
    }
    return op?.uni ? def.bpick?.(i).find(p => p.key === structKey(op))?.at : undefined
  }

  /** The def at (decl, steps) (`[]` the root's def). */
  defAt(d: TStructDecl, steps: string[]): TStructDef | undefined {
    let def = this.refDef(d)
    for (const s of steps) {
      if (!def) {
        return undefined
      }
      if (isBranch(s)) {
        def = def.branch?.(Number(s.slice(1)))
        continue
      }
      def = def.slot(s)?.def
    }
    return def
  }

  /**
   * The slot at (decl, steps), steps not empty and not ending with a branch step (`slotAt(T,
   * [])`: a slot standing for T's root: `root:<id>`; a bare plain alias's root is its target's,
   * an annotated alias's its own over its target's).
   */
  slotAt(d: TStructDecl, steps: string[]): TStructSlot | undefined {
    if (steps.length === 0) {
      return {
        loc: `root:${this.bareTarget(d).id}`,
        owner: { unit: this.bareTarget(d).id, path: [] },
        def: this.refDef(d),
        ends: [{ k: 'ref', decl: d, node: d.node }],
        optional: false,
      }
    }
    // (a read of the final model — no recursion guard open: a path's prefixes are walked once,
    // a deep path's every prefix is read again by the code generator)
    const memo = this.slotsInProgress.size === 0 ? this.slotAtMemo : undefined
    let n = memo ? steps.length : 0
    let at: TSlotAtState | undefined
    for (; n > 0 && !at; n--) {
      at = memo?.get(`${d.id}|${pk(steps.slice(0, n))}`)
    }
    if (at) {
      n++
    }
    let def = at ? at.def : this.refDef(d)
    let slot = at?.slot
    let ends: TStructExpr[] = at ? at.ends : [{ k: 'ref', decl: d, node: d.node }]
    for (let j = at ? n : 0; j < steps.length; j++) {
      const s = steps[j]
      if (!def) {
        return undefined
      }
      if (isBranch(s)) {
        const i = Number(s.slice(1))
        ends = def.bsrc ? def.bsrc(i) : this.branchEnds(ends, i)
        def = def.branch?.(i)
        slot = undefined
      } else {
        slot = def.slot(s)
        if (!slot) {
          return undefined
        }
        def = slot.def
        ends = slot.ends
      }
      memo?.set(`${d.id}|${pk(steps.slice(0, j + 1))}`, { def, slot, ends })
    }
    return slot ?? { loc: `?br`, def, ends, optional: false }
  }

  /** The written types at the i-th branch of a union position (`(A | B) & C`: `A`, `C`). */
  private branchEnds(ends: TStructExpr[], i: number): TStructExpr[] {
    const out: TStructExpr[] = []
    const visit = (e: TStructExpr) => {
      let t = e
      for (;;) {
        if (t.k === 'nul') {
          t = t.of
        } else if (t.k === 'ref' && t.decl.kind === 'type') {
          t = this.declExpr(t.decl)
        } else if (t.k === 'ref' && t.decl.kind === 'as') {
          const target = this.asTarget(t.decl)
          if (!target) {
            break
          }
          t = { k: 'ref', decl: target, node: target.node }
        } else {
          break
        }
      }
      if (t.k === 'uni' && this.shape(t).k === 'uni') {
        if (t.items[i]) {
          out.push(t.items[i])
        }
      } else if (t.k === 'and') {
        t.items.forEach(visit)
      } else {
        out.push(e)
      }
    }
    ends.forEach(visit)
    return out
  }

  private readonly locMemo = new Map<string, string>()

  /** The runtime node identity of the position (decl, steps): equal = the same node object. */
  locAt(d: TStructDecl, steps: string[]): string {
    const mk = `${d.id}|${pk(steps)}`
    let hit = this.locMemo.get(mk)
    if (hit === undefined) {
      this.locMemo.set(mk, (hit = this.locAt0(d, steps)))
    }
    return hit
  }

  private locAt0(d: TStructDecl, steps: string[]): string {
    if (steps.length === 0) {
      return `root:${this.bareTarget(d).id}`
    }
    let def = this.refDef(d)
    let loc = ''
    for (const s of steps) {
      if (!def) {
        return `?:${d.id}:${pk(steps)}`
      }
      if (isBranch(s)) {
        loc = `br:${def.key}:${s}`
        def = def.branch?.(Number(s.slice(1)))
        continue
      }
      const r = def.slot(s)
      if (!r) {
        return `?:${d.id}:${pk(steps)}`
      }
      loc = r.loc
      def = r.def
    }
    return loc
  }

  /**
   * Per step of a normalized path of T, what the runtime does to give T its own node there
   * (the exact path): 0 = the def and the child are T's own (descend); 1 = the def is T's but the
   * child is a reference (shell the child); 2 = the def is shared (shell the def, then the child).
   */
  shellSteps(T: TStructDecl, steps: string[]): Array<0 | 1 | 2> {
    const out: Array<0 | 1 | 2> = []
    let def = this.refDef(T)
    if (T.kind === 'as') {
      // (an `as` copy shares its target's def: `$alias(X, T)`)
      def = this.declDef(T)
    }
    const U = T.id
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      if (!def) {
        break
      }
      // (the def before the unit's own shells: a shell of a shell when two layers reach it)
      let raw = def
      while (raw.kind === 'shell' && raw.unit === U && raw.base) {
        raw = raw.base
      }
      // (T's own def AT this position: a def of T's held by another of T's nodes — `next.list`
      // reaching `list`'s builder through a reference — is shared there, cloned like a foreign one)
      const own =
        raw.unit === U && raw.kind !== 'view' && defPosition(raw) === pk(steps.slice(0, i))
      if (isBranch(s)) {
        out.push(own ? 0 : 2)
        def = def.branch?.(Number(s.slice(1)))
        continue
      }
      if (own) {
        const r = raw.raw ? raw.raw(s) : raw.slot(s)
        out.push(r?.loc === `${U}:${pk(steps.slice(0, i + 1))}` ? 0 : 1)
      } else {
        out.push(2)
      }
      def = def.slot(s)?.def
    }
    return out
  }

  // ------------------------------------------------------------ shapes

  /** The shape at (decl, steps), `undefined` when no node is there. */
  shapeAt(d: TStructDecl, steps: string[]): TStructShape | undefined {
    const n = this.slotAt(d, steps)
    return n ? this.slotShape(n) : undefined
  }

  /**
   * Whether `null` is a value of a merged slot's node: every written type there is nullable (a
   * single-contributor slot is its contributor's node, written as is).
   */
  nullableSlot(n: TStructSlot): boolean {
    if (n.ends.length <= 1) {
      return false
    }
    const cs = n.contributors
    if (!cs) {
      return n.ends.every(e => this.nullable(e) || isNull(e))
    }
    // (an optional contributor merged with a required one passes `null` — core `orNullFor`)
    const mix = cs.some(c => c.optional) && cs.some(c => !c.optional)
    return cs.every(c => (mix && c.optional) || c.ends.every(e => this.nullable(e) || isNull(e)))
  }

  /** A merged slot whose type is `null`: a contributor written `null`, every other one nullable. */
  nullSlot(n: TStructSlot): boolean {
    return this.nullableSlot(n) && n.ends.some(isNull)
  }

  /** Whether `null` is a value of written type `t` (an intersection: every operand nullable). */
  nullableExpr(t: TStructExpr): boolean {
    return this.nullable(t)
  }

  private nullable(t: TStructExpr, seen = new Set<unknown>()): boolean {
    // (a declaration met again on the way — an alias cycle, reported — adds nothing)
    const at = t.k === 'ref' || t.k === 'chain' ? t.decl : t
    if (seen.has(at)) {
      return false
    }
    seen.add(at)
    switch (t.k) {
      case 'nul': {
        return true
      }
      case 'ref': {
        if (t.decl.kind === 'type') {
          return this.nullable(this.declExpr(t.decl), seen)
        }
        const target = t.decl.kind === 'as' ? this.asTarget(t.decl) : undefined
        return target ? this.nullable({ k: 'ref', decl: target, node: target.node }, seen) : false
      }
      case 'and': {
        return t.items.every(i => this.nullable(i, new Set(seen)))
      }
      case 'chain': {
        const n = this.slotAt(t.decl, t.path)
        return !!n && n.ends.length > 0 && n.ends.every(e => this.nullable(e, new Set(seen)))
      }
      default: {
        return false
      }
    }
  }

  /** The shape of a slot's node (see {@link shapeAt}). */
  slotShape(n: TStructSlot): TStructShape {
    const never = this.neverShape(n.ends, n.contributors)
    if (never) {
      return { k: 'never', reason: never }
    }
    if (this.nullSlot(n)) {
      // (`{ a?: X } & { a: null }`: the merge is `null`, see {@link nullSlot})
      return { k: 'scalar' }
    }
    return this.combine(
      n.ends.map(e => this.shape(e)),
      n.ends
    )
  }

  private readonly shapeMemo = new Map<TStructExpr, TStructShape>()

  /** The declarations (a chain: the chain) whose shape is being computed (see {@link shape}). */
  private readonly shapePath = new Set<unknown>()
  private shapeCuts = 0

  shape(t: TStructExpr): TStructShape {
    if (t.k !== 'ref' && t.k !== 'chain') {
      const hit = this.shapeMemo.get(t)
      if (hit) {
        return hit
      }
    }
    // (a chain reads its declaration's field: the chain itself is what may recur)
    const D = t.k === 'ref' ? t.decl : t.k === 'chain' ? t : undefined
    if (D && this.shapePath.has(D)) {
      // (a type inside its own shape — a recursion through a union, `type A = B | X` with
      // `type B = A | Y`: nothing more there, a branch a merge drops; a plain alias cycle is an
      // error core reports — a visited set, not a depth bound)
      this.shapeCuts++
      return { k: 'mixed' }
    }
    const cuts = this.shapeCuts
    if (D) {
      this.shapePath.add(D)
    }
    let r: TStructShape
    try {
      r = this.shape0(t)
    } finally {
      if (D) {
        this.shapePath.delete(D)
      }
    }
    // (a shape cut inside depends on where it was asked from: not kept)
    if (t.k !== 'ref' && t.k !== 'chain' && this.shapeCuts === cuts) {
      this.shapeMemo.set(t, r)
    }
    return r
  }

  private shape0(t: TStructExpr): TStructShape {
    switch (t.k) {
      case 'scalar': {
        return isPrimitive(t.node) && (t.node as SemanticPrimitiveNode).key === 'null'
          ? { k: 'mixed' }
          : { k: 'scalar' }
      }
      case 'tup': {
        const items = t.items.map(i => this.shape(i))
        if (!items.every(s => s.k === 'scalar' || s.k === 'never')) {
          return { k: 'mixed' }
        }
        return items.some(s => s.k === 'never')
          ? { k: 'never', reason: 'tuple item' }
          : { k: 'scalar' }
      }
      case 'uni': {
        const ss = t.items.map(i => this.shape(i))
        if (ss.every(s => s.k === 'scalar' || s.k === 'never')) {
          return ss.every(s => s.k === 'never') ? { k: 'never', reason: 'union' } : { k: 'scalar' }
        }
        // (a union holding objects: its other branches — scalars, arrays, `null` — have no props,
        // and drop out of a merge they cannot take part in)
        if (ss.some(s => s.k === 'obj' || s.k === 'uni')) {
          return { k: 'uni', n: ss.length, items: ss }
        }
        return { k: 'mixed' }
      }
      case 'nul': {
        return this.shape(t.of)
      }
      case 'arr': {
        return { k: 'arr' }
      }
      case 'obj': {
        return {
          k: 'obj',
          props: new Map(t.props.map(p => [p.name, { optional: p.optional }])),
        }
      }
      case 'and': {
        // (inline `&` flattened, as the merge's operand list)
        const items: TStructExpr[] = []
        const flat = (x: TStructExpr) => (x.k === 'and' ? x.items.forEach(flat) : items.push(x))
        flat(t)
        return this.combine(
          items.map(i => this.shape(i)),
          items
        )
      }
      case 'chain': {
        const n = this.slotAt(t.decl, t.path)
        return n
          ? this.combine(
              n.ends.map(e => this.shape(e)),
              n.ends
            )
          : { k: 'mixed' }
      }
      case 'ref': {
        const D = t.decl
        if (D.kind === 'type') {
          return this.shape(this.declExpr(D))
        }
        if (D.kind === 'as') {
          const target = this.asTarget(D)
          return target ? this.shape({ k: 'ref', decl: target, node: target.node }) : { k: 'mixed' }
        }
        const ext = this.extendsOf(D)
        const inh: TStructShape =
          ext.length > 0
            ? this.combine(
                ext.map(e => this.shape({ k: 'ref', decl: e, node: e.node })),
                []
              )
            : { k: 'obj', props: new Map() }
        if (inh.k !== 'obj') {
          return { k: 'mixed' }
        }
        const props = new Map(inh.props)
        for (const p of this.ownProps(D)) {
          props.set(p.name, { optional: p.optional })
        }
        return { k: 'obj', props }
      }
      default: {
        return { k: 'mixed' }
      }
    }
  }

  /**
   * The shape of a merge of shapes (`ends`: the written types, for the scalar algebra): objects
   * merge by name (required if required anywhere), arrays item-wise, scalars intersect (core
   * algebra: disjoint scalars are `never`), a single union operand of objects distributes.
   */
  private combine(ss: TStructShape[], ends: TStructExpr[]): TStructShape {
    // (one written type: its shape — a union keeps its branches as written)
    if (ss.length === 1) {
      return ss[0]
    }
    const tuple = ends.length === ss.length ? this.tupleShape(ends) : undefined
    if (tuple) {
      return tuple
    }
    if (ss.some(s => s.k === 'mixed')) {
      // (`null` and operands that are all nullable: `null` — the merge is nullable, its object
      // part has nothing to merge with)
      if (
        ends.length === ss.length &&
        ends.some(isNull) &&
        ends.every(e => isNull(e) || this.nullable(e))
      ) {
        return { k: 'scalar' }
      }
      // (`null` is a scalar, a union operand of scalar / array branches
      // distributes — every branch unmergeable is `never`; else a position no object can be)
      const leaves = ends.length === ss.length ? this.mixedLeaves(ss, ends) : undefined
      const product = leaves && this.productShape(leaves.ss, leaves.ends)
      if (product?.k === 'never' && product.reason === MERGE_TOO_COMPLEX) {
        return product
      }
      return product?.k === 'never' ? { k: 'never', reason: NOTHING_IN_COMMON } : { k: 'mixed' }
    }
    const unis = ss.filter(s => s.k === 'uni')
    // (one union written several times, `V & V`: V — operands that are one def)
    const same = (e: TStructExpr) => (e.k === 'ref' ? this.bareTarget(e.decl) : undefined)
    if (
      unis.length === ss.length &&
      ends.length > 0 &&
      same(ends[0]) &&
      ends.every(e => same(e) === same(ends[0]))
    ) {
      return unis[0]
    }
    if (unis.length > 0) {
      return this.productShape(ss, ends)
    }
    if (ss.every(s => s.k === 'obj')) {
      const props = new Map<string, { optional: boolean }>()
      for (const s of ss as Array<TStructShape & { k: 'obj' }>) {
        for (const [n, o] of s.props) {
          props.set(n, { optional: (props.get(n)?.optional ?? true) && o.optional })
        }
      }
      return { k: 'obj', props }
    }
    if (ss.every(s => s.k === 'arr')) {
      return { k: 'arr' }
    }
    if (ss.every(s => s.k === 'scalar' || s.k === 'never')) {
      if (ss.some(s => s.k === 'never')) {
        return { k: 'never', reason: NOTHING_IN_COMMON }
      }
      return ends.length === ss.length && !this.scalarsMeet(ends)
        ? { k: 'never', reason: NOTHING_IN_COMMON }
        : { k: 'scalar' }
    }
    return { k: 'never', reason: NOTHING_IN_COMMON }
  }

  /**
   * The shape of a merge with union operands — the product of their branches, first
   * operand outermost, the `never` ones dropped: none left is `never`, one is that branch.
   * (A repeated reference counts once, at its last place, as the merge's operands do.)
   */
  private productShape(ss0: TStructShape[], ends0: TStructExpr[]): TStructShape {
    let ss = ss0
    let ends = ends0
    if (ends0.length === ss0.length) {
      // (the operand's def key: an annotated alias as written, else its target)
      const id = (e: TStructExpr, i: number) => {
        if (e.k !== 'ref') {
          return `#${i}`
        }
        const P = this.bareTarget(e.decl)
        return this.aliasStep(P) && (P.node.annotations?.length ?? 0) > 0
          ? `a:${P.id}`
          : this.plainTarget(e.decl).id
      }
      const ids = ends0.map(id)
      const keep = ids.map((x, i) => !ids.slice(i + 1).includes(x))
      ss = ss0.filter((_, i) => keep[i])
      ends = ends0.filter((_, i) => keep[i])
    }
    const choices = ss.map((s, i) =>
      s.k === 'uni' ? this.shapeLeaves(s, ends[i]) : [{ s, e: ends[i] as TStructExpr | undefined }]
    )
    const total = choices.reduce((n, c) => n * c.length, 1)
    if (total > PRODUCT_CAP) {
      // (the error "merge too complex" where this shape is — `neverWarnings`
      // reports it as such, never as a merge with fewer branches)
      return { k: 'never', reason: MERGE_TOO_COMPLEX }
    }
    const out: TStructShape[] = []
    for (let k = 0; k < total; k++) {
      const pick: Array<{ s: TStructShape; e?: TStructExpr }> = []
      let r = k
      for (let j = choices.length - 1; j >= 0; j--) {
        pick[j] = choices[j][r % choices[j].length]
        r = Math.floor(r / choices[j].length)
      }
      const es = pick.map(p => p.e)
      const c = this.combine(
        pick.map(p => p.s),
        es.every(Boolean) ? (es as TStructExpr[]) : []
      )
      if (c.k !== 'never' && c.k !== 'mixed') {
        out.push(c)
      }
    }
    if (out.length === 0) {
      return { k: 'never', reason: NOTHING_IN_COMMON }
    }
    return out.length === 1 ? out[0] : { k: 'uni', n: out.length, items: out }
  }

  /**
   * Merge operands `ss` (written `ends`) with each `mixed` one modelled: `null` as a scalar, a
   * written union of scalar / array branches (`number | number[]`) as a union shape of its
   * branches, which a product distributes; undefined when a `mixed` one is
   * neither (a tuple).
   */
  private mixedLeaves(
    ss: TStructShape[],
    ends: TStructExpr[]
  ): { ss: TStructShape[]; ends: TStructExpr[] } | undefined {
    const out: TStructShape[] = []
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i].k === 'mixed' ? this.branchShape(ends[i]) : ss[i]
      if (!s) {
        return undefined
      }
      out.push(s)
    }
    return { ss: out, ends }
  }

  /**
   * Written type `e` with every branch modelled: `null` a scalar, a union (`number | number[]`)
   * a union shape of its branches'; undefined when it is neither.
   */
  private branchShape(e: TStructExpr, seen = new Set<TStructExpr>()): TStructShape | undefined {
    const u = this.pastAliases(e)
    if (isNull(u)) {
      return { k: 'scalar' }
    }
    // (a union inside itself — an alias cycle, reported — is not a branch of its own)
    if (u.k !== 'uni' || seen.has(u)) {
      return undefined
    }
    seen.add(u)
    const items = u.items.map(i => this.branchShape(i, seen) ?? this.shape(i))
    seen.delete(u)
    return { k: 'uni', n: items.length, items }
  }

  /** Written type `e` past `| null` and type aliases (an alias met again, a cycle: there). */
  private pastAliases(e: TStructExpr): TStructExpr {
    const seen = new Set<TStructDecl>()
    let u = e
    for (;;) {
      if (u.k === 'nul') {
        u = u.of
      } else if (u.k === 'ref' && u.decl.kind === 'type' && !seen.has(u.decl)) {
        seen.add(u.decl)
        u = this.declExpr(u.decl)
      } else {
        return u
      }
    }
  }

  /** A union shape's branches as merge members (see {@link leaves}); `e`: the written union, if known. */
  private shapeLeaves(
    s: TStructShape & { k: 'uni' },
    e: TStructExpr | undefined
  ): Array<{ s: TStructShape; e?: TStructExpr }> {
    const u = e && this.pastAliases(e)
    const items = u?.k === 'uni' && u.items.length === s.items.length ? u.items : undefined
    const out: Array<{ s: TStructShape; e?: TStructExpr }> = []
    s.items.forEach((x, i) => {
      if (x.k === 'mixed' || x.k === 'never') {
        return
      }
      if (x.k === 'uni') {
        out.push(...this.shapeLeaves(x, items?.[i]))
      } else {
        out.push({ s: x, e: items?.[i] })
      }
    })
    return out
  }

  /** The scalar values written types `ends` may share (core algebra, pairwise per atom). */
  private scalarsMeet(ends: TStructExpr[]): boolean {
    type Atom = { node: SemanticNode; doc: AtscriptDoc } | { tup: Atom[][] }
    const atomsOf = (e: TStructExpr, seen = new Set<TStructExpr>()): Atom[] | undefined => {
      if (seen.has(e)) {
        return undefined
      }
      seen.add(e)
      switch (e.k) {
        case 'scalar': {
          return [{ node: e.node, doc: e.doc }]
        }
        case 'nul': {
          return atomsOf(e.of, seen)
        }
        case 'uni': {
          const xs = e.items.map(i => atomsOf(i, seen))
          return xs.every(Boolean) ? (xs.flat() as Atom[]) : undefined
        }
        case 'tup': {
          const xs = e.items.map(i => atomsOf(i, seen))
          return xs.every(Boolean) ? [{ tup: xs as Atom[][] }] : undefined
        }
        case 'ref': {
          return e.decl.kind === 'type' ? atomsOf(this.declExpr(e.decl), seen) : undefined
        }
        case 'chain': {
          const n = this.slotAt(e.decl, e.path)
          if (!n) {
            return undefined
          }
          let acc: Atom[] | undefined
          for (const x of n.ends) {
            const a = atomsOf(x, seen)
            if (!a) {
              return undefined
            }
            acc = acc ? meet(acc, a) : a
          }
          return acc
        }
        case 'and': {
          let acc: Atom[] | undefined
          for (const x of e.items) {
            const a = atomsOf(x, seen)
            if (!a) {
              return undefined
            }
            acc = acc ? meet(acc, a) : a
          }
          return acc
        }
        default: {
          return undefined
        }
      }
    }
    const meetAtom = (a: Atom, b: Atom): Atom | undefined => {
      if ('tup' in a || 'tup' in b) {
        if (!('tup' in a) || !('tup' in b) || a.tup.length !== b.tup.length) {
          return undefined
        }
        return { tup: a.tup.map((x, i) => meet(x, b.tup[i])) }
      }
      const may = (
        a.doc as unknown as { mayIntersect: (x: SemanticNode, y: SemanticNode) => boolean }
      ).mayIntersect(a.node, b.node)
      if (!may) {
        return undefined
      }
      // (the narrower one: a literal, an extension)
      return isConst(b.node) ? b : a
    }
    const meet = (A: Atom[], B: Atom[]): Atom[] => {
      const out: Atom[] = []
      for (const a of A) {
        for (const b of B) {
          const m = meetAtom(a, b)
          if (m) {
            out.push(m)
          }
        }
      }
      return out
    }
    let acc: Atom[] | undefined
    for (const e of ends) {
      const a = atomsOf(e)
      if (!a) {
        return true
      }
      acc = acc ? meet(acc, a) : a
    }
    return !acc || acc.length > 0
  }

  /**
   * The unmergeable shapes at a merged position: a written union of
   * objects, an array of unions / of arrays, a tuple of objects.
   */
  private neverShape(written: TStructExpr[], cs?: TStructSlot[]): string | undefined {
    const ends = distinctEnds(written)
    if (ends.length < 2) {
      return undefined
    }
    // (one type written by every contributor, `{ p: V } & { p: V }`: V)
    const one = (e: TStructExpr) => (e.k === 'ref' ? this.bareTarget(e.decl) : undefined)
    if (one(ends[0]) && ends.every(e => one(e) === one(ends[0]))) {
      return undefined
    }
    // (one written type reached by every contributor with one def — an inherited field a block
    // shelled in the child, `S & T` with `T extends S`: that type; a block writes metadata
    // only; a shell def counts as the def it shells)
    if (
      cs &&
      cs.every(c => (c.def && structKey(c.def)) === (cs[0].def && structKey(cs[0].def))) &&
      ends.every(e => e.node === ends[0].node)
    ) {
      return undefined
    }
    const unmergeable = (e: TStructExpr): string | undefined => {
      const t = this.stripExpr(e)
      if (t.k === 'uni' && this.shape(t).k === 'uni') {
        return 'unions of objects'
      }
      if (t.k === 'arr') {
        const el = this.shape(t.of)
        if (el.k === 'uni') {
          return 'arrays of unions of objects'
        }
        if (el.k === 'arr') {
          return 'arrays of arrays of objects'
        }
      }
      if (t.k === 'tup' && t.items.some(i => this.shape(i).k !== 'scalar')) {
        return 'tuples of objects'
      }
      return undefined
    }
    // (only against another contributor holding objects too)
    for (let i = 0; i < ends.length; i++) {
      const why = unmergeable(ends[i])
      if (why && ends.some((x, j) => j !== i && this.holdsObject(x))) {
        return why
      }
    }
    return undefined
  }

  /**
   * Written type `e` past `| null`, aliases, `as` copies and chain refs (to one written type); a
   * declaration met again — an alias cycle, reported — stops there.
   */
  private stripExpr(e: TStructExpr): TStructExpr {
    const seen = new Set<TStructDecl>()
    let t = e
    for (;;) {
      if (t.k === 'nul') {
        t = t.of
        continue
      }
      if ((t.k !== 'ref' && t.k !== 'chain') || seen.has(t.decl)) {
        return t
      }
      seen.add(t.decl)
      if (t.k === 'ref' && t.decl.kind === 'type') {
        t = this.declExpr(t.decl)
      } else if (t.k === 'ref' && t.decl.kind === 'as') {
        const target = this.asTarget(t.decl)
        if (!target) {
          return t
        }
        t = { k: 'ref', decl: target, node: target.node }
      } else if (t.k === 'chain') {
        const n = this.slotAt(t.decl, t.path)
        if (n?.ends.length !== 1) {
          return t
        }
        t = n.ends[0]
      } else {
        return t
      }
    }
  }

  /** Whether written type `e` reaches an object (core `containsObject`); each type looked at once. */
  private holdsObject(e: TStructExpr, seen = new Set<unknown>()): boolean {
    const t = this.stripExpr(e)
    const at = t.k === 'ref' || t.k === 'chain' ? t.decl : t
    if (seen.has(at)) {
      return false
    }
    seen.add(at)
    switch (t.k) {
      case 'obj': {
        return true
      }
      case 'arr': {
        return this.holdsObject(t.of, seen)
      }
      case 'uni':
      case 'tup':
      case 'and': {
        return t.items.some(i => this.holdsObject(i, seen))
      }
      case 'ref': {
        return t.decl.kind === 'interface'
      }
      default: {
        return this.shape(t).k === 'obj'
      }
    }
  }

  /**
   * The shape of a merge of arrays and tuples (`ends`, an array and a tuple at least) —
   * a tuple of the items' intersections, an array's element intersecting each item, as the core
   * algebra builds it: `never` when the tuples' lengths differ, two operands hold objects (core
   * `tuples of objects`) or an item's intersection is `never`; undefined for other operands.
   */
  private tupleShape(ends: TStructExpr[]): TStructShape | undefined {
    const xs = ends.map(e => this.stripExpr(e))
    if (
      !xs.some(x => x.k === 'tup') ||
      !xs.some(x => x.k === 'arr') ||
      !xs.every(x => x.k === 'tup' || x.k === 'arr')
    ) {
      return undefined
    }
    const lengths = new Set(xs.flatMap(x => (x.k === 'tup' ? [x.items.length] : [])))
    if (lengths.size > 1) {
      return { k: 'never', reason: NOTHING_IN_COMMON }
    }
    if (xs.filter(x => this.holdsObject(x)).length > 1) {
      return { k: 'never', reason: 'tuples of objects' }
    }
    // (a recursive tuple met again inside its own merge: its items are being looked at)
    const key = this.exprsKey(xs)
    if (this.tupleBusy.has(key)) {
      return { k: 'scalar' }
    }
    this.tupleBusy.add(key)
    try {
      return this.tupleItems(xs, [...lengths][0])
    } finally {
      this.tupleBusy.delete(key)
    }
  }

  private readonly tupleBusy = new Set<string>()

  /** {@link tupleShape} of arrays / tuples `xs` (tuples of `length` items). */
  private tupleItems(xs: TStructExpr[], length: number): TStructShape {
    for (let i = 0; i < length; i++) {
      const items = xs.map(x => (x.k === 'tup' ? x.items[i] : (x as { of: TStructExpr }).of))
      const c = this.combine(
        items.map(t => this.shape(t)),
        items
      )
      if (c.k === 'never') {
        return { k: 'never', reason: NOTHING_IN_COMMON }
      }
    }
    // (a tuple has no structure def: written by the core algebra, as a scalar is)
    return { k: 'scalar' }
  }

  // ------------------------------------------------------------ compile errors and ranks

  private rootsMemo?: TMergeRoot[]

  /**
   * The intersections written in the build (places, named merges, several `extends` parents): the
   * merge each gives, its module, and where it is written. `own`: a declaration's own class — a
   * named merge, an `extends` child —, not a hidden class.
   */
  mergeRoots(): TMergeRoot[] {
    if (this.rootsMemo) {
      return this.rootsMemo
    }
    const roots: TMergeRoot[] = []
    const visitT = (U: TStructDecl, q: string[], t: TStructExpr) => {
      if (t.k === 'and') {
        const m = this.andDef(U.id, q, t)
        if (m) {
          roots.push({
            mod: U.doc,
            def: m,
            own: U.kind === 'type' && q.length === 0,
            decl: U,
            path: q,
          })
        }
        t.items.forEach((x, i) => visitT(U, [...q, `&${i}`], x))
      } else if (t.k === 'obj') {
        t.props.forEach(p => visitT(U, [...q, p.name], p.type))
      } else if (t.k === 'arr' || t.k === 'nul') {
        visitT(U, q, t.of)
      } else if (t.k === 'uni' || t.k === 'tup') {
        t.items.forEach((x, i) => visitT(U, [...q, `|${i}`], x))
      }
    }
    for (const d of this.decls) {
      if (d.kind === 'interface') {
        this.ownProps(d).forEach(p => visitT(d, [p.name], p.type))
        const ext = this.extendsOf(d)
        if (ext.length > 1) {
          const m = this.mergeOf(
            ext.map(e => this.refDef(e)),
            d.doc
          )
          if (m) {
            roots.push({ mod: d.doc, def: m, own: true, decl: d, path: [] })
          }
        }
      } else if (d.kind === 'type') {
        visitT(d, [], this.declExpr(d))
      }
    }
    this.rootsMemo = roots
    return roots
  }

  private graphMemo?: { uniRec: TStructDef[]; perModule: Map<AtscriptDoc, number> }

  /**
   * The merges the build writes out, per module: every hidden merge class reachable
   * from an intersection written in the module (places, named merges, several `extends`
   * parents) through its multi-contributor fields and union branches. `uniRec`: a merge with a
   * union operand ON a recursion cycle of merges; `perModule`: hidden merge
   * classes per module (> {@link MERGE_CAP}: "merge too complex").
   */
  mergeGraph(): { uniRec: TStructDef[]; perModule: Map<AtscriptDoc, number> } {
    if (this.graphMemo) {
      return this.graphMemo
    }
    this.graphMemo = this.mergeGraph0()
    return this.graphMemo
  }

  private mergeGraph0(): { uniRec: TStructDef[]; perModule: Map<AtscriptDoc, number> } {
    const roots = this.mergeRoots()
    const edgeMemo = new Map<string, TStructDef[]>()
    const edges = (t: TStructDef): TStructDef[] => {
      let out = edgeMemo.get(t.key)
      if (out) {
        return out
      }
      out = []
      if (t.kind === 'umerge') {
        for (let i = 0; i < (t.size ?? 0); i++) {
          const b = t.branch?.(i)
          if (b) {
            out.push(b)
          }
        }
      } else {
        // (only the fields the merge writes out itself — several contributors; a
        // single-contributor field is a reference to existing structure. A shell is the node it
        // shells: a metadata-only block never makes a field merged here — MODEL §14 N3)
        for (const k of t.names?.() ?? []) {
          const r = t.slot(k)
          if (r?.def && r.loc.startsWith('m:') && new Set(r.contributors?.map(baseLoc)).size > 1) {
            out.push(r.def)
          }
        }
      }
      out = out.filter(isMerge)
      edgeMemo.set(t.key, out)
      return out
    }
    // the merges each module writes out, breadth first; past MERGE_CAP a module is "merge too complex"
    // and is not explored further (the build fails anyway; bounded time on exponential merges)
    const byKey = new Map<string, TStructDef>()
    const perModuleSets = new Map<AtscriptDoc, Set<string>>()
    // (the bound counts hidden classes: a declaration's own class is not one, unless a place or
    // another merge of the module also reaches its merge)
    const hiddenSets = new Map<AtscriptDoc, Set<string>>()
    for (const { mod, def, own } of roots) {
      if (!isMerge(def)) {
        continue
      }
      let seen = perModuleSets.get(mod)
      if (!seen) {
        perModuleSets.set(mod, (seen = new Set()))
      }
      let hidden = hiddenSets.get(mod)
      if (!hidden) {
        hiddenSets.set(mod, (hidden = new Set()))
      }
      const queue: Array<[TStructDef, boolean]> = [[def, !own]]
      while (queue.length > 0 && hidden.size <= MERGE_CAP) {
        const [t, counts] = queue.shift()!
        if (counts) {
          hidden.add(t.key)
        }
        if (seen.has(t.key)) {
          continue
        }
        seen.add(t.key)
        byKey.set(t.key, t)
        queue.push(...edges(t).map((x): [TStructDef, boolean] => [x, true]))
      }
    }
    const comp = components(byKey.keys(), k =>
      edges(byKey.get(k)!)
        .filter(w => byKey.has(w.key))
        .map(w => w.key)
    )
    const cyclic = (k: string) =>
      (comp.get(k)?.length ?? 0) > 1 || edges(byKey.get(k)!).some(w => w.key === k)
    // (a union operand of a merge ON the recursion cycle itself)
    const uniRec = [...byKey.values()].filter(t => t.kind === 'umerge' && cyclic(t.key))
    return {
      uniRec,
      perModule: new Map([...hiddenSets].map(([m, s]) => [m, s.size])),
    }
  }

  /**
   * The db entities (`@db.table`, `@db.view`: the db layer and the `.d.ts`
   * `__flat` flatten them) whose structure reaches a web of mutually recursive merges — a
   * recursion cycle through two or more distinct hidden merge classes. A node is the type the
   * readers' cut keys it by (a shell is the def it shells); its successors are its fields', array
   * elements' and union branches' types. A self-recursive merge alone is no web.
   */
  flatWebs(): TStructDecl[] {
    return (this.flatWebsMemo ??= this.findFlatWebs())
  }

  private flatWebsMemo?: TStructDecl[]

  private findFlatWebs(): TStructDecl[] {
    const roots = this.decls.filter(d => d.kind === 'interface' && isDbEntityNode(d.node))
    if (roots.length === 0) {
      return []
    }
    const byKey = new Map<string, TStructDef>()
    const cutDef = (t: TStructDef): TStructDef => {
      const x = unshell(t)
      byKey.set(x.key, x)
      return x
    }
    const succMemo = new Map<string, string[]>()
    const succ = (k: string): string[] => {
      let out = succMemo.get(k)
      if (!out) {
        const t = byKey.get(k)!
        const next = new Set<string>()
        for (const name of t.names?.() ?? []) {
          const r = t.slot(name)?.def
          if (r) {
            next.add(cutDef(r).key)
          }
        }
        for (let i = 0; i < (t.size ?? 0); i++) {
          const b = t.branch?.(i)
          if (b) {
            next.add(cutDef(b).key)
          }
        }
        succMemo.set(k, (out = [...next]))
      }
      return out
    }
    const rootKeys = new Map<TStructDecl, string>()
    for (const d of roots) {
      const t = this.refDef(d)
      if (t) {
        rootKeys.set(d, cutDef(t).key)
      }
    }
    const comp = components(rootKeys.values(), succ)
    const webs = new Map<string[], boolean>()
    const isWeb = (c: string[]): boolean => {
      let hit = webs.get(c)
      if (hit === undefined) {
        const merges = c.filter(k => isMerge(byKey.get(k)!))
        hit = merges.length > 1 && webCycle(c, merges, succ)
        webs.set(c, hit)
      }
      return hit
    }
    return [...rootKeys].flatMap(([d, k]) => {
      const seen = new Set<string>([k])
      const queue = [k]
      while (queue.length > 0) {
        const v = queue.shift()!
        if (isWeb(comp.get(v)!)) {
          return [d]
        }
        for (const w of succ(v)) {
          if (!seen.has(w)) {
            seen.add(w)
            queue.push(w)
          }
        }
      }
      return []
    })
  }

  /** The structure compile errors of the build. */
  /**
   * The named merges that are an operand of themselves, directly or through a cycle
   * of named merges (operands: intersection members, inline `&` / `| null` looked through, plain
   * aliases resolved, a union operand's branches — each is an operand of a branch merge).
   */
  selfOperandMerges(): TStructDecl[] {
    return (this.selfOperandMemo ??= this.findSelfOperandMerges())
  }

  private selfOperandMemo?: TStructDecl[]

  private findSelfOperandMerges(): TStructDecl[] {
    const edges = new Map<TStructDecl, TStructDecl[]>()
    for (const d of this.decls) {
      const t = this.declExpr(d)
      if (t.k !== 'and') {
        continue
      }
      const out: TStructDecl[] = []
      const visit = (x: TStructExpr) => {
        if (x.k === 'nul') {
          visit(x.of)
        } else if (x.k === 'and' || x.k === 'uni') {
          x.items.forEach(visit)
        } else if (x.k === 'ref') {
          out.push(this.plainTarget(x.decl))
        }
      }
      t.items.forEach(visit)
      edges.set(d, out)
    }
    const bad: TStructDecl[] = []
    for (const x of edges.keys()) {
      const seen = new Set<TStructDecl>()
      const stack = [...(edges.get(x) ?? [])]
      while (stack.length > 0) {
        const n = stack.pop()!
        if (n === x) {
          bad.push(x)
          break
        }
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(...(edges.get(n) ?? []))
        }
      }
    }
    return bad
  }

  /**
   * The positions of `doc`'s declarations an unmergeable merge makes `never` (the
   * warnings), with why. A declaration reports the positions of its own defs and of the hidden
   * merge classes it reaches through its own nodes (each walked once, from the first path
   * reaching it), not those of the declarations it references (they report theirs). A shell def
   * is the def it shells (a metadata-only block changes no warning). A whole union branch with
   * nothing in common is
   * dropped (`X | never` = X): no warning. Each merge walked once (a visited set); the merges of a
   * module refused as too complex are not (it reports that).
   */
  neverWarnings(doc: AtscriptDoc): TStructNever[] {
    const out: TStructNever[] = []
    const refused = new Set(
      [...this.mergeGraph().perModule]
        .filter(([m, n]) => n > MERGE_CAP || this.tooComplex.has(m))
        .map(([m]) => m)
    )
    for (const d of this.decls) {
      if (d.doc !== doc || d.kind === 'as') {
        continue
      }
      const found = new Map<string, TStructNever>()
      const report = (path: string[], reason: string, slot?: TStructSlot, branch = false) => {
        const k = `${pk(path)}\0${reason}`
        if (!found.has(k)) {
          found.set(k, { decl: d, path, reason, slot, branch })
        }
      }
      const e = d.kind === 'type' ? this.declExpr(d) : undefined
      const top = e?.k === 'and' || this.extendsOf(d).length > 1 ? this.shapeAt(d, []) : undefined
      if (top?.k === 'never') {
        report([], top.reason)
      }
      const seen = new Set<string>()
      const queue: Array<{ t: TStructDef; path: string[]; branch: boolean }> = []
      const push = (t0: TStructDef | undefined, path: string[], branch: boolean) => {
        const t = t0 && unshell(t0)
        // (a metadata-only block reaches no other position — a merge is walked once per its
        // operands as written, shells and nested merges looked through, see `mergeLeaves`)
        const k = t && mergeLeaves(t.key)
        // (a merge of a module refused as too complex: that module reports it; its
        // merges are not walked — bounded time)
        if (
          !t ||
          !k ||
          seen.has(k) ||
          (!isMerge(t) && t.unit !== d.id) ||
          (t.module && refused.has(t.module))
        ) {
          return
        }
        seen.add(k)
        queue.push({ t, path, branch })
      }
      push(this.refDef(d), [], false)
      // (the array iterator also visits the entries pushed meanwhile)
      for (const { t, path, branch } of queue) {
        for (const k of t.names?.() ?? []) {
          const s = t.slot(k)
          if (!s) {
            continue
          }
          const at = k === '[]' ? path : [...path, k]
          // (its own node, or a field a merge writes out; a reference to another
          // declaration's node is that declaration's: it reports its own)
          // (a shell is the node it shells)
          const n = baseLoc(s)
          const own = n.startsWith(`${d.id}:`) || n.startsWith('m:')
          // (a merge happens here: several contributors, or a type written here merging — a
          // reference / chain is the node it names, which reports itself)
          const here =
            own && (s.ends.length > 1 || ['and', 'tup', 'arr'].includes(s.ends[0]?.k ?? ''))
          const shape = here ? this.slotShape(s) : undefined
          const why =
            shape?.k === 'never'
              ? shape.reason
              : here && !s.def
                ? this.scalarNever(d, s)
                : undefined
          if (why) {
            report(at, why, s, branch)
          } else if (own) {
            push(s.def, at, branch)
          }
        }
        for (let b = 0; b < (t.size ?? 0); b++) {
          push(t.branch?.(b), path, true)
        }
      }
      out.push(...found.values())
    }
    return out
  }

  /**
   * A slot without a def (scalars, tuples, arrays of them): `never` in the core algebra's merge of
   * its written types, as generated code merges them (`js-next.ts`).
   */
  private scalarNever(d: TStructDecl, s: TStructSlot): string | undefined {
    const cs = s.contributors ?? []
    if (cs.length > 1 && cs.every(c => c.ends.length === 1 && c.ends[0].node)) {
      return d.doc.neverReasonIn(
        d.doc.mergeFieldTypes(cs.map(c => ({ def: c.ends[0].node!, optional: c.optional })))
      )
    }
    const nodes = s.ends.map(x => x.node).filter((n): n is SemanticNode => !!n)
    return d.doc.neverReasonIn(nodes.length > 1 ? new SemanticGroup(nodes, '&') : nodes[0])
  }

  structureErrors(): TStructError[] {
    const out: TStructError[] = []
    for (const d of this.selfOperandMerges()) {
      out.push({ doc: d.doc, node: d.node, message: SELF_OPERAND })
    }
    const g = this.mergeGraph()
    const reported = new Set<AtscriptDoc>()
    for (const t of g.uniRec) {
      const doc = t.module ?? this.docs[0]
      if (!reported.has(doc)) {
        reported.add(doc)
        out.push({ doc, message: UNION_IN_RECURSIVE_MERGE })
      }
    }
    for (const [doc, n] of g.perModule) {
      if (n > MERGE_CAP || this.tooComplex.has(doc)) {
        out.push({ doc, message: MERGE_TOO_COMPLEX })
      }
    }
    for (const d of this.flatWebs()) {
      out.push({ doc: d.doc, node: d.node, message: FLATTEN_WEB })
    }
    out.push(...this.extendsUnions())
    // (an annotate entry the model refuses is a diagnostic, never a silent drop)
    out.push(...this.errors)
    return out
  }

  private extendsMemo?: TStructError[]

  /**
   * An interface extending a union of two or more branches that are not `null` (a union, or a
   * merge distributing into one) is a compile error: it has no props to inherit (MODEL §15
   * EXT-U). `extends X | null` is `extends X`.
   */
  private extendsUnions(): TStructError[] {
    if (!this.extendsMemo) {
      this.extendsMemo = []
      for (const d of this.decls) {
        for (const t of isInterface(d.node) ? d.node.extendsTokens : []) {
          const p = this.declOf(d.doc, t.text)
          if (p && this.unionOfTwo(p)) {
            this.extendsMemo.push({
              doc: d.doc,
              node: d.node,
              token: t,
              message: `An interface can't extend a union; use a merge (\`${t.text} & { … }\`)`,
            })
          }
        }
      }
    }
    return this.extendsMemo
  }

  /** Whether declaration `p` is a union of two or more branches that are not `null`. */
  private unionOfTwo(p: TStructDecl): boolean {
    const def = this.refDef(p)
    if (def?.uni) {
      let n = 0
      for (let i = 0; i < (def.size ?? 0); i++) {
        n += def.bsrc?.(i).some(x => !isNull(this.pastAliases(x))) ? 1 : 0
      }
      return n >= 2
    }
    // (a union holding no object: its branches as written)
    const u = this.pastAliases({ k: 'ref', decl: p, node: p.node })
    return u.k === 'uni' && u.items.filter(x => !isNull(this.pastAliases(x))).length >= 2
  }

  private rankMemo?: Map<AtscriptDoc, TStructRank>

  /**
   * Per module (import depth, module id). Depth is 0 for a module importing no `.as`
   * module of the build, else 1 + the max depth of its imports, on the SCC-condensed import graph
   * (a cycle shares one depth); the module id is core `moduleId()`.
   */
  ranks(): Map<AtscriptDoc, TStructRank> {
    if (this.rankMemo) {
      return this.rankMemo
    }
    const docs = this.docs
    const inModel = new Set(docs)
    const deps = (d: AtscriptDoc) => [...d.dependencies].filter(x => inModel.has(x))
    const scc = components(docs, deps)
    const memo = new Map<AtscriptDoc[], number>()
    const depthOf = (c: AtscriptDoc[]): number => {
      const hit = memo.get(c)
      if (hit !== undefined) {
        return hit
      }
      memo.set(c, 0)
      let depth = 0
      for (const m of c) {
        for (const w of deps(m)) {
          const wc = scc.get(w)!
          if (wc !== c) {
            depth = Math.max(depth, 1 + depthOf(wc))
          }
        }
      }
      memo.set(c, depth)
      return depth
    }
    this.rankMemo = new Map(docs.map(d => [d, { depth: depthOf(scc.get(d)!), id: moduleId(d) }]))
    return this.rankMemo
  }

  /** {@link layersAt}, in block order (`as` entries first). */
  orderedLayersAt(d: TStructDecl, steps: string[]): Layer[] {
    return [...this.layersAt(d, steps)].sort((a, b) => blockOrder(a.block, b.block))
  }

  private orderedMemo?: TStructBlock[]

  /** The blocks in static order: (import depth, module id, source order); `as` entries first. */
  orderedBlocks(): TStructBlock[] {
    return (this.orderedMemo ??= [...this.blocks].sort(blockOrder))
  }

  private blocksOnMemo?: Map<SemanticNode, TStructBlock[]>

  /** The {@link orderedBlocks} whose target is declaration node `node`. */
  blocksOn(node: SemanticNode): TStructBlock[] {
    if (!this.blocksOnMemo) {
      this.blocksOnMemo = new Map()
      for (const b of this.orderedBlocks()) {
        const list = this.blocksOnMemo.get(b.target.node)
        if (list) {
          list.push(b)
        } else {
          this.blocksOnMemo.set(b.target.node, [b])
        }
      }
    }
    return this.blocksOnMemo.get(node) ?? []
  }
}
