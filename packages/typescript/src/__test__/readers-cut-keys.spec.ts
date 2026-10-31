import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build, FLATTEN_WEB } from '@atscript/core'
import type { AtscriptDoc } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import type * as DefaultValue from '../runtime/default-value'
import type * as Flatten from '../runtime/flatten'
import type * as Serialize from '../runtime/serialize'
import { buildErrors, dtsFlat } from './dts-flat'

/*
 * One recursion cut for every reader (round-21 review, readers R-A … R-F; each failed before): a
 * node stands for the declarations it names — an intersection (merged or not) for its members',
 * an `annotate … as` override for the type it overrides — and is cut where all of them are on
 * the path already; an anonymous type is cut only where it is met again itself. The runtime
 * flatten, its deserialized copy, the build-time flatten (the `.d.ts` `static __flat`, the db layer's
 * columns) and default values agree, and none of them blows up on intersections of recursive
 * types.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The readers of the runtime the loaded modules use (`vi.resetModules` gives them a fresh one).
let flattenAnnotatedType: typeof Flatten.flattenAnnotatedType
let createDataFromAnnotatedType: typeof DefaultValue.createDataFromAnnotatedType
let serializeAnnotatedType: typeof Serialize.serializeAnnotatedType
let deserializeAnnotatedType: typeof Serialize.deserializeAnnotatedType

interface TLoaded {
  modules: Record<string, TAtscriptAnnotatedType>
  /** The build-time flatten of interface `name` (the paths of its `.d.ts` `static __flat`). */
  core: (name: string) => Map<string, unknown>
}

/** Builds `source` (one file) and loads its module. */
async function load(source: string): Promise<TLoaded> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-readers-keys-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'a.as'), source)
  const repo = await build({ rootDir: dir, entries: ['a.as'], plugins: [tsPlugin({})] })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const out of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
  }
  vi.resetModules()
  const modules = (await import(path.join(dir, 'a.as.js'))) as Record<string, any>
  ;({ flattenAnnotatedType } = await import('../runtime/flatten'))
  ;({ createDataFromAnnotatedType } = await import('../runtime/default-value'))
  ;({ serializeAnnotatedType, deserializeAnnotatedType } = await import('../runtime/serialize'))
  const doc = repo.getDoc(`file://${path.join(dir, 'a.as')}`) as AtscriptDoc
  const core = (name: string) => dtsFlat(doc, name, {}) ?? new Map<string, unknown>()
  return { modules, core }
}

/** The flattened paths of `type` (failing past `cap` fields: a recursion not cut). */
function runtimeKeys(type: TAtscriptAnnotatedType, cap = 20_000): string[] {
  let fields = 0
  const flat = flattenAnnotatedType(type as never, {
    onField: () => {
      if (++fields > cap) {
        throw new Error(`more than ${cap} fields`)
      }
    },
  })
  return [...flat.keys()].filter(Boolean).sort()
}

const payload = (type: TAtscriptAnnotatedType) => JSON.stringify(serializeAnnotatedType(type))
const deserialized = (type: TAtscriptAnnotatedType) =>
  deserializeAnnotatedType(JSON.parse(payload(type)))

/**
 * The layout of interface `name`: the runtime flatten, its deserialized copy's and the
 * build-time flatten agree (and a round trip serializes the same).
 */
function layout(loaded: TLoaded, name: string): string[] {
  const type = loaded.modules[name]
  const keys = runtimeKeys(type)
  const copy = deserialized(type)
  expect(runtimeKeys(copy), `${name} deserialized`).toEqual(keys)
  expect([...loaded.core(name).keys()].filter(Boolean).sort(), `${name} build-time`).toEqual(keys)
  expect(payload(copy), `${name} round trip`).toBe(payload(type))
  return keys
}

