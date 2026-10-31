import { describe, expect, it } from 'vitest'

import {
  annotate,
  createAnnotatedTypeNode,
  defineAnnotatedType as $,
  type TAtscriptAnnotatedType,
} from '../runtime/annotated-type'
import { $alias } from '../runtime/blocks'
import { lazyJsonSchema } from '../runtime/bundled-schema'
import { AnnotationMap, invalidateCompiledValidators } from '../runtime/compiled-check/tracking'
import { $ak, $nr, LayerMap, markIntrinsic, metaEmpty } from '../runtime/layers'
import { Validator } from '../runtime/validator'

/*
 * Metadata layers (MODEL §2): a node's metadata is its own map plus ordered bases; reads go
 * through, append keys concatenate (bases first), writes are the own map's.
 */

$ak('test.list', 'expect.pattern')
$nr('test.ro')

/** A generated class (as the codegen declares it). */
function cls(id: string): TAtscriptAnnotatedType {
  return class {
    static __is_atscript_annotated_type = true
    static type = {}
    static metadata = new Map()
    static id = id
  } as unknown as TAtscriptAnnotatedType
}

const meta = (n: TAtscriptAnnotatedType) => n.metadata as unknown as Map<string, unknown>

/** `interface T { name: string }` with type-level annotations. */
function typeT(anns: Record<string, unknown> = {}) {
  const T = cls('T')
  const h = $('object', T).prop('name', $().designType('string').tags('string').$type)
  for (const [k, v] of Object.entries(anns)) {
    h.annotate(k as any, v)
  }
  return T
}

