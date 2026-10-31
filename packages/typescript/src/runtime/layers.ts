/**
 * Metadata layers: the runtime's one metadata mechanism.
 *
 * A node's metadata is its own map plus an ordered list of base nodes (`b`, priority order:
 * `b[0]` first). A read returns the own value, else the first base that has the key; an append
 * key returns the bases' values (lowest priority first), then the own ones. Writes (`set`,
 * `delete`, `clear`) are the own map's: `delete` lets a base's value show again, and a write on
 * a base shows through every layer over it.
 *
 * Reads go through a flattened view of the effective entries, rebuilt on the first read after any
 * metadata write (one global write counter: `metadataWriteCount`). The view is used only while
 * every map below is tracked (an `AnnotationMap` or a `LayerMap`, whose writes the counter
 * sees); otherwise the reads are live. A raw write the counter does not see (a node's map swapped,
 * `node.metadata = X`, or edited in place) must be followed by `invalidateCompiledValidators()`,
 * as compiled checks require (PERF-2).
 */
import {
  AnnotationMap,
  appendOwn,
  metadataReplaced,
  metadataWriteCount,
  watch,
} from './compiled-check/tracking'

/** A node as layers read it. */
interface TLayerNode {
  metadata: Map<unknown, unknown>
}

/** Append keys: concatenated across layers (registered by generated code, `$ak`). */
const APPEND = 1
/** `passedWhenReferred: false` keys: never read through a reference layer (`$nr`). */
const NOT_REFERRED = 2
/** The flags of the registered keys (one lookup per read). */
const FLAGS = new Map<unknown, number>()

function flag(keys: string[], f: number): void {
  for (const key of keys) {
    FLAGS.set(key, (FLAGS.get(key) ?? 0) | f)
  }
  // (how layers read a key changed: flattened views are rebuilt)
  metadataReplaced()
}

/** Registers append keys (`mergeStrategy: 'append'`). */
export function $ak(...keys: string[]): void {
  flag(keys, APPEND)
}

/** Registers `passedWhenReferred: false` keys. */
export function $nr(...keys: string[]): void {
  flag(keys, NOT_REFERRED)
}

/** Whether `key` is an append key (see {@link $ak}). */
export function isAppendKey(key: unknown): boolean {
  return ((FLAGS.get(key) ?? 0) & APPEND) !== 0
}

const notReferred = (key: unknown) => ((FLAGS.get(key) ?? 0) & NOT_REFERRED) !== 0

/**
 * Intrinsic entries per metadata map: a primitive extension's own annotations
 * (`string.required` → `meta.required`) are part of the type, so they pass every reference layer
 * although their key is `passedWhenReferred: false` (0.1.110).
 */
const INTRINSIC = new WeakMap<object, Set<unknown>>()

/** Marks `keys` of map `m` intrinsic (see {@link INTRINSIC}). */
export function markIntrinsic(m: object, keys: unknown[]): void {
  let s = INTRINSIC.get(m)
  if (!s) {
    INTRINSIC.set(m, (s = new Set()))
  }
  for (const k of keys) {
    s.add(k)
  }
  metadataReplaced()
}

/**
 * A map replacing `from` (layered over its bases now) keeps its intrinsic marks. (No write
 * counted: the callers count the map replaced.)
 */
export function moveIntrinsic(from: object, to: object): void {
  const s = INTRINSIC.get(from)
  if (s) {
    INTRINSIC.set(to, s)
  }
}

const MISS = Symbol('miss')

/** The view of a layered map without effective entries (never written: views stay internal). */
const NO_ENTRIES = new AnnotationMap<unknown, unknown>()
const mapGet = Map.prototype.get
const mapHas = Map.prototype.has
const ownSize = Object.getOwnPropertyDescriptor(Map.prototype, 'size')!.get!

/**
 * A metadata map that reads through base nodes (see the file comment). `r`: the bases are
 * reference layers (a prop's / element's type, a chain ref, `extends`, merge operands), so
 * `passedWhenReferred: false` keys are not read through them.
 */
export class LayerMap<K = unknown, V = unknown> extends AnnotationMap<K, V> {
  b: TLayerNode[]
  r: boolean
  /**
   * The flattened view: every effective entry (as the layered reads give it, in their order),
   * built on the first read after a metadata write (`w` ≠ `metadataWrites`); `undefined` while a
   * map below is not tracked (a plain `Map` or a subclass: its writes are not counted, read live).
   */
  private f: Map<K, V> | undefined
  /** `metadataWrites` when {@link f} was built (`-1`: not built). */
  private w: number