/** `createDataFromAnnotatedType` in example mode, live and deserialized alike, and valid. */
function example(type: TAtscriptAnnotatedType): unknown {
  const value = createDataFromAnnotatedType(type, { mode: 'example' })
  expect(createDataFromAnnotatedType(deserialized(type), { mode: 'example' })).toEqual(value)
  expect(type.validator({ unknownProps: 'ignore' }).validate(structuredClone(value), true)).toBe(
    true
  )
  return value
}

describe('the readers cut recursion by the declarations a node stands for (round 21)', () => {
  it('R-A: two anonymous objects of one shape are two types', async () => {
    const loaded = await load(`export interface Node {
  name: string
  m: {
    n?: Node
    k: string
  }
}
export interface H {
  p: {
    n?: Node
    k: string
  }
}
`)
    // (`p` is not `Node.m`: below `p.n` (a Node), `m.n` is the recursion — listed, not lost)
    expect(layout(loaded, 'H')).toEqual([
      'p',
      'p.k',
      'p.n',
      'p.n.m',
      'p.n.m.k',
      'p.n.m.n',
      'p.n.name',
    ])
    expect(layout(loaded, 'Node')).toEqual(['m', 'm.k', 'm.n', 'name'])
    expect(example(loaded.modules.H)).toEqual({ p: { n: { name: '', m: { k: '' } }, k: '' } })
  })

  it('R-B: an intersection alias reached as an array element or a union branch is walked', async () => {
    const loaded = await load(`export interface P {
  x?: string
}
export interface Q {
  self?: PQ
}
export type PQ = P & Q
export interface Holder {
  m: PQ
  ms?: PQ[]
  mn?: PQ | null
  mo?: PQ | P
}
`)
    expect(layout(loaded, 'Holder')).toEqual([
      'm',
      'm.self',
      'm.x',
      'mn',
      'mn.self',
      'mn.x',
      'mo',
      'mo.self',
      'mo.x',
      'ms',
      'ms.self',
      'ms.x',
    ])
  })

  it('R-C: intersections of recursive types are cut where the same type recurs', async () => {
    // (no web of merges — MODEL §14 P5-1: every merge here recurs only into itself — so the
    // readers' cut applies: a merge is cut where the same merge is expanded above it)
    const loaded = await load(`export interface A {
  name: string
  next?: A
  b?: B
}
export interface B {
  name: string
  next?: B
  a?: A
}
export type M = A & B
export interface H {
  m: A & B
  l: (A & B)[]
  n: M
}
`)
    const keys = layout(loaded, 'H')
    // (`m.next` is the merge again; below `m.a` (an A), `m.a.b.a` is)
    expect(keys.filter(k => k.startsWith('m'))).toEqual([
      'm',
      'm.a',
      'm.a.b',
      'm.a.b.a',
      'm.a.b.name',
      'm.a.b.next',
      'm.a.name',
      'm.a.next',
      'm.b',
      'm.b.a',
      'm.b.a.b',
      'm.b.a.name',
      'm.b.a.next',
      'm.b.name',
      'm.b.next',
      'm.name',
      'm.next',
    ])
    // (`n.next` is the merge `A & B` again, as `m`: below it, the same layout)
    expect(keys.filter(k => k.startsWith('n.next')).map(k => k.replace('n.next', 'm'))).toEqual(
      keys.filter(k => k.startsWith('m'))
    )
    // (the alias `M` is cut where `n: M` is)
    expect(runtimeKeys(loaded.modules.M)).toEqual(
      keys.filter(k => k.startsWith('n.')).map(k => k.slice(2))
    )
  })

  it('R-F: mutually recursive intersections: a compile error where a db table flattens them', async () => {
    // (each `T<i>` intersects the next two; generated by the review's `gen.py 4 am`: recursion
    // cycles through several distinct merges, a web — MODEL §14 P5-1; its flattening grows
    // exponentially with n)
    const n = 5
    let source = ''
    for (let i = 0; i < n; i++) {
      const [j, k] = [(i + 1) % n, (i + 2) % n]
      source += `export interface T${i} {\n  v${i}?: string\n  a?: T${j} & T${k}\n  l?: T${j} & M${i}\n}\n`
      source += `export interface M${i} {\n  m${i}?: string\n  n?: T${i} & M${j}\n}\n`
    }
    expect(
      await buildErrors({
        'a.as': `${source}@db.table 'root'\nexport interface Root {\n  r?: T0 & T1\n}\n`,
      })
    ).toEqual([FLATTEN_WEB])
    // (only validated, the types build and validate)
    const loaded = await load(`${source}export interface Root {\n  r?: T0 & T1\n}\n`)
    const validator = loaded.modules.Root.validator()
    expect(validator.validate({ r: { v0: 'x', v1: 'y', a: { v2: 'z' } } }, true)).toBe(true)
    expect(validator.validate({ r: { a: { v2: 1 } } }, true)).toBe(false)
  })

  it('R-E: an `annotate … as` override stands for the type it overrides', async () => {
    const loaded = await load(`export interface Node {
  name: string
  next?: Node
  kids?: Node[]
}
export annotate Node as NX {
  @meta.label 'nx-next-name'
  next.name
  @meta.label 'nx-kid-name'
  kids.name
}
export interface H {
  x: NX
}
export interface E extends NX {
  e?: string
}
export type NX2 = NX
export interface H2 {
  y?: NX2
}
`)
    const x = layout(loaded, 'H')
    // (`x.next` is Node, labelled: its `next` is the recursion, as in Node itself)
    expect(x).toEqual([
      'x',
      'x.kids',
      'x.kids.kids',
      'x.kids.name',
      'x.kids.next',
      'x.name',
      'x.next',
      'x.next.kids',
      'x.next.name',
      'x.next.next',
    ])
    expect(layout(loaded, 'E')).toEqual(['e', ...x.slice(1).map(k => k.slice(2))].sort())
    expect(layout(loaded, 'H2')).toEqual(x.map(k => `y${k.slice(1)}`))
  })

  it('an intersection distributed over a union member is walked like the runtime walks it', async () => {
    const loaded = await load(`export interface P {
  x?: string
  self?: P
}
export interface Q {
  q?: string
  pq?: P & Q
}
export interface A {
  a?: string
  next?: A & { extra?: string }
}
export interface B {
  b?: string
}
export interface C {
  c?: string
  cc?: C
}
export interface H {
  n?: (P | null) & Q
  dist?: (A | B) & C
}
`)
    // (`(P | null) & Q` is `P & Q`; `(A | B) & C` is `A & C | B & C`: build time had leaves)
    const keys = layout(loaded, 'H')
    expect(keys).toContain('n.self')
    expect(keys).toContain('dist.next.extra')
    expect(keys).toContain('dist.cc')
  })

  it('R-D: a value required below an optional prop leading back leaves the prop out', async () => {
    const loaded = await load(`export interface Address {
  city: string
  owner?: User
}
export interface User {
  home: Address
}
`)
    expect(example(loaded.modules.Address)).toEqual({ city: '' })
    expect(example(loaded.modules.User)).toEqual({ home: { city: '' } })
  })
})

