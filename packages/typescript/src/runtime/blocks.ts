import { isAnnotatedType, validatorMethod, type TAtscriptAnnotatedType } from './annotated-type'
import { metadataReplaced, PropsMap, touched } from './compiled-check/tracking'
/**
 * The runtime helpers of the generated structure: node lookup (`$f`),
 * annotated aliases and `as` copies (`$alias`), shells (`$sh`), blocks with static ranks
 * (`$blk`) and the import-cycle queue (`$q` / `$end`). Merges are not computed here: the
 * generated code prints their final structure (hidden classes, `.over` layers).
 */
import { cutAs } from './cut'
import { isAppendKey, LayerMap, moveIntrinsic, ownEntries, ownValue } from './layers'

type TNode = TAtscriptAnnotatedType
type TDef = Record<string, any>

/**
 * Thrown when a statement reads what is not built yet (a class of an import cycle's module still
 * evaluating, a CommonJS cycle's `undefined` import, a def without its props): `$q` queues it.
 */
export const NOT_READY: Error = new Error('atscript: type not built yet')

/**
 * `x` as an annotated type whose def can be read, else `NOT_READY`: a class of an import cycle's
 * module not evaluated yet (CommonJS: `undefined`), or an alias class (declared with
 * `type = null`) before its `$alias` ran.
 */
export function readyNode(x: unknown): TNode {
  if (!isAnnotatedType(x) || (x as TNode).type === null || (x as TNode).type === undefined) {
    throw NOT_READY
  }
  return x
}

/** `x` as a built class (its builder ran: its def has a kind), else `NOT_READY`. */
function builtNode(x: unknown): TNode {
  const n = readyNode(x)
  if ((n.type as TDef).kind === undefined) {
    throw NOT_READY
  }
  return n
}

/** The child of `n` at step `s`: a prop, `[]` (array element) or `|i` (union / tuple item i). */
function child(n: TNode, s: string): TNode | undefined {
  const t = n.type as TDef
  if (!t?.kind) {
    return undefined
  }
  if (s === '[]') {
    return t.of
  }
  if (s[0] === '|') {
    return t.items?.[Number(s.slice(1))]
  }
  // (a prop pattern `[*]` / `[/re/f]`: named `*` / `/re/f`, as the structure model names it)
  return t.props?.get(s) ?? t.propsPatterns?.find(p => patternStep(p.pattern) === s)?.def
}

/** The step naming prop pattern `re` (`*` is `/./`). */
function patternStep(re: RegExp): string {
  return re.source === '.' && re.flags === '' ? '*' : `/${re.source}/${re.flags}`
}

/** A chain's `ref.field`: its props (`a.b`), without the union steps a nullable one takes. */
export function fieldOf(chain: string[]): string {
  return chain.filter(s => s[0] !== '|').join('.')
}

/**
 * The node at `path` below `root` (see {@link child}); `NOT_READY` while it is not built, or
 * while a pending shell (an import cycle's, see {@link $ps}) would replace it.
 */
export function $f(root: unknown, ...path: string[]): TNode {
  return nodeAt(root, path, PLAIN)
}

/** {@link $f} for a reader of the node's def (`.ref(T, chain)`, `$alias`): its final def. */
export function $ft(root: unknown, ...path: string[]): TNode {
  return nodeAt(root, path, TYPED)
}

/** {@link $f} for a shell that clones the node's def: once every shell put into it (a guard). */
export function $fc(root: unknown, ...path: string[]): TNode {
  return nodeAt(root, path, CLONED)
}

/** How a read uses the node (see {@link changedBy}). */
const PLAIN = 0
const TYPED = 1
const CLONED = 2

function nodeAt(root: unknown, path: string[], typed: number): TNode {
  let n = readyNode(root)
  const shells = pendingShells.get(n)
  if (shells && changedBy(shells, path, typed)) {
    throw NOT_READY
  }
  for (const s of path) {
    const c = child(n, s)
    if (!c) {
      throw NOT_READY
    }
    n = c
  }
  // (a node a later statement fills — a chain ref's / alias reference's placeholder `$()`, no
  // kind nor designType yet: its def is not read before)
  const t = n.type as TDef
  if (typed !== PLAIN && t.kind === '' && t.designType === undefined) {
    throw NOT_READY
  }
  return n
}

/**
 * Class `P` is `T` with annotations of its own (an annotated alias, an `annotate T as P` copy;
 * `chain`: `type P = T.a.b`, a chain ref): T's def (at `chain`), and metadata layered over it
 * (P's own entries kept; a chain ref is a reference layer).
 */
