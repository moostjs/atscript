import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { describe, expect, it } from 'vitest'

import { build } from './build'
import { FLATTEN_WEB, SELF_OPERAND, StructureModel, UNION_IN_RECURSIVE_MERGE } from './structure'

async function model(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'as-structure-'))
  for (const [f, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, f), text)
  }
  const repo = await build({ rootDir: dir, entries: Object.keys(files) })
  const docs = Object.keys(files).map(f => repo.getDoc(`file://${path.join(dir, f)}`)!)
  const m = new StructureModel(docs)
  const T = (name: string) => m.decls.find(d => d.name === name)!
  const steps = (p: string) => (p ? p.split('.') : [])
  const loc = (name: string, p = '') => m.locAt(T(name), steps(p))
  const entries = (target: string) =>
    m.blocks.filter(b => b.target.name === target).flatMap(b => b.entries)
  return { m, T, loc, entries }
}

describe('StructureModel: references (MODEL §1, §9 U1)', () => {
  it('a reference prop / element is a thin node of its own over its type; below it, the type’s nodes', async () => {
    const { loc } = await model({
      'a.as': `export interface T {
  x?: string
}
export interface A {
  p?: T
  q: T[]
}
export interface C {
  p?: T
}
export interface H {
  m?: A & C
}
export type P = T
`,
    })
    expect(loc('A', 'p')).not.toBe(loc('T'))
    expect(loc('A', 'p.x')).toBe(loc('T', 'x'))
    expect(loc('A', 'q.[]')).not.toBe(loc('T'))
    expect(loc('A', 'q.[].x')).toBe(loc('T', 'x'))
    // (two thin nodes: two contributors, so the merge's own node, typed by T's def)
    expect(new Set([loc('H', 'm.p'), loc('A', 'p'), loc('C', 'p')]).size).toBe(3)
    expect(loc('H', 'm.p.x')).toBe(loc('T', 'x'))
    // (a bare plain alias IS T — MODEL §10 D3)
    expect(loc('P')).toBe(loc('T'))
    expect(loc('P', 'x')).toBe(loc('T', 'x'))
  })
})

describe('StructureModel: merges (MODEL §5)', () => {
  const files = {
    'a.as': `export interface A {
  x?: string
  y?: string
}
export interface C {
  x?: string
  z?: string
}
export interface H {
  m?: A & C
}
export interface H2 {
  m?: A & C
}
export type M = A & C
export interface K extends A {
  k?: string
}
export interface KC extends A, C {
  kc?: string
}
`,
    'b.as': `import { A, C } from './a'
export interface H3 {
  m?: A & C
}
`,
  }

  it('a field one member has is that member’s node; several: the merge’s own, one merge per module', async () => {
    const { loc } = await model(files)
    expect(loc('H', 'm.y')).toBe(loc('A', 'y'))
    expect(loc('H', 'm.z')).toBe(loc('C', 'z'))
    expect(loc('H3', 'm.y')).toBe(loc('A', 'y'))
    expect(loc('H', 'm.x')).not.toBe(loc('A', 'x'))
    expect(loc('H', 'm.x')).not.toBe(loc('C', 'x'))
    expect(loc('H', 'm.x')).toBe(loc('H2', 'm.x'))
    expect(loc('H3', 'm.x')).not.toBe(loc('H', 'm.x'))
  })

  it('a named merge and an extends child are classes of their own', async () => {
    const { m, T, loc } = await model(files)
    expect(loc('M', 'x')).not.toBe(loc('H', 'm.x'))
    expect(loc('M', 'y')).toBe(loc('A', 'y'))
    expect(loc('K', 'x')).toBe(loc('A', 'x'))
    expect(loc('KC', 'x')).not.toBe(loc('A', 'x'))
    expect(loc('KC', 'z')).toBe(loc('C', 'z'))
    expect(m.defAt(T('M'), [])?.kind).toBe('class')
    expect(m.defAt(T('H'), ['m'])?.kind).toBe('merge')
    const ms = m.defAt(T('H'), ['m'])?.slot('x')
    expect(ms?.contributors?.length).toBe(2)
    expect(ms?.optional).toBe(true)
  })

  it('a named merge whose union operand distributes to one branch has that branch’s fields (§12 Q5)', async () => {
    // (r26 s7, fixture codegen-regressions MBU: the class read its fields from the union operand)
    const { loc } = await model({
      'a.as': `interface H {
  h: string
}
export type BU = H | string
export type MBU = BU & { x?: string }
`,
    })
    expect(loc('MBU', 'h')).toBe(loc('H', 'h'))
    expect(loc('MBU', 'x')).toBeDefined()
  })
})

