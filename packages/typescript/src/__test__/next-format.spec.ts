import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build, StructureModel, type AtscriptDoc } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { JsNextRenderer } from '../codegen'
import { Realm, type TRealmModule } from '../codegen/realm'
import { tsPlugin } from '../plugin'

/*
 * The generated structure: the generated modules print core's
 * `StructureModel`, so the runtime's nodes ARE the model's (identity, kinds, `?`), and the
 * constructs behave as MODEL.md says (references, aliases, `as`, extends, merges).
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const OPTS = { format: 'next' as const, jsonSchema: false as const }

async function load(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-next-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const names = Object.keys(files)
  const repo = await build({ rootDir: dir, entries: names, plugins: [tsPlugin(OPTS)] })
  const docs = names
    .map(f => repo.getDoc(`file://${path.join(dir, f)}`))
    .filter((d): d is AtscriptDoc => !!d)
  const modules = new Map<AtscriptDoc, TRealmModule>()
  for (const d of docs) {
    modules.set(d, new JsNextRenderer(d, OPTS, 'none').renderModule())
  }
  const realm = new Realm(modules).load()
  const model = new StructureModel(docs)
  const rt = realm.rt as unknown as { pendingStatements(): number }
  const cls = (name: string, file = names[0]) =>
    realm.classOf(docs.find(d => d.id.endsWith(`/${file}`))!, name) as any
  return { realm, model, docs, cls, pending: rt.pendingStatements(), modules }
}

/** The runtime child at a model step (a `X | null` union passed through). */
function child(n: any, s: string): any {
  let t = n?.type
  if (s.startsWith('|')) {
    return t?.items?.[Number(s.slice(1))]
  }
  while (t?.kind === 'union') {
    const items = t.items.filter((x: any) => x?.type?.designType !== 'null')
    if (items.length !== 1) {
      break
    }
    n = items[0]
    t = n.type
  }
  return s === '[]' ? t?.of : t?.props?.get(s)
}

/** Positions where the runtime's nodes and the model's disagree (identity, `?`). */
function compare(model: StructureModel, cls: (name: string, file?: string) => any) {
  const bad: string[] = []
  const nodeOf = new Map<string, unknown>()
  const locOf = new Map<unknown, string>()
  for (const decl of model.decls) {
    let root: unknown
    try {
      root = cls(decl.name, path.basename(decl.doc.id))
    } catch {
      continue
    }
    if (!root) {
      continue
    }
    const walk = (steps: string[], node: any) => {
      const pos = `${decl.name}.${steps.join('.')}`
      const loc = model.locAt(decl, steps)
      if (!node) {
        bad.push(`${pos}: no node`)
        return
      }
      const again = nodeOf.get(loc) === node
      if (nodeOf.has(loc) && !again) {
        bad.push(`${pos}: ${loc} is two nodes`)
      }
      nodeOf.set(loc, node)
      if (locOf.has(node) && locOf.get(node) !== loc) {
        bad.push(`${pos}: one node is ${locOf.get(node)} and ${loc}`)
      }
      locOf.set(node, loc)
      const last = steps[steps.length - 1]
      const slot = steps.length > 0 ? model.slotAt(decl, steps) : undefined
      if (slot && last !== '[]' && !last.startsWith('|') && !!slot.optional !== !!node.optional) {
        bad.push(`${pos}: optional`)
      }
      if (again || steps.length >= 5) {
        return
      }
      const def = model.defAt(decl, steps)
      for (const k of def?.uni ? [] : (def?.names?.() ?? [])) {
        walk([...steps, k], child(node, k))
      }
      for (let i = 0; i < (def?.size ?? 0); i++) {
        walk([...steps, `|${i}`], child(node, `|${i}`))
      }
    }
    walk([], root)
  }
  return bad
}

const ADDRESS = `export interface Address {
  @meta.label 'City'
  city: string
  zip?: string
  next?: Address
}
export interface Address2 {
  city?: string
  country?: string
}
`

const MAIN = `import { Address, Address2 } from './b'

export interface A {
  name?: string
  home?: Address
}

export interface B {
  @expect.maxLength 3
  name?: string
  home?: Address2
}

export interface H {
  m?: A & B
  m2?: A & B
  list?: Address[]
  u?: Address | null
  i?: A & {
    home?: {
      @meta.label 'in place'
      zip?: string
    }
  }
  n?: { x?: number } & { x?: boolean }
}

@meta.label 'P'
export type P = Address

export type Q = Address

export type M = A & B

export interface C extends A, B {
  own?: string
}

export interface N {
  next?: N
  v?: string
}

export interface D {
  next?: D
  w?: string
}

export interface R {
  r?: N & D
}

export annotate Address as X {
  @meta.label 'X'
  city

  @meta.label 'XN'
  next.zip
}

export type L = A.home
`