  constructor(bases: TLayerNode[], reference = false, own?: Iterable<readonly [K, V]> | null) {
    super(own)
    this.b = bases
    this.r = reference
    this.f = undefined
    this.w = -1
  }

  /**
   * The flattened view (built again after a metadata write), `undefined`: read live. Internal:
   * this module's readers and the validators read it (`readable`, `filledMeta`), never write.
   */
  private view(): Map<K, V> | undefined {
    return this.w === metadataWriteCount() ? this.f : this.flatten()
  }

  private flatten(): Map<K, V> | undefined {
    this.w = -1
    let f: Map<K, V> | undefined
    if (tracked(this, new Set())) {
      // (an `AnnotationMap`, as the plain nodes' maps: the readers' call sites see one map class;
      // filled by its constructor: no write counted)
      const keys = this.liveKeys()
      // (no effective entry, often a reference layer: one shared empty view)
      f =
        keys.length === 0
          ? (NO_ENTRIES as Map<K, V>)
          : new AnnotationMap<K, V>(keys.map(k => [k, this.liveGet(k) as V] as const))
    }
    this.f = f
    this.w = metadataWriteCount()
    return f
  }

  /** The value of `key` (not concatenated), or `MISS`; `nr`: a `passedWhenReferred:false` key. */
  lookup(key: unknown, nr: boolean): unknown {
    // (a reference's own map is often empty: then only the bases are read)
    if (ownSize.call(this) !== 0) {
      const v = mapGet.call(this, key)
      if (v !== undefined || mapHas.call(this, key)) {
        return v
      }
    }
    if (nr && this.r) {
      // (a `passedWhenReferred: false` key through a reference layer: only an intrinsic entry)
      for (const n of this.b) {
        const x = intrinsicLookup(n.metadata, key)
        if (x !== MISS) {
          return x
        }
      }
      return MISS
    }
    for (const n of this.b) {
      const m = n.metadata
      let x: unknown
      // (a layered base: `b` set; read without the append check, done once at the top)
      if ((m as LayerMap).b === undefined) {
        x = m.get(key)
        if (x === undefined && !m.has(key)) {
          x = MISS
        }
      } else {
        x = (m as LayerMap).lookup(key, nr)
      }
      if (x !== MISS) {
        return x
      }
    }
    return MISS
  }

  override get(key: K): V | undefined {
    const view = this.w === metadataWriteCount() ? this.f : this.flatten()
    return view === undefined ? this.liveGet(key) : (mapGet.call(view, key) as V | undefined)
  }

  /** `get` read through the layers (see the file comment). */
  private liveGet(key: K): V | undefined {
    const f = FLAGS.get(key)
    if (f !== undefined && (f & APPEND) !== 0) {
      return this.append(key) as V | undefined
    }
    const v = this.lookup(key, f !== undefined && (f & NOT_REFERRED) !== 0)
    return v === MISS ? undefined : (v as V)
  }

  override has(key: K): boolean {
    const view = this.view()
    return view === undefined ? this.lookup(key, notReferred(key)) !== MISS : mapHas.call(view, key)
  }

  /** An append key: the bases' values (lowest priority first), then the own ones. */
  private append(key: K): unknown {
    const own = mapGet.call(this, key)
    if (this.r && notReferred(key)) {
      // (through a reference layer: only intrinsic entries)
      const parts: unknown[] = []
      const acc = { out: parts, seen: new Map<object, boolean>() }
      for (let i = this.b.length - 1; i >= 0; i--) {
        collect(this.b[i].metadata, key, acc, true)
      }
      if (parts.length === 0) {
        return own
      }
      if (own !== undefined) {
        parts.push(own)
      }
      return parts.length === 1 ? parts[0] : parts.flat()
    }
    // (one base holding the key and no own values, the usual case: its value, no new list)
    let one: unknown
    let count = 0
    for (const n of this.b) {
      const x = n.metadata.get(key)
      if (x !== undefined && ++count === 1) {
        one = x
      }
    }
    if (count === 0) {
      return own
    }
    if (count === 1 && own === undefined) {
      return one
    }
    // (each map once: a diamond — two bases over one node — gives its values once)
    const parts: unknown[] = []
    collect(this, key, { out: parts, seen: new Map() }, false)
    if (parts.length === 1) {
      return parts[0]
    }
    const out: unknown[] = []
    for (const p of parts) {
      if (Array.isArray(p)) {
        out.push(...p)
      } else {
        out.push(p)
      }
    }
    return out
  }