export function $alias(P: TNode, T: unknown, chain?: string[]): TNode {
  const root = readyNode(T)
  const target = readyNode($ft(root, ...(chain ?? [])))
  const node = P as TNode & { validator?: unknown }
  touched(node)
  node.type = target.type
  const own = node.metadata
  node.metadata = new LayerMap(
    [target],
    !!chain,
    ownEntries(node.metadata as any)
  ) as unknown as TNode['metadata']
  moveIntrinsic(own, node.metadata)
  metadataReplaced()
  // (blocks may have written the node before its def was filled — an import cycle's placeholder
  // `$()`: their ranks stay with the entries)
  const recs = records.get(own)
  if (recs) {
    records.set(node.metadata, recs)
  }
  node.ref = { type: () => root, field: chain ? fieldOf(chain) : '' }
  node.id ??= target.id
  node.validator ??= validatorMethod
  return node
}

// ── Shells ─────────────────────────────────────────────────────────────────────────────────

/** Shell nodes → the def they were put in (a shell is its position's: the exact path). */
const shellIn = new WeakMap<object, object>()
/**
 * Shell defs → the node they were made for: a shell node over a node with a shell def starts
 * with that def, and gets its own on its first step of kind 2 (the exact path).
 */
const shellDefOf = new WeakMap<object, object>()

/**
 * A shell node over `base`: metadata layered over base; its def IS base's def (a reference, read
 * when used: a def base gets later — a clone a shell of another class puts in — is the shell's
 * too) until a step below it gives the shell a def of its own (kind 2: `type` is assigned).
 */
function shellNode(base: TNode): TNode {
  // (the fields of `createAnnotatedTypeNode`, in its order; `type`, `ref` and `id` are the
  // shared accessors below, the state is a non-enumerable field: one hidden class for every
  // shell node. Accessors made per shell (closures) gave each shell a class of its own, and
  // every validator read of `type` a call: +35–45 % on a type with one path override.)
  const node = {
    __is_atscript_annotated_type: true,
    metadata: new LayerMap([base]) as unknown as TNode['metadata'],
  } as TShell
  Object.defineProperty(node, SHELL, {
    value: { b: base, t: undefined, id: undefined, ref: undefined },
  })
  Object.defineProperty(node, 'type', SHELL_TYPE)
  node.validator = validatorMethod
  Object.defineProperty(node, 'ref', SHELL_REF)
  Object.defineProperty(node, 'id', SHELL_ID)
  node.optional = base.optional
  return node
}

/** A shell node's own state: its base, and the def / ref / id it was given (`undefined`: base's). */
const SHELL = Symbol('shell')
type TShell = TNode & {
  validator?: unknown
  [SHELL]: {
    b: TNode
    t: TNode['type'] | undefined
    // (id and ref, like the def, are base's when read: an alias reference's node gets them when
    // its `$alias` statement runs, which may be after the shell is made)
    ref: { v: TNode['ref'] } | undefined
    id: { v: TNode['id'] } | undefined
  }
}
const SHELL_TYPE: PropertyDescriptor = {
  get(this: TShell) {
    const s = this[SHELL]
    return s.t ?? s.b.type
  },
  set(this: TShell, d: TNode['type']) {
    this[SHELL].t = d
  },
  enumerable: true,
  configurable: true,
}
const SHELL_REF: PropertyDescriptor = {
  get(this: TShell) {
    const s = this[SHELL]
    return s.ref ? s.ref.v : s.b.ref
  },
  set(this: TShell, v: TNode['ref']) {
    this[SHELL].ref = { v }
  },
  enumerable: true,
  configurable: true,
}
const SHELL_ID: PropertyDescriptor = {
  get(this: TShell) {
    const s = this[SHELL]
    return s.id ? s.id.v : s.b.id
  },
  set(this: TShell, v: TNode['id']) {
    this[SHELL].id = { v }
  },
  enumerable: true,
  configurable: true,
}

/** A def of node `holder`'s with the same entries as `d` (its children replaceable by shells). */
function shellDef(d: TDef, holder: object): TDef {
  const c: TDef = { ...d }
  if (d.tags) {
    c.tags = new Set(d.tags)
  }
  if (d.props) {
    c.props = new PropsMap(d.props)
    c.propsPatterns = [...(d.propsPatterns ?? [])]
  }
  if (d.items) {
    c.items = [...d.items]
  }
  shellDefOf.set(c, holder)
  // (to the readers' recursion cut a shell's def is the def it shells, see `cut.ts`)
  cutAs(c, d)
  return c
}