describe('format next: the runtime nodes are the structure model’s', () => {
  it('references, aliases, as copies, extends, named and inline merges, recursion', async () => {
    const { model, cls, pending } = await load({ 'a.as': MAIN, 'b.as': ADDRESS })
    expect(pending).toBe(0)
    expect(compare(model, cls)).toEqual([])
  })

  it('an import cycle with merges and as copies across it', async () => {
    const { model, cls, pending } = await load({
      'a.as': `import { B } from './b'
export interface A {
  b?: B
  x?: string
  m?: A & B
}
export annotate B as XB {
  @meta.label 'xb'
  x
}
`,
      'b.as': `import { A } from './a'
export interface B {
  a?: A
  @expect.maxLength 3
  x?: string
}
@meta.label 'pa'
export type PA = A
`,
    })
    expect(pending).toBe(0)
    expect(compare(model, cls)).toEqual([])
    expect(cls('XB').type.props.get('x').metadata.get('meta.label')).toBe('xb')
    expect(cls('PA', 'b.as').metadata.get('meta.label')).toBe('pa')
  })
})

describe('format next: what the constructs do (MODEL.md)', () => {
  it('a reference is a thin node over its type; a bare alias is its type; an annotated one a layer', async () => {
    const { cls } = await load({ 'a.as': MAIN, 'b.as': ADDRESS })
    const [A, Address, P, Q] = [cls('A'), cls('Address', 'b.as'), cls('P'), cls('Q')]
    const home = A.type.props.get('home')
    expect(home).not.toBe(Address)
    expect(home.type).toBe(Address.type)
    Address.metadata.set('meta.description', 'live')
    expect(home.metadata.get('meta.description')).toBe('live')
    home.metadata.set('meta.placeholder', 'local')
    expect(Address.metadata.has('meta.placeholder')).toBe(false)
    expect(Q).toBe(Address)
    expect(P.type).toBe(Address.type)
    expect(P.metadata.get('meta.label')).toBe('P')
    expect(P.metadata.get('meta.description')).toBe('live')
  })

  it('as: its own shells over its target, the rest is the target’s', async () => {
    const { cls } = await load({ 'a.as': MAIN, 'b.as': ADDRESS })
    const [X, Address] = [cls('X'), cls('Address', 'b.as')]
    expect(X.type.props.get('city').metadata.get('meta.label')).toBe('X')
    expect(Address.type.props.get('city').metadata.get('meta.label')).toBe('City')
    expect(X.type.props.get('zip')).toBe(Address.type.props.get('zip'))
    const nextZip = X.type.props.get('next').type.props.get('zip')
    expect(nextZip.metadata.get('meta.label')).toBe('XN')
    expect(Address.type.props.get('next').type.props.get('zip').metadata.has('meta.label')).toBe(
      false
    )
  })

  it('merges: one hidden class per module, single contributors are their node, later wins', async () => {
    const { cls } = await load({ 'a.as': MAIN, 'b.as': ADDRESS })
    const [A, B, H, M, C, R] = ['A', 'B', 'H', 'M', 'C', 'R'].map(n => cls(n))
    const m = H.type.props.get('m')
    expect(m.type).toBe(H.type.props.get('m2').type)
    expect(m.type.props.get('home').type).toBe(M.type.props.get('home').type)
    // a field only one member has is that member's node; several: a node over them
    expect(C.type.props.get('own')).toBeDefined()
    const name = m.type.props.get('name')
    expect(name).not.toBe(A.type.props.get('name'))
    expect(name.metadata.get('expect.maxLength')).toEqual({ length: 3 })
    expect(C.type.props.get('home').type).toBe(m.type.props.get('home').type)
    expect(m.type.props.get('home').type.props.get('zip')).toBe(
      cls('Address', 'b.as').type.props.get('zip')
    )
    // recursion refers to the hidden class
    const r = R.type.props.get('r')
    expect(r.type.props.get('next').type).toBe(r.type)
    // an in-place member is the highest contributor
    const i = H.type.props.get('i')
    expect(i.type.props.get('home').type.props.get('zip').metadata.get('meta.label')).toBe(
      'in place'
    )
    // unmergeable scalars: never
    expect(H.type.props.get('n').type.props.get('x').type.designType).toBe('never')
    expect(B.type.props.get('name').metadata.get('expect.maxLength')).toEqual({ length: 3 })
  })

  it('residue: chain refs through unions, never shapes, nullable merges, nested in-place operands', async () => {
    const { cls, pending } = await load({
      'a.as': `
interface A0 { u?: string }
interface A1 {
  @expect.minLength 2
  u?: string
}
interface B {
  @expect.maxLength 3
  u?: string
}
type U = A0 | A1
type M = U & B
interface C {
  v?: M.u
  w?: U.u
}
interface O { a?: string }
interface S {
  x?: string & O
  m?: { k?: string } & { k?: O }
}
interface N1 { p?: O | null }
interface N2 { p?: O | null }
interface N { n?: N1 & N2 }
type T59 = { w: string } & { f: O & ({ e: string } | { e: O }) & { g?: string } }
@meta.label 'P'
type P = O
type PM = P & B
`,
    })
    expect(pending).toBe(0)
    const [A0, A1, C, S, N, PM] = ['A0', 'A1', 'C', 'S', 'N', 'PM'].map(n => cls(n))
    // a chain ref through a union: a union of references to each branch's field (MODEL §11 Q2)
    const w = C.type.props.get('w')
    expect(w.type.kind).toBe('union')
    expect(w.type.items.map((i: any) => i.type)).toEqual([
      A0.type.props.get('u').type,
      A1.type.props.get('u').type,
    ])
    expect(w.type.items[1].metadata.get('expect.minLength')).toEqual({ length: 2 })
    const v = C.type.props.get('v')
    expect(v.type.items[1].metadata.get('expect.maxLength')).toEqual({ length: 3 })
    expect(v.type.items[1].metadata.get('expect.minLength')).toEqual({ length: 2 })
    // unmergeable shapes: never, keeping `?` (MODEL §5)
    expect(S.type.props.get('x').type.designType).toBe('never')
    expect(S.type.props.get('m').type.props.get('k').type.designType).toBe('never')
    expect(S.type.props.get('m').type.props.get('k').optional).toBe(true)
    // every contributor nullable: so is the merged field
    const p = N.type.props.get('n').type.props.get('p')
    expect(p.type.kind).toBe('union')
    expect(p.type.items[1].type.designType).toBe('null')
    // a named merge's root layers over its written operands (an annotated alias is its own)
    expect(PM.metadata.get('meta.label')).toBe('P')
    // an in-place operand of an in-place operand
    expect(cls('T59').type.props.get('f').type.kind).toBe('union')
  })

  it('a nullable chain ref (`P.id | null`, a nullable foreign key) stays a union with null', async () => {
    const { cls, pending } = await load({
      'a.as': `export interface I {
  id: number
  ownerId: P.id | null
  later?: (P.name | null)[]
}
export interface P {
  @meta.label 'P.id'
  id: number
  name: string
}
`,
    })
    expect(pending).toBe(0)
    const I = cls('I')
    const ownerId = I.type.props.get('ownerId')
    expect(ownerId.type.kind).toBe('union')
    const [item, nul] = ownerId.type.items
    expect([item.type.designType, nul.type.designType]).toEqual(['number', 'null'])
    expect(item.metadata.get('meta.label')).toBe('P.id')
    expect(item.ref.field).toBe('id')
    expect(I.type.props.get('later').type.of.type.kind).toBe('union')
    const v = I.validator()
    expect(v.validate({ id: 1, ownerId: null }, true)).toBe(true)
    expect(v.validate({ id: 1, ownerId: 2, later: ['a', null] }, true)).toBe(true)
    expect(v.validate({ id: 1, ownerId: 'x' }, true)).toBe(false)
  })

  it('an unmergeable merge is `never`, tagged `never` as a written `never` is (0.1.110)', async () => {
    const { cls } = await load({
      'a.as': `export interface A { a: string }
export interface B { a: number }
export type N = A & string
export interface I {
  y?: A & string
  z?: A & B
  n?: N
  u?: (A | string) & string[]
}
`,
    })
    const I = cls('I')
    const tags = (n: any) => [n.type.designType, [...(n.type.tags ?? [])]]
    for (const p of ['y', 'u']) {
      expect(tags(I.type.props.get(p)), p).toEqual(['never', ['never']])
    }
    expect(tags(I.type.props.get('z').type.props.get('a'))).toEqual(['never', ['never']])
    expect(tags(cls('N'))).toEqual(['never', ['never']])
  })
})