  /** The effective keys: own first, then the bases' in priority order. */
  private effectiveKeys(): K[] {
    const view = this.view()
    return view === undefined ? this.liveKeys() : [...view.keys()]
  }

  private liveKeys(): K[] {
    const out = new Set<K>()
    keysOf(this, false, out, new Map())
    return [...out]
  }

  override keys(): MapIterator<K> {
    return this.effectiveKeys()[Symbol.iterator]() as MapIterator<K>
  }

  override values(): MapIterator<V> {
    return this.effectiveKeys()
      .map(k => this.get(k) as V)
      [Symbol.iterator]() as MapIterator<V>
  }

  override entries(): MapIterator<[K, V]> {
    return this.effectiveKeys()
      .map(k => [k, this.get(k) as V] as [K, V])
      [Symbol.iterator]() as MapIterator<[K, V]>
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries()
  }

  override forEach(cb: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    for (const k of this.effectiveKeys()) {
      cb.call(thisArg, this.get(k) as V, k, this)
    }
  }
}

/** A layered map as this module's readers see it: its private flattened view readable. */
interface TViewed {
  view(): Map<unknown, unknown> | undefined
}

// (`size` is the effective count: an accessor, which a class body cannot declare over `Map`'s)
Object.defineProperty(LayerMap.prototype, 'size', {
  get(this: LayerMap) {
    const view = (this as unknown as TViewed).view()
    if (view !== undefined) {
      return view.size
    }
    return metaEmpty(this)
      ? 0
      : (this as unknown as { effectiveKeys(): unknown[] }).effectiveKeys().length
  },
  configurable: true,
})

/**
 * Every map of `m`'s layers is tracked (an `AnnotationMap` or a `LayerMap`, whose writes count in
 * `metadataWrites`), so a flattened view of `m` stays right until the next write.
 */
function tracked(m: Map<unknown, unknown>, seen: Set<object>): boolean {
  const p = Object.getPrototypeOf(m)
  if (p !== AnnotationMap.prototype && p !== LayerMap.prototype) {
    return false
  }
  const b = (m as LayerMap).b
  if (b !== undefined && !seen.has(m)) {
    seen.add(m)
    for (const n of b) {
      if (!tracked(n.metadata, seen)) {
        return false
      }
    }
  }
  return true
}

/** `key`'s intrinsic value in `m` or its bases (see {@link INTRINSIC}), or `MISS`. */
function intrinsicLookup(m: Map<unknown, unknown>, key: unknown): unknown {
  if (INTRINSIC.get(m)?.has(key)) {
    const own = m instanceof LayerMap ? mapHas.call(m, key) : m.has(key)
    if (own) {
      return m instanceof LayerMap ? mapGet.call(m, key) : m.get(key)
    }
  }
  const b = (m as LayerMap).b
  if (b !== undefined) {
    for (const n of b) {
      const x = intrinsicLookup(n.metadata, key)
      if (x !== MISS) {
        return x
      }
    }
  }
  return MISS
}

/**
 * Whether a layer walk visits `m` (reached `filtered` or not): each map once, except that a map
 * first reached `filtered` (through a reference layer) is visited again when reached unfiltered
 * (a diamond: a direct base over the same node), as the layered `get` reads it. `seen`: the maps
 * visited, `true` while only filtered.
 */
function visit(m: object, filtered: boolean, seen: Map<object, boolean>): boolean {
  const was = seen.get(m)
  if (was !== undefined && (filtered || !was)) {
    return false
  }
  seen.set(m, filtered)
  return true
}

/**
 * The values of `key` of `m` and its bases (lowest priority first), each map once (see
 * {@link visit}). `filtered`: reached through a reference layer with a `passedWhenReferred: false`
 * key — only intrinsic entries count (see {@link INTRINSIC}), down to the bottom.
 */
function collect(
  m: Map<unknown, unknown>,
  key: unknown,
  acc: { out: unknown[]; seen: Map<object, boolean> },
  filtered: boolean
): void {
  // (`true`: visited filtered before, its intrinsic entry already collected)
  const was = acc.seen.get(m)
  if (!visit(m, filtered, acc.seen)) {
    return
  }
  const layer = m instanceof LayerMap ? m : undefined
  if (layer) {
    const below = filtered || (layer.r && notReferred(key))
    for (let i = layer.b.length - 1; i >= 0; i--) {
      collect(layer.b[i].metadata, key, acc, below)
    }
  }
  const intrinsic = INTRINSIC.get(m)?.has(key) === true
  if (
    (filtered ? intrinsic : !(was === true && intrinsic)) &&
    (layer ? mapHas.call(m, key) : m.has(key))
  ) {
    acc.out.push(layer ? mapGet.call(m, key) : m.get(key))
  }
}