/** Puts `node` at step `s` of def `d`. */
function put(d: TDef, s: string, node: TNode): void {
  if (s === '[]') {
    d.of = node
    touched(d)
  } else if (s[0] === '|') {
    d.items[Number(s.slice(1))] = node
    touched(d)
  } else {
    d.props.set(s, node)
  }
}

/** A step of a shell path: the step and its kind (from the build's structure model). */
type TStep = [string, 0 | 1 | 2]

/**
 * The node of `T` at `path`, with T's own shells along it (idempotent). Step kinds:
 * 0 — the def and the child are T's own (descend); 1 — the def is T's, the child is not (a shell
 * node replaces it); 2 — the def is not T's (the node gets a shell def first, then as 1).
 */
function ensure(T: TNode, path: TStep[]): TNode {
  let cur = T
  for (const [s, kind] of path) {
    let c = child(cur, s)
    if (!c) {
      throw NOT_READY
    }
    if (kind === 2 && shellDefOf.get(cur.type) !== cur) {
      touched(cur)
      cur.type = shellDef(cur.type, cur) as TNode['type']
    }
    if (kind !== 0 && shellIn.get(c) !== cur.type) {
      c = shellNode(c)
      put(cur.type, s, c)
      shellIn.set(c, cur.type)
    }
    cur = c
  }
  return cur
}

/** Ensures T's shells along each path (see {@link ensure}). */
export function $sh(T: unknown, paths: TStep[][]): void {
  const target = builtNode(T)
  for (const path of paths) {
    ensure(target, path)
  }
  const pending = pendingShells.get(target)
  if (pending) {
    const done = new Set(paths.map(p => JSON.stringify(p)))
    const rest = pending.filter(p => !done.has(JSON.stringify(p)))
    if (rest.length > 0) {
      pendingShells.set(target, rest)
    } else {
      pendingShells.delete(target)
    }
  }
}

/**
 * The shells a class of an import cycle's module will get (`$sh` runs once what they shell is
 * built): a read through a node they replace, or into a def they clone, waits for them.
 */
const pendingShells = new WeakMap<object, TStep[][]>()

/** Registers class `T`'s shells as pending (see {@link $sh}): first statement of its module. */
export function $ps(T: unknown, paths: TStep[][]): void {
  pendingShells.set(T as object, paths)
}

/**
 * Whether a read at `path` meets what pending shell stages change: a stage (a shell path up to a
 * step of kind 1 / 2) replaces the node at its end in the def above it (kind 2: in a clone of
 * that def). A read through that node waits; a read of the def above it waits for a clone
 * (`TYPED`: it captures the def) or for any stage (`CLONED`: it copies the def's entries).
 */
function changedBy(shells: TStep[][], path: string[], typed: number): boolean {
  for (const s of shells) {
    const n = s.length
    let i = 0
    while (i < n && i < path.length && path[i] === s[i][0]) {
      i++
    }
    if (
      i === n ||
      (typed !== PLAIN &&
        i === n - 1 &&
        path.length === n - 1 &&
        (typed === CLONED || s[n - 1][1] === 2))
    ) {
      return true
    }
  }
  return false
}

// ── Blocks ─────────────────────────────────────────────────────────────────────────────────

/** A block's rank: (import depth, module id, block index, entry index); `as` entries: depth -1. */
type TRank = [number, string, number, number]

function compare(a: TRank, b: TRank): number {
  return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || a[2] - b[2] || a[3] - b[3]
}

/** The last block write of a key of a map: its rank and the value it left. */
interface TRecord {
  rank: TRank
  value: unknown
}
/** An append key's block writes: the elements before them, the parts by rank, the list left. */
interface TAppendRecord {
  before: unknown[]
  parts: Array<{ rank: TRank; values: unknown[] }>
  value: unknown[]
  length: number
}

const records = new WeakMap<object, Map<unknown, TRecord | TAppendRecord>>()

function recordsOf(m: object): Map<unknown, TRecord | TAppendRecord> {
  let r = records.get(m)
  if (!r) {
    records.set(m, (r = new Map()))
  }
  return r
}

/**
 * A block write of a replace key: ignored when the own value is one a higher-ranked block wrote
 * (a raw write since makes it nobody's: the block applies).
 */