describe('StructureModel: path overrides (MODEL §4)', () => {
  it('a referrer gets shells along its paths only, at that exact path', async () => {
    const { loc, entries } = await model({
      'a.as': `export interface Address {
  city?: string
  zip?: string
  next?: Address
}
export interface Client {
  address?: Address
  billing?: Address
}
annotate Client {
  @meta.label 'Home City'
  address.city
  @meta.label 'Billing City'
  billing.city
}
`,
    })
    expect(loc('Client', 'address.city')).not.toBe(loc('Address', 'city'))
    expect(loc('Client', 'billing.city')).not.toBe(loc('Client', 'address.city'))
    expect(loc('Client', 'address.zip')).toBe(loc('Address', 'zip'))
    expect(loc('Client', 'address.next')).toBe(loc('Address', 'next'))
    expect(loc('Client', 'address.next.city')).toBe(loc('Address', 'city'))
    // (address: Client's own node; its def is Address's: a shell def, then the child shelled)
    expect(entries('Client').map(e => e.kinds)).toEqual([[[0, 2]], [[0, 2]]])
  })

  it('a path through an inherited field shells the child (kind 1)', async () => {
    const { loc, entries } = await model({
      'a.as': `export interface P {
  name?: string
}
export interface Ch extends P {
  age?: number
}
annotate Ch {
  @meta.label 'N'
  name
}
`,
    })
    expect(loc('Ch', 'name')).not.toBe(loc('P', 'name'))
    expect(entries('Ch').map(e => e.kinds)).toEqual([[[1]]])
  })
})

describe('StructureModel: self-collapse (MODEL §8)', () => {
  it('only through references, arrays and `| null`; never through an intersection member', async () => {
    const { entries } = await model({
      'a.as': `export interface Meta {
  note?: string
}
export interface Node {
  name?: string
  next?: Node & Meta
  kids?: Node[]
  prev?: Node | null
  same?: Node & Node
}
annotate Node {
  @meta.label 'N'
  next.name
  @meta.description 'K'
  kids.name
  @expect.maxLength 3
  prev.name
  @meta.label 'S'
  same.name
}
`,
    })
    expect(entries('Node').map(e => e.paths)).toEqual([
      [['next', 'name']],
      [['name']],
      [['name']],
      [['name']],
    ])
  })
})

describe('StructureModel: a path through a union of objects (MODEL §9 U4)', () => {
  it('applies to every branch with the prop, as the annotated type’s own shells', async () => {
    const { m, loc, entries } = await model({
      'a.as': `export interface Email {
  kind?: string
  value?: string
}
export interface Phone {
  value?: string
  ext?: string
}
export interface Fax {
  number?: string
}
export interface Client {
  contact?: Email | Phone | Fax
}
annotate Client {
  @meta.label 'V'
  contact.value
}
`,
    })
    expect(entries('Client')[0].paths).toEqual([
      ['contact', '|0', 'value'],
      ['contact', '|1', 'value'],
    ])
    expect(loc('Client', 'contact.|0.value')).not.toBe(loc('Email', 'value'))
    expect(loc('Client', 'contact.|1.value')).not.toBe(loc('Phone', 'value'))
    expect(loc('Client', 'contact.|0.kind')).toBe(loc('Email', 'kind'))
    expect(m.errors).toEqual([])
  })

  it('no branch with the prop: an error', async () => {
    const { m } = await model({
      'a.as': `export interface Email {
  value?: string
}
export interface Client {
  contact?: Email | { n?: number }
}
annotate Client {
  @meta.label 'N'
  contact.ext
}
`,
    })
    expect(m.errors.map(e => e.message)).toEqual(['no branch of the union at "contact" has "ext"'])
  })

  it('a path into a `never` (an unmergeable merge) names nothing: an error (MODEL §12 B1)', async () => {
    const { m } = await model({
      'a.as': `export interface A {
  f: { d: string }
}
export interface B {
  f: number
  g?: null & { d: string }
  h?: (B & string) | B
}
export type S = A & B
export annotate S as X {
  @meta.label 'a'
  f.d
}
annotate S {
  @meta.label 'b'
  f.d
  @meta.label 'c'
  g.d
  @meta.label 'h'
  h.f
}
`,
    })
    expect(m.errors.map(e => e.message)).toEqual([
      'unknown path "f.d" of X',
      'unknown path "f.d" of S',
      'unknown path "g.d" of S',
    ])
    // (a `never` branch is no object: the path takes the other branch only, §12 Q6)
    const h = m.blocks.flatMap(b => b.entries).find(e => e.names.join('.') === 'h.f')
    expect(h?.paths).toEqual([['h', '|1', 'f']])
  })
})