describe('the readers, round 22', () => {
  it('FL: a recursive intersection alias reached by a chain or folded into by a block', async () => {
    // (no web of merges — MODEL §14 P5-1: every merge here recurs only into itself — so the
    // readers' cut applies: a merge is cut where the same merge is expanded above it)
    // (round 23: build-time flattening keyed those by node identity, one level deeper)
    const loaded = await load(`export interface A {
  y?: string
  next?: A
}
export interface B {
  y?: string
  next?: B
}
export type M = A & B
export interface C1 { z?: M.next & { q?: string } }
export interface C5 { w?: M.next }
export interface C { m?: M }
annotate C {
  @meta.label 'C'
  m.next.next.y
}
export interface C3 { m?: M }
annotate C3 {
  @meta.label 'C3'
  m.next.next.next.y
}
`)
    expect(layout(loaded, 'C1')).toEqual(['z', 'z.next', 'z.next.next', 'z.next.y', 'z.q', 'z.y'])
    expect(layout(loaded, 'C5')).toEqual(['w', 'w.next', 'w.y'])
    for (const name of ['C', 'C3']) {
      expect(layout(loaded, name)).toEqual(['m', 'm.next', 'm.next.next', 'm.next.y', 'm.y'])
    }
  })

  it('mutually recursive intersections: a compile error where a db table flattens them', async () => {
    // (`T0.a` is `T1 & T0`, `T1.a` is `T0 & T1`, …: recursion cycles through several distinct
    // merges, a web — MODEL §14 P5-1)
    const source = `export interface T0 {
  v0?: string
  a?: (T1 & T0) | null
  l?: (T1 & M0)[]
  o?: { p?: T0 & T1 }
}
export interface M0 {
  m0?: string
  n?: T0 & M1
}
export interface T1 {
  v1?: string
  a?: (T2 & T1) | null
  l?: (T2 & M1)[]
  o?: { p?: T1 & T2 }
}
export interface M1 {
  m1?: string
  n?: T1 & M2
}
export interface T2 {
  v2?: string
  a?: (T0 & T2) | null
  l?: (T0 & M2)[]
  o?: { p?: T2 & T0 }
}
export interface M2 {
  m2?: string
  n?: T2 & M0
}
`
    expect(
      await buildErrors({ 'a.as': `${source}@db.table 't'\nexport interface T {\n  t?: T2\n}\n` })
    ).toEqual([FLATTEN_WEB])
    expect(await buildErrors({ 'a.as': `@db.table 't0'\n${source}` })).toEqual([FLATTEN_WEB])
    expect(await buildErrors({ 'a.as': source })).toEqual([])
  })

  it('TUP: a tuple has its items’ sub-paths at build time too', async () => {
    const loaded = await load(`export interface Address {
  city: string
}
export interface T {
  t: [Address]
  u: [{ a: string }, Address]
  l: Address[]
  s: [string, number]
}
`)
    expect(layout(loaded, 'T')).toEqual(['l', 'l.city', 's', 't', 't.city', 'u', 'u.a', 'u.city'])
  })

  it('a reader of another runtime cuts like the runtime that built the type', async () => {
    const loaded = await load(`export interface A {
  name: string
  next?: A
  b?: B
}
export interface B {
  name: string
  next?: B
  a?: A
}
export interface H {
  m: A & B
  l: (A & B)[]
  r?: T0 & T1
}
export interface T0 {
  v0?: string
  a?: T1 & T2
}
export interface T1 {
  v1?: string
  a?: T2 & T0
}
export interface T2 {
  v2?: string
  a?: T0 & T1
}
`)
    const keys = layout(loaded, 'H')
    const value = createDataFromAnnotatedType(loaded.modules.H, { mode: 'example' })
    const payloadOf = payload(loaded.modules.H)
    // (another copy of the runtime — an ES module and a CommonJS build, duplicated packages —
    // reading the types this one built)
    vi.resetModules()
    const other = {
      flatten: await import('../runtime/flatten'),
      defaults: await import('../runtime/default-value'),
      serialize: await import('../runtime/serialize'),
    }
    expect(other.flatten.flattenAnnotatedType).not.toBe(flattenAnnotatedType)
    let fields = 0
    const flat = other.flatten.flattenAnnotatedType(loaded.modules.H as never, {
      onField: () => {
        if (++fields > 20_000) {
          throw new Error('more than 20000 fields')
        }
      },
    })
    expect([...flat.keys()].filter(Boolean).sort()).toEqual(keys)
    expect(
      other.defaults.createDataFromAnnotatedType(loaded.modules.H, { mode: 'example' })
    ).toEqual(value)
    expect(JSON.stringify(other.serialize.serializeAnnotatedType(loaded.modules.H))).toBe(payloadOf)
  })
})