function writeKey(m: Map<unknown, unknown>, key: unknown, value: unknown, rank: TRank): void {
  const recs = recordsOf(m)
  const r = recs.get(key) as TRecord | undefined
  if (r && ownValue(m, key) === r.value && compare(r.rank, rank) > 0) {
    return
  }
  m.set(key, value)
  recs.set(key, { rank, value })
}

/**
 * A block write of an append key: the own list is the elements written before any block (by
 * the builder, or a raw write since), then every block's part by rank.
 */
function appendKey(m: Map<unknown, unknown>, key: unknown, values: unknown[], rank: TRank): void {
  const recs = recordsOf(m)
  let r = recs.get(key) as TAppendRecord | undefined
  const own = ownValue(m, key)
  if (!r || own !== r.value || r.value.length !== r.length) {
    const before = own === undefined ? [] : Array.isArray(own) ? [...own] : [own]
    r = { before, parts: [], value: before, length: 0 }
  }
  const { parts } = r
  let at = 0
  while (at < parts.length && compare(parts[at].rank, rank) < 0) {
    at++
  }
  if (at < parts.length && compare(parts[at].rank, rank) === 0) {
    parts[at].values = values
  } else {
    parts.splice(at, 0, { rank, values })
  }
  const value = [...r.before]
  for (const p of parts) {
    value.push(...p.values)
  }
  m.set(key, value)
  r.value = value
  r.length = value.length
  recs.set(key, r)
}

/**
 * One entry's annotations: `[key, value]`, or `[key, value, 1]` for a list key (`multiple`):
 * its values in order. Written as one value per key.
 */
type TAnnotation = [string, unknown] | [string, unknown, 1]
/** A block entry: its annotations, then the paths it writes (several: a union's branches). */
type TEntry = [TAnnotation[], ...TStep[][]]

function writeEntry(m: Map<unknown, unknown>, anns: TAnnotation[], rank: TRank): void {
  const values = new Map<string, unknown>()
  for (const [key, value, list] of anns) {
    if (list) {
      const xs = values.get(key) as unknown[] | undefined
      values.set(key, xs ? [...xs, value] : [value])
    } else {
      values.set(key, value)
    }
  }
  for (const [key, value] of values) {
    if (isAppendKey(key)) {
      appendKey(m, key, Array.isArray(value) ? value : [value], rank)
    } else {
      writeKey(m, key, value, rank)
    }
  }
}

/** The module ids of the blocks applied (the bundled-schema guard reads them). */
const applied = new Set<string>()

/** The module ids of every block applied so far. */
export function appliedBlockModules(): ReadonlySet<string> {
  return applied
}

/**
 * Block `index` of a module of rank `R` (`[import depth, module id]`; `null`: an `as` copy's
 * entries, below every block) on `T`: ensures each entry's shells, then writes its annotations
 * with rank (R, index, entry index). Re-applying a block is idempotent.
 */
export function $blk(
  R: [number, string] | null,
  index: number,
  T: unknown,
  entries: TEntry[]
): void {
  const target = builtNode(T)
  const nodes = entries.map(([, ...paths]) => paths.map(path => ensure(target, path)))
  entries.forEach(([anns], e) => {
    const rank: TRank = R ? [R[0], R[1], index, e] : [-1, '', index, e]
    for (const node of nodes[e]) {
      writeEntry(node.metadata as unknown as Map<unknown, unknown>, anns, rank)
    }
  })
  if (R) {
    applied.add(R[1])
  }
}

// ── Import cycles ──────────────────────────────────────────────────────────────────────────

const queue: Array<() => unknown> = []

const retryable = (e: unknown) => e === NOT_READY || e instanceof ReferenceError

/**
 * Runs `fn` (a statement reading a class of another module of its import cycle), or queues it
 * when that class is not built yet (ESM: its temporal dead zone; CommonJS: `undefined`).
 */
export function $q(fn: () => unknown): void {
  try {
    fn()
  } catch (error) {
    if (!retryable(error)) {
      throw error
    }
    queue.push(fn)
  }
}

/** The last statement of a module: runs the queued statements that can run now, in order. */
export function $end(): void {
  let progress = true
  while (progress && queue.length > 0) {
    progress = false
    for (let i = 0; i < queue.length; ) {
      const fn = queue[i]
      try {
        fn()
      } catch (error) {
        if (retryable(error)) {
          i++
          continue
        }
        queue.splice(i, 1)
        throw error
      }
      queue.splice(i, 1)
      progress = true
    }
  }
}

/** How many statements wait for a class of an import cycle (0 once every module loaded). */
export function pendingStatements(): number {
  return queue.length
}