/**
 * The keys of `m` (own first, then its bases'), each map once (see {@link visit}). `filtered`:
 * reached through a reference layer.
 */
function keysOf(
  m: Map<unknown, unknown>,
  filtered: boolean,
  out: Set<unknown>,
  seen: Map<object, boolean>
): void {
  if (!visit(m, filtered, seen)) {
    return
  }
  const layer = m instanceof LayerMap ? m : undefined
  const own = layer ? (Map.prototype.keys.call(m) as Iterable<unknown>) : m.keys()
  const intrinsic = INTRINSIC.get(m)
  for (const k of own) {
    if (!filtered || !notReferred(k) || intrinsic?.has(k)) {
      out.add(k)
    }
  }
  if (layer) {
    for (const n of layer.b) {
      keysOf(n.metadata, filtered || layer.r, out, seen)
    }
  }
}

/**
 * `m` has no entry (own or through its bases): the validators' `metadata.size === 0` fast path,
 * without computing a layered map's effective size. May answer `false` for a map whose only base
 * entries are filtered out (`passedWhenReferred: false`): the slow path then finds nothing.
 */
export function metaEmpty(m: Map<unknown, unknown>): boolean {
  const b = (m as LayerMap).b
  if (b === undefined) {
    return m.size === 0
  }
  const view = (m as unknown as TViewed).view()
  if (view !== undefined) {
    return view.size === 0
  }
  if (ownSize.call(m) !== 0) {
    return false
  }
  for (const n of b) {
    if (!metaEmpty(n.metadata)) {
      return false
    }
  }
  return true
}

/**
 * `m` for reading: a layered map's flattened view (see `LayerMap.view`), else `m` itself.
 * The validators read builtin maps this way (never write: a view is shared).
 */
export function readable<M extends Map<unknown, unknown>>(m: M): M {
  return (m as unknown as LayerMap).b === undefined
    ? m
    : (((m as unknown as TViewed).view() as M | undefined) ?? m)
}

/**
 * {@link readable}`(m)`, or `undefined` when `m` has no entry: the validators' "no constraint"
 * fast path and their reads in one (a plain map costs what `metaEmpty` did).
 */
export function filledMeta<M extends Map<unknown, unknown>>(m: M): M | undefined {
  if ((m as unknown as LayerMap).b === undefined) {
    return m.size === 0 ? undefined : m
  }
  const view = (m as unknown as TViewed).view() as M | undefined
  if (view !== undefined) {
    return view.size === 0 ? undefined : view
  }
  return metaEmpty(m) ? undefined : m
}

/**
 * Watches `m` and every base (node and map, transitively) for a compiled check's bind (see
 * `compiled-check/tracking.ts`): a tracked write to any of them re-binds the check. `false` when
 * one of the maps is untracked (a plain `Map`): such a tree stays interpreted.
 */
export function watchLayer(m: Map<unknown, unknown>, seen?: Set<object>): boolean {
  watch(m)
  const b = (m as LayerMap).b
  if (b === undefined) {
    return m instanceof AnnotationMap
  }
  let ok = true
  for (const n of b) {
    const nm = n.metadata
    if (seen?.has(nm)) {
      continue
    }
    ;(seen ??= new Set()).add(nm)
    watch(n)
    ok = watchLayer(nm, seen) && ok
  }
  return ok
}

/** The own entries of `m` (a layered map's, not read through its bases). */
export function ownEntries(
  m: Map<unknown, unknown> | undefined
): Iterable<[unknown, unknown]> | undefined {
  return m instanceof LayerMap ? [...Map.prototype.entries.call(m)] : m
}

/** The own value of `key` of `m` (not read through its bases). */
export function ownValue(m: Map<unknown, unknown>, key: unknown): unknown {
  return m instanceof LayerMap ? mapGet.call(m, key) : m.get(key)
}

/**
 * `annotate(map, key, value, true)` on a layered map: appends to the own list. For an append
 * key that is the own part of the concatenation; for another list key the own list starts as
 * the value read (as when the node held a copy).
 */
export function annotateLayer(m: LayerMap, key: unknown, value: unknown): void {
  if (mapHas.call(m, key)) {
    appendOwn(m, key, mapGet.call(m, key), value)
    return
  }
  const read = isAppendKey(key) ? undefined : m.get(key)
  m.set(key, read === undefined ? [value] : Array.isArray(read) ? [...read, value] : [read, value])
}