describe('StructureModel: §6 compile errors (MODEL §6, §9 U5)', () => {
  it('a union operand of a merge on the recursion cycle', async () => {
    const { m } = await model({
      'a.as': `export interface I0 {
  y?: string
  next?: I0
}
export interface I2 {
  z?: string
  next?: I2
}
export interface I1 {
  y?: string
  next?: (I0 | I2) & I1
}
`,
    })
    expect(m.structureErrors().map(e => e.message)).toEqual([UNION_IN_RECURSIVE_MERGE])
  })

  it('not a union in an ordinary merge nested inside a recursive merge, nor at its top', async () => {
    const { m } = await model({
      'a.as': `export interface A {
  a?: string
}
export interface B {
  b?: string
}
export interface C {
  c?: string
}
export interface C2 {
  c2?: string
}
export interface N {
  next?: N
  u?: (A | B) & C
}
export interface D {
  next?: D
  u?: C2
}
export interface H {
  m?: N & D
  t?: (N | D) & C
}
`,
    })
    expect(m.structureErrors()).toEqual([])
  })
})

describe('StructureModel: static block order (MODEL §7)', () => {
  it('(import depth, module id, source order), whatever the load order', async () => {
    const { m } = await model({
      't.as': `export interface T {
  x?: string
}
`,
      'm.as': `import { T } from './t'
export interface MM {
  t?: T
}
annotate T {
  @meta.label 'M'
  x
}
`,
      'c.as': `import { T } from './t'
annotate T {
  @meta.label 'C'
  x
}
`,
      'a.as': `import { MM } from './m'
export interface AA {
  m?: MM
}
annotate MM {
  @meta.label 'A'
  t.x
}
`,
    })
    const order = m.orderedBlocks().map(b => `${path.basename(b.doc.id)}#${b.index}`)
    expect(order).toEqual(['c.as#0', 'm.as#0', 'a.as#0'])
    expect(
      Object.fromEntries(m.docs.map(d => [path.basename(d.id), m.ranks().get(d)!.depth]))
    ).toEqual({ 't.as': 0, 'm.as': 1, 'c.as': 1, 'a.as': 2 })
  })
})

describe('StructureModel: `annotate T as X` copies and chain refs (MODEL §8, §1)', () => {
  it('a copy shares T’s def, shelled where it has entries; a chain ref has the field’s def', async () => {
    const { m, T, loc, entries } = await model({
      'a.as': `export interface Address {
  city?: string
  zip?: string
}
export interface User {
  name?: string
  address?: Address
}
export annotate User as Form {
  @meta.label 'City'
  address.city
}
export type L = User.address
export interface H {
  c?: User.address
}
`,
    })
    expect(loc('Form')).not.toBe(loc('User'))
    expect(loc('Form', 'name')).toBe(loc('User', 'name'))
    expect(loc('Form', 'address')).not.toBe(loc('User', 'address'))
    expect(loc('Form', 'address.city')).not.toBe(loc('Address', 'city'))
    expect(loc('Form', 'address.zip')).toBe(loc('Address', 'zip'))
    expect(entries('Form').map(e => e.kinds)).toEqual([[[2, 2]]])
    expect(loc('L', 'city')).toBe(loc('Address', 'city'))
    expect(loc('H', 'c')).not.toBe(loc('User', 'address'))
    expect(m.defAt(T('H'), ['c'])?.key).toBe(m.defAt(T('User'), ['address'])?.key)
  })
})