describe('LayerMap reads', () => {
  it('own value first, then the first base that has the key (priority order)', () => {
    const A = typeT({ 'meta.label': 'A', 'meta.description': 'dA' })
    const B = typeT({ 'meta.label': 'B', 'meta.placeholder': 'pB' })
    const n = $().over([B, A]).annotate('meta.description', 'own').$type
    expect(meta(n).get('meta.label')).toBe('B')
    expect(meta(n).get('meta.description')).toBe('own')
    expect(meta(n).get('meta.placeholder')).toBe('pB')
    expect(meta(n).has('meta.label')).toBe(true)
    expect(meta(n).has('meta.required')).toBe(false)
    expect(meta(n).get('meta.required')).toBeUndefined()
  })

  it('reads through nested layers, live: a later base write shows through', () => {
    const T = typeT({ 'meta.label': 'T' })
    const r1 = $().ref(T).$type
    const r2 = $().over([r1]).$type
    expect(meta(r2).get('meta.label')).toBe('T')
    meta(T).set('meta.label', 'T2')
    expect(meta(r2).get('meta.label')).toBe('T2')
    meta(r1).set('meta.label', 'r1')
    expect(meta(r2).get('meta.label')).toBe('r1')
    expect(meta(T).get('meta.label')).toBe('T2')
  })

  it('size, iteration, keys, values, entries and forEach give the effective entries', () => {
    const A = typeT({ 'meta.label': 'A', 'meta.description': 'dA' })
    const n = $().ref(A).annotate('meta.label', 'own').annotate('meta.placeholder', 'p').$type
    const m = meta(n)
    expect(m.size).toBe(3)
    const want = [
      ['meta.label', 'own'],
      ['meta.placeholder', 'p'],
      ['meta.description', 'dA'],
    ]
    expect([...m]).toEqual(want)
    expect([...m.entries()]).toEqual(want)
    expect([...m.keys()]).toEqual(want.map(e => e[0]))
    expect([...m.values()]).toEqual(want.map(e => e[1]))
    const seen: unknown[] = []
    m.forEach((v, k) => seen.push([k, v]))
    expect(seen).toEqual(want)
    expect(Object.fromEntries(m)).toEqual(Object.fromEntries(want))
  })

  it('append keys: bases first (lowest priority first), then own; a diamond gives a base once', () => {
    const T = typeT({})
    annotate(T.metadata, 'test.list' as any, 't', true)
    const A = $()
      .ref(T)
      .annotate('test.list' as any, 'a', true).$type
    const B = $()
      .ref(T)
      .annotate('test.list' as any, 'b', true).$type
    // a merged field over B and A (B later: higher priority)
    const M = $()
      .over([B, A])
      .annotate('test.list' as any, 'm', true).$type
    expect(meta(M).get('test.list')).toEqual(['t', 'a', 'b', 'm'])
    expect(meta(A).get('test.list')).toEqual(['t', 'a'])
    // no own values, one contributing base: that base's list
    const only = $().ref(A).$type
    expect(meta(only).get('test.list')).toEqual(['t', 'a'])
    // not an append key: the first value found
    meta(T).set('meta.label', 'x')
    expect(meta(M).get('meta.label')).toBe('x')
  })

  it('passedWhenReferred:false keys are not read through a reference layer; an alias keeps them', () => {
    const T = typeT({ 'test.ro': true, 'meta.label': 'T' })
    const ref = $().ref(T).$type
    expect(meta(ref).get('test.ro')).toBeUndefined()
    expect(meta(ref).has('test.ro')).toBe(false)
    expect([...meta(ref).keys()]).toEqual(['meta.label'])
    expect(meta(ref).get('meta.label')).toBe('T')
    const P = cls('P')
    $alias(P, T)
    expect(meta(P).get('test.ro')).toBe(true)
    // a reference to the alias: filtered at the reference edge, whatever is below it
    const refP = $().ref(P).$type
    expect(meta(refP).get('test.ro')).toBeUndefined()
    // the key written on the reference itself is its own
    meta(ref).set('test.ro', 'own')
    expect(meta(ref).get('test.ro')).toBe('own')
  })

  it('writes are own: set, delete (the base shows again), clear', () => {
    const T = typeT({ 'meta.label': 'T', 'meta.description': 'd' })
    const n = $().ref(T).$type
    meta(n).set('meta.label', 'n')
    expect(meta(T).get('meta.label')).toBe('T')
    expect(meta(n).get('meta.label')).toBe('n')
    expect(meta(n).delete('meta.label')).toBe(true)
    expect(meta(n).get('meta.label')).toBe('T')
    expect(meta(n).delete('meta.description')).toBe(false)
    expect(meta(T).get('meta.description')).toBe('d')
    meta(n).set('meta.placeholder', 'p')
    meta(n).clear()
    expect(meta(n).size).toBe(2)
    expect(meta(T).size).toBe(2)
    n.metadata.delete('meta.label')
    expect(meta(n).get('meta.label')).toBe('T')
  })

  it('annotate(…, true) on a layered map appends to its own list', () => {
    const T = typeT({})
    annotate(T.metadata, 'test.list' as any, 't', true)
    annotate(T.metadata, 'meta.tags' as any, 'x', true)
    const n = $().ref(T).$type
    annotate(n.metadata, 'test.list' as any, 'n1', true)
    annotate(n.metadata, 'test.list' as any, 'n2', true)
    expect(meta(n).get('test.list')).toEqual(['t', 'n1', 'n2'])
    expect(meta(T).get('test.list')).toEqual(['t'])
    // a list key that does not concatenate: the own list starts as the value read
    annotate(n.metadata, 'meta.tags' as any, 'y', true)
    expect(meta(n).get('meta.tags')).toEqual(['x', 'y'])
    expect(meta(T).get('meta.tags')).toEqual(['x'])
  })

  it('an in-place append on a layered map is a metadata write (a lazy JSON schema refreshes)', () => {
    const S = cls('S')
    $('', S).designType('string').tags('string')
    const p = $().ref(S).$type
    expect(p.metadata).toBeInstanceOf(LayerMap)
    annotate(p.metadata, 'expect.pattern', { pattern: '^a' }, true)
    const t = $('object').prop('p', p).$type
    expect(JSON.stringify(lazyJsonSchema(t))).not.toContain('b$')
    // (the own list exists: appended in place)
    annotate(p.metadata, 'expect.pattern', { pattern: 'b$' }, true)
    expect(JSON.stringify(lazyJsonSchema(t))).toContain('b$')
  })

  it('metaEmpty: no entry own or through the bases', () => {
    const E = typeT()
    expect(metaEmpty(meta(E))).toBe(true)
    const r = $().ref(E).$type
    expect(metaEmpty(meta(r))).toBe(true)
    expect(meta(r).size).toBe(0)
    meta(E).set('meta.label', 'x')
    expect(metaEmpty(meta(r))).toBe(false)
    expect(meta(r).size).toBe(1)
    expect(metaEmpty(new Map([['a', 1]]))).toBe(false)
  })

  it('a reference node keeps the one node shape; maps are AnnotationMap or LayerMap', () => {
    const T = typeT({ 'meta.label': 'T' })
    const plain = createAnnotatedTypeNode({ kind: '', tags: new Set() } as any)
    const shapes = new Set(
      [
        plain,
        $().ref(T).$type,
        $().ref(T).optional().$type,
        $().designType('string').over([T]).$type,
        $().type(T).over([T]).optional().$type,
        $('object', cls('C')).prop('p', $().ref(T).$type).$type.type.props.get('p')!,
      ].map(n => Object.keys(n).join(','))
    )
    expect([...shapes]).toEqual([
      '__is_atscript_annotated_type,metadata,type,validator,ref,id,optional',
    ])
    expect(meta($().ref(T).$type)).toBeInstanceOf(LayerMap)
    expect(meta($().ref(T).$type)).toBeInstanceOf(AnnotationMap)
  })
})