describe('the readers, round 24: one keying rule, each source its own keys', () => {
  it('FLK: a merged prop typed by a merge that leads back to the first: an error for a db table', async () => {
    // (`B & C` holds `a: A & C`, which holds `b: B & C`; `A & B` holds `next: (A & B) & (B & A)`,
    // which is not `A & B` — two distinct merges on a recursion cycle, a web: MODEL §14 P5-1)
    const flk = `export interface A {
  x?: string
  b?: B & C
}
export interface C {
  x?: string
  b?: C
  a?: A & C
}
export interface B {
  x?: string
  a?: A & C
  b?: B
}
`
    const mutual = `export interface A {
  s?: string
  next?: A & B
}
export interface B {
  s?: string
  next?: B & A
}
`
    for (const source of [flk, mutual]) {
      expect(await buildErrors({ 'a.as': `@db.table 'a'\n${source}` })).toEqual([FLATTEN_WEB])
      expect(await buildErrors({ 'a.as': source })).toEqual([])
    }
  })

  it('IPK: a reference inside a member written in place keys by its declaration, overridden or not', async () => {
    // (no web of merges — MODEL §14 P5-1: every merge here recurs only into itself — so the
    // readers' cut applies: a merge is cut where the same merge is expanded above it)
    const source = `export interface T3 {
  t?: string
  b?: T3
}
export interface Q {
  q?: string
  b?: Q
}
export interface P {
  b?: Q & { b?: T3 }
}
`
    const want = ['b', 'b.b', 'b.b.b', 'b.b.q', 'b.b.t', 'b.q']
    expect(layout(await load(source), 'P')).toEqual(want)
    const overridden = await load(`${source}annotate P {\n  @meta.label 'o'\n  b.b.t\n}\n`)
    expect(layout(overridden, 'P')).toEqual(want)
    const self = await load(`export interface T3 {
  t?: string
  b?: T3
}
export interface T0 {
  x?: string
  b?: T0 & { b?: T3 }
}
annotate T0 {
  @meta.label 'T0.b.b.t'
  b.b.t
}
export interface H {
  h?: T0
  g?: T0 & T3
}
annotate H {
  @meta.label 'H.h.b.b.b.t'
  h.b.b.b.t
}
`)
    expect(layout(self, 'H')).toEqual([
      'g',
      'g.b',
      'g.b.b',
      'g.b.b.b',
      'g.b.b.t',
      'g.b.b.x',
      'g.b.t',
      'g.b.x',
      'g.t',
      'g.x',
      'h',
      'h.b',
      'h.b.b',
      'h.b.b.b',
      'h.b.b.b.b',
      'h.b.b.b.t',
      'h.b.b.b.x',
      'h.b.b.t',
      'h.b.b.x',
      'h.b.x',
      'h.x',
    ])
  })

  it('DID: an annotated alias sharing its target’s def keeps its own id in a deserialized copy', async () => {
    // (r26 P5 close, v5/148: the alias reached inside its target was written as a bare `$ref` to the
    // target and read back as the target itself — its id lost, the copy cut one level early)
    const loaded = await load(`export interface I1 {
  c?: string
  kids?: L0
}
export type L0 = I2[]
export interface I2 {
  list?: P0[] | null
}
@meta.readonly
export type P0 = (I1)
`)
    expect(layout(loaded, 'I1')).toEqual([
      'c',
      'kids',
      'kids.list',
      'kids.list.c',
      'kids.list.kids',
    ])
    const copy = deserialized(loaded.modules.I1) as any
    expect(
      copy.type.props.get('kids').type.of.type.props.get('list').type.items[0].type.of.id
    ).toBe('P0')
  })

  it('ASM: an `annotate … as` alias of a merge keys its overrides by what they override', async () => {
    const loaded = await load(`export interface A {
  y?: string
  next?: A
}
export interface B {
  y?: string
  b?: B
}
export type M = A & B
export annotate M as N {
  @meta.label 'N.next.y'
  next.y
}
export interface H {
  n?: N
}
`)
    expect(layout(loaded, 'H')).toEqual([
      'n',
      'n.b',
      'n.b.b',
      'n.b.y',
      'n.next',
      'n.next.next',
      'n.next.y',
      'n.y',
    ])
  })

  it('AR: an intersection of arrays flattens as the array of its elements’ merge', async () => {
    const loaded = await load(`export interface A {
  a: string
}
export interface B {
  b: number
}
export type L = A[]
export interface H1 {
  l: A[] & B[]
}
export interface H6 {
  l2: L & B[]
}
`)
    expect(layout(loaded, 'H1')).toEqual(['l', 'l.a', 'l.b'])
    expect(layout(loaded, 'H6')).toEqual(['l2', 'l2.a', 'l2.b'])
  })

  it('a merge alias is its members in a merge: written either way, one layout', async () => {
    const loaded = await load(`export interface A {
  y?: string
  next?: A
}
export interface B {
  y?: string
  next?: B
}
export type M = A & B
export type P = M
export interface C2 { z?: M & { q?: string } }
export interface C3 { z?: P & { q?: string } }
export interface C4 { z?: (A & B) & { q?: string } }
`)
    const want = layout(loaded, 'C4')
    expect(layout(loaded, 'C2')).toEqual(want)
    expect(layout(loaded, 'C3')).toEqual(want)
  })

  it('CAP-MISC: no depth cap — a chain of 400 types flattens to its end at build time too', async () => {
    const lines: string[] = []
    for (let i = 0; i < 400; i++) {
      lines.push(`export interface A${i} {\n  y?: string\n  next?: A${i + 1}\n}`)
    }
    lines.push('export interface A400 {\n  y?: string\n}')
    const keys = layout(await load(lines.join('\n')), 'A0')
    expect(keys).toHaveLength(801)
    expect(keys).toContain(`${'next.'.repeat(400)}y`)
  })
})