describe('StructureModel: owner answers of P1 (MODEL §10)', () => {
  it('D1: an entry without annotations is ignored (no shell)', async () => {
    const { loc, entries } = await model({
      'a.as': `export interface Address {
  city?: string
  zip?: string
}
export interface Client {
  address?: Address
}
annotate Client {
  address.city
  @meta.label 'Z'
  address.zip
}
`,
    })
    expect(entries('Client').map(e => e.names.join('.'))).toEqual(['address.zip'])
    expect(loc('Client', 'address.city')).toBe(loc('Address', 'city'))
    expect(loc('Client', 'address.zip')).not.toBe(loc('Address', 'zip'))
  })

  it('D2: no self-collapse through a union branch', async () => {
    const { entries } = await model({
      'a.as': `export interface B {
  x?: string
}
export interface T {
  x?: string
  u?: T | B
}
annotate T {
  @meta.label 'L'
  u.x
}
`,
    })
    expect(entries('T')[0].paths).toEqual([
      ['u', '|0', 'x'],
      ['u', '|1', 'x'],
    ])
  })

  it('D3: a bare plain alias IS its target; D3b: an annotated alias is a thin node of its own', async () => {
    const { m, T, loc } = await model({
      'a.as': `export interface T {
  x?: string
}
export type P = T
export type PP = P
@meta.description 'own'
export type PA = T
export type PAP = PA
`,
    })
    expect(loc('P')).toBe(loc('T'))
    expect(loc('PP')).toBe(loc('T'))
    expect(loc('PA')).not.toBe(loc('T'))
    expect(loc('PAP')).toBe(loc('PA'))
    expect(loc('PA', 'x')).toBe(loc('T', 'x'))
    // (blocks on any plain alias target the type itself)
    expect(m.plainTarget(T('PAP'))).toBe(T('T'))
  })

  it('D4: a named merge that is an operand of itself is a compile error', async () => {
    const { m } = await model({
      'a.as': `export interface A {
  a?: string
  x?: X
}
export interface B {
  b?: string
}
export type X = A & X
export type Y = Z & A
export type Z = Y & B
export type OK = A & B
export type R = A & { next?: R }
`,
    })
    expect(m.structureErrors().map(e => `${e.node?.id}: ${e.message}`)).toEqual([
      `X: ${SELF_OPERAND}`,
      `Y: ${SELF_OPERAND}`,
      `Z: ${SELF_OPERAND}`,
    ])
  })
})

describe('StructureModel: flattening webs of recursive merges (MODEL §14 P5-1)', () => {
  /** The db entities of `source` whose flattening reaches a web (a cycle through ≥ 2 merges). */
  async function webs(files: Record<string, string>): Promise<string[]> {
    const { m } = await model(files)
    expect(m.structureErrors().filter(e => e.message === FLATTEN_WEB)).toHaveLength(
      m.flatWebs().length
    )
    return m.flatWebs().map(d => d.name)
  }

  it('a self-recursive merge is no web: it is cut', async () => {
    expect(
      await webs({
        'a.as': `export interface A { x?: string; next?: A & B }
export interface B { y?: string; next?: B }
export interface C { z?: string; c?: C & B }
@db.table 'h'
export interface H { a?: A; m?: A & B; c: C[] }
`,
      })
    ).toEqual([])
  })

  it('mutually recursive merges (round 21 R-F, round 22) are an error where a db entity reaches them', async () => {
    const n = 3
    let source = ''
    for (let i = 0; i < n; i++) {
      const [j, k] = [(i + 1) % n, (i + 2) % n]
      source += `export interface T${i} { v${i}?: string; a?: T${j} & T${k}; l?: T${j} & M${i} }\n`
      source += `export interface M${i} { m${i}?: string; n?: T${i} & M${j} }\n`
    }
    source += `@db.table 'root'\nexport interface Root { r?: T0 & T1 }\n`
    source += `@db.table 'leaf'\nexport interface Leaf { s?: string; t?: T0 }\n`
    source += `@db.table 'plain'\nexport interface Plain { s?: string }\n`
    // (the types themselves are only validated: no error)
    source += `export interface Other { r?: T0 & T1 }\n`
    expect(await webs({ 'a.as': source })).toEqual(['Root', 'Leaf'])
    expect(
      await webs({
        'a.as': `export interface T0 { v0?: string; a?: (T1 & T0) | null; l?: (T1 & M0)[] }
export interface M0 { m0?: string; n?: T0 & M1 }
export interface T1 { v1?: string; a?: (T0 & T1) | null; l?: (T0 & M1)[] }
export interface M1 { m1?: string; n?: T1 & M0 }
@db.table 'root'
export interface Root { r0?: T0 & M0 }
`,
      })
    ).toEqual(['Root'])
  })

  it('a merged prop typed by another merge that leads back (round 24 FLK); a merge of merges (big4)', async () => {
    expect(
      await webs({
        'a.as': `export interface A { x?: string; b?: B & C }
export interface C { x?: string; b?: C; a?: A & C }
@db.table 'b'
export interface B { x?: string; a?: A & C; b?: B }
`,
      })
    ).toEqual(['B'])
    let source = ''
    for (let i = 0; i < 3; i++) {
      source += `export interface A${i} { y?: string; next?: A${(i + 1) % 3}; alt?: A${(i + 1) % 3} }\n`
      source += `export interface B${i} { y?: string; next?: B${(i + 1) % 3}; alt?: B${(i + 2) % 3} }\n`
    }
    source += `export type M = A0 & B0\n@db.table 'h'\nexport interface H { m?: M }\n`
    expect(await webs({ 'a.as': source })).toEqual(['H'])
  })

  it('two self-recursions through one declaration are no web: no cycle passes both merges', async () => {
    // (X → `A1 & B1` → X and X → `C1 & D1` → X: going down, the readers cut at X again first)
    expect(
      await webs({
        'a.as': `export interface X { a?: A1 & B1; c?: C1 & D1 }
export interface A1 { x?: X }
export interface B1 { b?: string }
export interface C1 { x?: X }
export interface D1 { d?: string }
@db.table 't'
export interface T { x?: X }
`,
      })
    ).toEqual([])
  })

  it('across modules (fixture cycle-share, T1 a db table)', async () => {
    const dir = path.join(__dirname, '../../typescript/src/__test__/fixtures/cycle-share')
    const m0 = readFileSync(path.join(dir, 'm0.as'), 'utf8')
    const m1 = readFileSync(path.join(dir, 'm1.as'), 'utf8')
    expect(
      await webs({
        'm0.as': m0.replace('export interface T1 {', "@db.table 't1'\nexport interface T1 {"),
        'm1.as': m1,
      })
    ).toEqual(['T1'])
  })
})