describe('validators read layered metadata', () => {
  it('a reference over a constrained type validates with its constraints, live', () => {
    const T = cls('T')
    $('', T).designType('string').tags('string').annotate('expect.maxLength', { length: 3 })
    const H = cls('H')
    $('object', H).prop('s', $().ref(T).$type)
    const v = () => new Validator(H)
    expect(v().validate({ s: 'abc' }, true)).toBe(true)
    expect(v().validate({ s: 'abcd' }, true)).toBe(false)
    meta(T).set('expect.maxLength', { length: 5 })
    expect(v().validate({ s: 'abcd' }, true)).toBe(true)
    annotate(T.metadata, 'expect.pattern', { pattern: '^a', flags: '' }, true)
    const s = H.type.props.get('s')!
    annotate(s.metadata, 'expect.pattern', { pattern: 'c$', flags: '' }, true)
    expect(v().validate({ s: 'abc' }, true)).toBe(true)
    expect(v().validate({ s: 'bc' }, true)).toBe(false)
    expect(v().validate({ s: 'ab' }, true)).toBe(false)
  })
})

describe('cached layered reads (a view rebuilt after a metadata write)', () => {
  /** The layered read without the cached view: the reference every cached read must equal. */
  const live = (n: TAtscriptAnnotatedType) => {
    const m = n.metadata as unknown as {
      liveKeys(): string[]
      liveGet(k: string): unknown
    }
    return m.liveKeys().map(k => [k, m.liveGet(k)])
  }
  const same = (n: TAtscriptAnnotatedType) => {
    expect([...meta(n).entries()]).toEqual(live(n))
    expect([...meta(n).keys()]).toEqual(live(n).map(e => e[0]))
    expect(meta(n).size).toBe(live(n).length)
  }

  /** `interface P { s: S1 }`, `interface Q { s: S2 }`: `s` merged over S2's and S1's fields. */
  function merged() {
    const field = () =>
      $().designType('string').tags('string').annotate('expect.maxLength', 3).$type
    const s1 = field()
    const s2 = field()
    const s = $().designType('string').tags('string').over([s2, s1]).$type
    const H = cls('H')
    $('object', H).prop('s', s)
    return { s1, s2, s, v: new Validator(H) }
  }

  it("a contributor's write shows on the merged field and in validation", () => {
    const { s2, s, v } = merged()
    expect(v.validate({ s: 'abcd' }, true)).toBe(false)
    same(s)
    meta(s2).set('expect.maxLength', 5)
    same(s)
    expect(v.validate({ s: 'abcd' }, true)).toBe(true)
    meta(s2).delete('expect.maxLength')
    // (the lower contributor's value shows again)
    expect(meta(s).get('expect.maxLength')).toBe(3)
    expect(v.validate({ s: 'abcd' }, true)).toBe(false)
  })

  it('own set and delete on the merged field: local, the contributors show again', () => {
    const { s1, s2, s, v } = merged()
    expect(v.validate({ s: 'ab' }, true)).toBe(true)
    meta(s).set('expect.maxLength', 1)
    same(s)
    expect(v.validate({ s: 'ab' }, true)).toBe(false)
    expect(meta(s1).get('expect.maxLength')).toBe(3)
    expect(meta(s2).get('expect.maxLength')).toBe(3)
    meta(s).delete('expect.maxLength')
    same(s)
    expect(v.validate({ s: 'ab' }, true)).toBe(true)
  })

  it("an in-place append on a contributor's own list shows in the concatenation", () => {
    const { s1, s2, s, v } = merged()
    annotate(s1.metadata, 'expect.pattern', { pattern: '^a' }, true)
    expect(v.validate({ s: 'ab' }, true)).toBe(true)
    // (the own list exists: appended in place)
    annotate(s1.metadata, 'expect.pattern', { pattern: 'c$' }, true)
    annotate(s2.metadata, 'expect.pattern', { pattern: 'b' }, true)
    same(s)
    expect(meta(s).get('expect.pattern')).toEqual([
      { pattern: '^a' },
      { pattern: 'c$' },
      { pattern: 'b' },
    ])
    expect(v.validate({ s: 'ab' }, true)).toBe(false)
    expect(v.validate({ s: 'abc' }, true)).toBe(true)
  })

  it('a key registered as an append key later concatenates from then on', () => {
    const { s1, s } = merged()
    meta(s1).set('test.late', 'base')
    meta(s).set('test.late', 'own')
    expect(meta(s).get('test.late')).toBe('own')
    $ak('test.late')
    same(s)
    expect(meta(s).get('test.late')).toEqual(['base', 'own'])
  })

  it('size, keys, has and iteration order stay those of the layered read', () => {
    const { s1, s2, s } = merged()
    meta(s2).set('meta.label', 'L2')
    meta(s1).set('meta.description', 'd1')
    meta(s).set('meta.placeholder', 'p')
    same(s)
    expect([...meta(s).keys()]).toEqual([
      'meta.placeholder',
      'expect.maxLength',
      'meta.label',
      'meta.description',
    ])
    expect(meta(s).has('meta.description')).toBe(true)
    expect(meta(s).has('meta.required')).toBe(false)
    expect(metaEmpty(meta(s))).toBe(false)
  })

  it('the reference filter holds after a write below a reference layer', () => {
    const T = typeT({ 'meta.label': 'T' })
    const ref = $().ref(T).$type
    same(ref)
    meta(T).set('test.ro', true)
    meta(T).set('meta.description', 'd')
    same(ref)
    expect(meta(ref).has('test.ro')).toBe(false)
    expect([...meta(ref).keys()]).toEqual(['meta.label', 'meta.description'])
  })

  it("a raw swap of a node's metadata map, then invalidateCompiledValidators(): the new values are read", () => {
    const { s1, s2, s, v } = merged()
    expect(v.validate({ s: 'abcd' }, true)).toBe(false)
    s2.metadata = new AnnotationMap([['expect.maxLength', 10]]) as any
    s1.metadata = new Map([['expect.maxLength', 10]]) as any
    invalidateCompiledValidators()
    same(s)
    expect(meta(s).get('expect.maxLength')).toBe(10)
    expect(v.validate({ s: 'abcd' }, true)).toBe(true)
  })
})