describe('the readers, round 26 (P5): a node is its declaration, else its def', () => {
  it('MKEY: a merge alias and the same merge written in place flatten alike, as on 0.1.110', async () => {
    const loaded = await load(`export interface A {
  y?: string
  next?: A
}
export interface B {
  z?: string
}
export type M = A & B
export type P = (A & B)
export type M2 = M
export interface H {
  m?: M
  n?: A & B
  p?: P
  q?: M2
  r?: M | null
  s?: M[]
  t?: (A & B)[]
}
`)
    const keys = layout(loaded, 'H')
    // (a merge is not its operands: `next` is A, expanded once below the merge, then cut)
    const want = ['', '.next', '.next.next', '.next.y', '.y', '.z']
    for (const p of ['m', 'n', 'p', 'q', 'r', 's', 't']) {
      expect(keys.filter(k => k === p || k.startsWith(`${p}.`))).toEqual(want.map(w => p + w))
    }
    expect(example(loaded.modules.H)).toMatchObject({ n: { next: {} } })
  })

  it('DEEP: a chain of 4000 types — flatten, JSON schema, payload, example data', async () => {
    const lines: string[] = []
    for (let i = 0; i < 4000; i++) {
      lines.push(`export interface A${i} {\n  y?: string\n  next?: A${i + 1}\n}`)
    }
    lines.push('export interface A4000 {\n  y?: string\n}')
    const loaded = await load(lines.join('\n'))
    const type = loaded.modules.A0
    expect(runtimeKeys(type)).toHaveLength(8001)
    expect(runtimeKeys(deserializeAnnotatedType(serializeAnnotatedType(type)))).toHaveLength(8001)
    const { buildJsonSchema } = await import('../runtime/json-schema')
    expect(Object.keys((buildJsonSchema(type) as { $defs: object }).$defs)).toHaveLength(4000)
    expect(createDataFromAnnotatedType(type, { mode: 'example' })).toBeTruthy()
  }, 60_000)
})