describe('never warnings from the structure model (MODEL §5, P6)', () => {
  async function warnings(files: Record<string, string>) {
    const dir = mkdtempSync(path.join(tmpdir(), 'as-structure-'))
    for (const [f, text] of Object.entries(files)) {
      writeFileSync(path.join(dir, f), text)
    }
    const repo = await build({ rootDir: dir, entries: Object.keys(files) })
    const out: string[] = []
    for (const [id, ms] of await repo.diagnostics()) {
      for (const m of ms) {
        out.push(`${path.basename(id)}:${m.range.start.line}:${m.severity}:${m.message}`)
      }
    }
    return out.sort()
  }

  it('a scalar with nothing in common inside a distributed branch is reported (NW-BR)', async () => {
    const out = await warnings({
      'a.as': `export interface A0 {
  u?: string
}
export interface A1 {
  u?: number
}
export interface B {
  u?: string
}
export interface H {
  h?: (A0 | A1) & B
}`,
    })
    expect(out).toEqual([
      'a.as:9:2:Intersection of values with nothing in common cannot be merged at "H.h.u"; the type resolves to never',
    ])
  })

  it('a field through `| null` merging tuples of different lengths is reported', async () => {
    const out = await warnings({
      'a.as': `export interface A {
  t?: [string, number]
}
export interface B {
  t?: [string, number, string]
}
export interface H {
  m?: (A & B) | null
}`,
    })
    expect(out).toEqual([
      'a.as:6:2:Intersection of values with nothing in common cannot be merged at "H.m.t"; the type resolves to never',
    ])
  })

  it('a never is reported once, at the declaration whose merge makes it — not at references to it', async () => {
    const out = await warnings({
      'a.as': `export interface A {
  u?: string
}
export interface B {
  u?: number
}
export type M = A & B
export interface C {
  v?: M.u
  m?: M
}
export interface I extends M {
  z?: string
}`,
    })
    expect(out).toEqual([
      'a.as:6:2:Intersection of values with nothing in common cannot be merged at "M.u"; the type resolves to never',
    ])
  })

  it('a metadata-only block changes no warning (MODEL §14 N3)', async () => {
    const files = {
      'a.as': `export interface A {
  s?: { u?: string }
}
export interface B {
  s?: { u?: number }
}
export type M = A & B`,
    }
    const before = await warnings(files)
    const after = await warnings({
      ...files,
      'b.as': `import { A } from './a'
annotate A {
  @meta.label 'x'
  s.u
}`,
    })
    expect(before).toEqual([
      'a.as:6:2:Intersection of values with nothing in common cannot be merged at "M.s.u"; the type resolves to never',
    ])
    // (the block's own reachability warning aside)
    expect(after.filter(m => m.includes('cannot be merged'))).toEqual(before)
  })

  it('a block through a recursive merge reports no more positions (MODEL §14 N3, v5/96)', async () => {
    const files = {
      'a.as': `export interface A {
  t?: [string, number]
  next?: A & B
}
export interface B {
  t?: [string, string]
  next?: B
}`,
    }
    const before = await warnings(files)
    const after = await warnings({
      'a.as': `${files['a.as']}
annotate A {
  @meta.label 'x'
  next.next.t
}`,
    })
    expect(before.length).toBeGreaterThan(0)
    expect(after.filter(m => m.includes('cannot be merged'))).toEqual(before)
  })
})