/*
 * Diamond layer graphs: one node reached through a reference layer and directly. The fuzz below
 * builds random layer DAGs (node `i` layers over earlier nodes only, so diamonds are frequent).
 */

// plain, append, passedWhenReferred:false, both
const KEYS = ['meta.label', 'test.list', 'test.ro', 'test.ra']
const isAppend = (k: string) => k === 'test.list' || k === 'test.ra'
const isNr = (k: string) => k === 'test.ro' || k === 'test.ra'
const valueOf = (k: string, tag: string) => (isAppend(k) ? [tag] : tag)

/** A seeded PRNG (Park–Miller), `[0, 1)`. */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a * 48_271) % 2_147_483_647
    return (a - 1) / 2_147_483_646
  }
}

interface TSpec {
  bases: number[]
  r: boolean
  own: string[]
  intrinsic: string[]
}

type TNodes = Array<{ metadata: Map<unknown, unknown> }>

/** A random layer DAG of `n` nodes. */
function graph(rand: () => number, n: number): TSpec[] {
  const specs: TSpec[] = []
  for (let i = 0; i < n; i++) {
    const bases: number[] = []
    if (i > 0 && rand() < 0.8) {
      const count = 1 + Math.floor(rand() * Math.min(3, i))
      while (bases.length < count) {
        const b = Math.floor(rand() * i)
        if (!bases.includes(b)) {
          bases.push(b)
        }
      }
    }
    const own = KEYS.filter(() => rand() < 0.35)
    specs.push({ bases, r: rand() < 0.5, own, intrinsic: own.filter(() => rand() < 0.25) })
  }
  return specs
}

/** The nodes of `specs`; `plain`: leaves are plain maps (untracked: every read is live). */
function build(specs: TSpec[], plain: boolean): TNodes {
  const nodes: TNodes = []
  for (const [i, s] of specs.entries()) {
    const own = s.own.map(k => [k, valueOf(k, `${i}`)] as const)
    let m: Map<unknown, unknown>
    if (s.bases.length > 0) {
      m = new LayerMap(
        s.bases.map(b => nodes[b]),
        s.r,
        own
      )
    } else {
      m = plain ? new Map<unknown, unknown>(own) : new AnnotationMap<unknown, unknown>(own)
    }
    markIntrinsic(m, s.intrinsic)
    nodes.push({ metadata: m })
  }
  return nodes
}

/**
 * The path reference: the nodes whose own `k` a read of node `i` sees, in priority order (every
 * path down; a `passedWhenReferred: false` key filtered below a reference layer unless intrinsic).
 */
function seen(specs: TSpec[], i: number, k: string): number[] {
  const out: number[] = []
  const walk = (j: number, filtered: boolean) => {
    const s = specs[j]
    if (s.own.includes(k) && (!filtered || s.intrinsic.includes(k)) && !out.includes(j)) {
      out.push(j)
    }
    for (const b of s.bases) {
      walk(b, filtered || (s.r && isNr(k)))
    }
  }
  walk(i, false)
  return out
}

const read = (m: Map<unknown, unknown>) => ({
  entries: [...m.entries()],
  size: m.size,
  has: KEYS.map(k => m.has(k)),
  get: KEYS.map(k => m.get(k)),
})

/** Every node of `cached` reads as its live twin and as the path reference (checks made). */
function checkGraph(label: string, specs: TSpec[], cached: TNodes, live: TNodes): number {
  let checked = 0
  for (const [i, node] of cached.entries()) {
    const m = node.metadata
    expect(read(m), `${label} node ${i}`).toEqual(read(live[i].metadata))
    // (exact with a view; a live read may answer `false` for filtered-out entries only)
    expect(metaEmpty(m)).toBe(m.size === 0)
    if (metaEmpty(live[i].metadata)) {
      expect(m.size).toBe(0)
    }
    const keys = new Set(m.keys())
    for (const k of KEYS) {
      const at = seen(specs, i, k)
      const value = m.get(k)
      expect(m.has(k), `${label} node ${i} has ${k}`).toBe(at.length > 0)
      expect(keys.has(k), `${label} node ${i} keys ${k}`).toBe(at.length > 0)
      if (isAppend(k)) {
        const all = value === undefined ? [] : (value as string[])
        expect([...all].sort(), `${label} node ${i} ${k}`).toEqual(at.map(String).sort())
      } else {
        expect(value, `${label} node ${i} ${k}`).toBe(at.length > 0 ? `${at[0]}` : undefined)
      }
      checked++
    }
  }
  return checked
}

describe('diamond layer graphs (one node reached through a reference layer and directly)', () => {
  $ak('test.ra')
  $nr('test.ra', 'meta.required')

  it("X over [R, T], R a reference layer over T: X reads T's passedWhenReferred:false key", () => {
    const T = $().designType('string').tags('string').annotate('meta.required', true).$type
    meta(T).set('test.ro', 'T')
    const R = $().designType('string').tags('string').over([T], true).$type
    const X = $().designType('string').tags('string').over([R, T]).$type
    const Y = $().designType('string').tags('string').over([T, R]).$type
    for (const n of [X, Y]) {
      expect(meta(n).get('meta.required')).toBe(true)
      expect(meta(n).has('meta.required')).toBe(true)
      expect(meta(n).get('test.ro')).toBe('T')
      expect([...meta(n).keys()]).toEqual(['meta.required', 'test.ro'])
      expect(meta(n).size).toBe(2)
      expect(new Validator(n).validate('', true)).toBe(false)
    }
    // (through the reference layer alone: filtered)
    expect(meta(R).has('meta.required')).toBe(false)
    expect(meta(R).size).toBe(0)
  })

  it("an append key: a diamond's values once, the directly reached node's included", () => {
    const T = { metadata: new AnnotationMap<unknown, unknown>([['test.ra', ['t']]]) }
    const R = { metadata: new LayerMap([T], true, [['test.ra', ['r']]]) }
    const X = new LayerMap([R, T])
    const Y = new LayerMap([T, R])
    expect(X.get('test.ra')).toEqual(['t', 'r'])
    // (lowest priority first: R's values, then T's, reached directly)
    expect(Y.get('test.ra')).toEqual(['r', 't'])
    expect(R.metadata.get('test.ra')).toEqual(['r'])
  })

  it('fuzz: cached reads equal the live (uncached) reads and the path reference', () => {
    let checked = 0
    for (let seed = 1; seed <= 400; seed++) {
      const rand = rng(seed)
      const specs = graph(rand, 2 + Math.floor(rand() * 9))
      const cached = build(specs, false)
      const live = build(specs, true)
      checked += checkGraph(`seed ${seed}`, specs, cached, live)
      // (a write anywhere: the views are rebuilt)
      const at = Math.floor(rand() * specs.length)
      const k = KEYS[Math.floor(rand() * KEYS.length)]
      if (specs[at].own.includes(k)) {
        specs[at].own = specs[at].own.filter(x => x !== k)
        cached[at].metadata.delete(k)
        live[at].metadata.delete(k)
      } else {
        specs[at].own.push(k)
        cached[at].metadata.set(k, valueOf(k, `${at}`))
        live[at].metadata.set(k, valueOf(k, `${at}`))
      }
      checked += checkGraph(`seed ${seed} (after a write)`, specs, cached, live)
    }
    expect(checked).toBeGreaterThan(5000)
  })
})
