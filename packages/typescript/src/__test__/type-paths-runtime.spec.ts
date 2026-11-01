import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import { isPhantomType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'

/*
 * Generated code of type paths (`v?: T.a.b`) through unions (MODEL §11 Q2, §15 CHAIN-1): the
 * field (one branch has the path) or a union of the fields (several), branches that dead-end
 * deeper skipped, nested unions flattened.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Builds `source` (one module) and imports its generated module. */
async function load(
  source: string,
  config: Partial<Parameters<typeof build>[0]> = {}
): Promise<Record<string, any>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'm.as'), source)
  const repo = await build({ rootDir: dir, entries: ['m.as'], plugins: [tsPlugin()], ...config })
  const diagnostics = await repo.diagnostics()
  const errors = [...diagnostics.values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const out of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, 'm.as.js'), out.content)
  }
  vi.resetModules()
  return import(path.join(dir, 'm.as.js'))
}

const types = `
interface I0 {
  @meta.label 'I0.h'
  h: string
}
interface I5 {
  @meta.label 'I5.h'
  h: number
}
interface I6 {
  other: string
}
interface I2 {
  work: I0
}
interface I3 {
  work: I5
}
interface I7 {
  work: I6
}
`

const label = (n: any) => n.metadata.get('meta.label')
const shape = (n: any) => [n.type.kind, n.type.designType, n.type.items?.length]
const branches = (n: any) => n.type.items.map((i: any) => [i.type.designType, label(i)])

describe('generated type paths through unions', () => {
  it('a prop typed by a nullable union: the field', async () => {
    const m = await load(`${types}
interface X {
  work?: I0 | null
}
export interface CH {
  v?: X.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect([v.type.designType, label(v)]).toEqual(['string', 'I0.h'])
    expect(m.CH.validator().validate({ v: 'a' }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: 1 }, true)).toBe(false)
  })

  it('a branch that dead-ends deeper is skipped', async () => {
    const m = await load(`${types}
type W = I2 | I7
export interface CH {
  v?: W.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect([v.type.designType, label(v)]).toEqual(['string', 'I0.h'])
  })

  it('nested unions are flattened: the union of the fields', async () => {
    const m = await load(`${types}
type U = I2 | I3
type UU = U | I7
export interface CH {
  v?: UU.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect(branches(v)).toEqual([
      ['string', 'I0.h'],
      ['number', 'I5.h'],
    ])
    expect(m.CH.validator().validate({ v: 1 }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: true }, true)).toBe(false)
  })

  it('a scalar merge with a field reached through a union merges that field', async () => {
    // (as the same merge through a type without the union, `w`; it was `never`)
    const m = await load(`${types}
type M0 = I2 | null
type M1 = I2
export interface CH {
  v?: M0.work.h & string.email
  w?: M1.work.h & string.email
}
`)
    const [v, w] = ['v', 'w'].map(k => m.CH.type.props.get(k))
    expect(shape(v)).toEqual(shape(w))
    expect(v.type.designType ?? v.type.items[0].type.designType).toBe('string')
    expect(m.CH.validator().validate({ v: 'a@b.c' }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: 'abc' }, true)).toBe(false)
  })
})

describe('generated type paths: one position, phantom (MODEL §15 POS-1, U4)', () => {
  it('the same declared field through several branches is one field', async () => {
    const m = await load(`${types}
interface I8 extends I2 {
  z: string
}
interface I4 {
  @meta.label 'I4.k'
  k: string
}
interface I9 {
  work: I0
}
type U = I2 | I7
type UU = U | I2
type D = I2 | I2
type M0 = I2 | null
type MM = M0 | I2
type X8 = I8 | I2
type DM = (I2 | I3) & I4
type V = I2 | I9
annotate V {
  @meta.description 'blkV'
  work.h
}
export interface CH {
  a?: UU.work.h
  b?: D.work.h
  c?: MM.work.h
  d?: X8.work.h
  e?: DM.k
  f?: V.work.h
}
`)
    for (const k of ['a', 'b', 'c', 'd']) {
      const v = m.CH.type.props.get(k)
      expect([k, v.type.kind, v.type.designType, label(v)]).toEqual([k, '', 'string', 'I0.h'])
    }
    const e = m.CH.type.props.get('e')
    expect([e.type.kind, label(e)]).toEqual(['', 'I4.k'])
    // (the same block on every branch: one field, with the block's annotation)
    const f = m.CH.type.props.get('f')
    expect([f.type.kind, label(f), f.metadata.get('meta.description')]).toEqual([
      '',
      'I0.h',
      'blkV',
    ])
  })

  it('a block on some branches only: the union of the fields', async () => {
    const m = await load(`${types}
interface I9 {
  work: I0
}
type U = I2 | I9
annotate I2 {
  @meta.description 'blkI2'
  work.h
}
export interface CH {
  v?: U.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect(
      v.type.items.map((i: any) => [i.type.designType, i.metadata.get('meta.description')])
    ).toEqual([
      ['string', 'blkI2'],
      ['string', undefined],
    ])
    // (validation does not depend on blocks)
    expect(m.CH.validator().validate({ v: 'a' }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: 1 }, true)).toBe(false)
  })

  it('a path naming several phantom fields is phantom, as one naming a phantom field', async () => {
    const m = await load(`
interface P0 {
  h: string
  p: phantom
}
interface P5 {
  h: number
  p: phantom
}
interface P2 {
  work: P0
}
interface P3 {
  work: P5
}
type U = P2 | P3
type M0 = P2 | null
export interface CH {
  x: string
  a?: U.work.p
  b?: M0.work.p
}
`)
    for (const k of ['a', 'b']) {
      expect([k, isPhantomType(m.CH.type.props.get(k))]).toEqual([k, true])
      expect(m.CH.validator().validate({ x: '1', [k]: 5 }, true)).toBe(false)
    }
    expect(Object.keys((buildJsonSchema(m.CH) as any).properties)).toEqual(['x'])
  })
})

describe('generated type paths: POS-1a, POS-1b, POS-1c (MODEL §15)', () => {
  it('POS-1a: a block on a step before the end field does not split it', async () => {
    const m = await load(`${types}
interface I9 {
  work: I0
}
interface J2 {
  work: I0
}
interface J9 {
  work: I0
}
type U = I2 | I9
type W = J2 | J9
annotate I2 {
  @meta.description 'blkI2'
  work
}
annotate J2 {
  @meta.description 'blkJ2'
  work.h
}
export interface CH {
  a?: U.work.h
  b?: W.work
}
`)
    const a = m.CH.type.props.get('a')
    expect([a.type.kind, a.type.designType, label(a)]).toEqual(['', 'string', 'I0.h'])
    expect(m.CH.type.props.get('b').type.kind).toBe('union')
  })

  it('POS-1b: a merged field reached through several branches is one field', async () => {
    const m = await load(`
interface A {
  @meta.label 'A.k'
  k: string
}
interface B {
  @meta.description 'B.k'
  k: string
}
interface C {
  c: string
}
interface E {
  e: string
}
type DM = (C | E) & A & B
type D2 = (A & B) | (A & B)
type X2 = C & A & B
type Y2 = E & A & B
type U2 = X2 | Y2
annotate X2 {
  @meta.label 'blkX2'
  k
}
export interface CH {
  a?: DM.k
  b?: D2.k
  c?: U2.k
}
`)
    for (const k of ['a', 'b']) {
      const v = m.CH.type.props.get(k)
      expect([
        k,
        v.type.kind,
        v.type.designType,
        label(v),
        v.metadata.get('meta.description'),
      ]).toEqual([k, '', 'string', 'A.k', 'B.k'])
    }
    // (a block on one of the merges: a union of the two fields)
    expect(branches(m.CH.type.props.get('c'))).toEqual([
      ['string', 'blkX2'],
      ['string', 'A.k'],
    ])
  })

  it('POS-1c: several phantom fields: their common phantom primitive, no field annotations', async () => {
    const m = await load(
      `
interface P0 {
  @meta.label 'P0.p'
  p: ui.action
  q: ui.action
}
interface P5 {
  @meta.label 'P5.p'
  p: ui.action
  q: ui.paragraph
}
interface P2 {
  work: P0
}
interface P3 {
  work: P5
}
type U = P2 | P3
export interface CH {
  x: string
  a?: U.work.p
  b?: U.work.q
}
`,
      {
        primitives: {
          ui: {
            type: 'phantom',
            isContainer: true,
            extensions: { paragraph: {}, action: {} },
          },
        },
      }
    )
    const [a, b] = ['a', 'b'].map(k => m.CH.type.props.get(k))
    expect([isPhantomType(a), a.type.designType, [...a.type.tags], label(a)]).toEqual([
      true,
      'phantom',
      ['action', 'ui'],
      undefined,
    ])
    // (different phantom primitives: plain `phantom`)
    expect([isPhantomType(b), [...b.type.tags]]).toEqual([true, ['phantom']])
  })
})

describe('generated distributed merged fields: the branch items layer over each contributor at the branch', () => {
  // (contributors whose type is the merge itself: their nodes at that branch — seeds 10116,
  // 10161, 9916; it had no layers)
  it('a contributor typed by the field merge itself (a named merge, extends)', async () => {
    const m = await load(`
export type P0 = I2
export type CQ2 = I3.next.next.next & I3
annotate P1 {
  @meta.label 'L34'
  next.home
}
export type P1 = I3
export interface I0 {
  k?: 'b'
}
@meta.label 'L2'
export interface I1 {
  work: I0
}
export interface I2 {
  c?: string
}
export interface I3 {
  home: (I1 | P0) & I0
  next?: I0 & I3
}
@meta.description 'D0'
export interface J1 {
  next?: (J1 | J0) & J2
}
export interface J0 {
  home: {
    t?: [string, number]
  }
}
export interface J2 {
  list: J0[]
}
annotate M0 {
  @meta.label 'L49'
  next
}
export type M0 = J1 & {
  b: string
}
export interface C0 extends M0, J1 {
}
`)
    const home = m.CQ2.type.props.get('home')
    expect(home.type.items.map((i: any) => label(i))).toEqual(['L2', undefined])
    const next = m.C0.type.props.get('next')
    expect(next.type.items.map((i: any) => i.metadata.get('meta.description'))).toEqual([
      'D0',
      undefined,
    ])
  })

  it('a block on an extends child: no merged recursion, a raw write shows through the branches', async () => {
    const m = await load(`
export type P0 = (I3)
export interface I1 {
  next?: (I0 | P0) & I1
}
export interface I3 extends I1 {
}
annotate P0 {
  @meta.label 'L39'
  next
}
export interface I0 {
  list?: {
    b: string
  }[]
}
`)
    m.I1.metadata.set('meta.label', 'E0')
    const next = m.I1.type.props.get('next')
    const inner = next.type.items[1].type.props.get('next')
    expect(inner.type.items.map((i: any) => i.metadata.get('meta.label'))).toEqual(['E0', 'E0'])
  })
})

/** Builds `files` (several modules) and imports the generated modules in `order`. */
async function loadFiles(
  files: Record<string, string>,
  order = Object.keys(files)
): Promise<{ modules: Record<string, any>; repo: Awaited<ReturnType<typeof build>> }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
  dirs.push(dir)
  for (const [f, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, f), text)
  }
  const repo = await build({ rootDir: dir, entries: Object.keys(files), plugins: [tsPlugin()] })
  const diagnostics = await repo.diagnostics()
  const errors = [...diagnostics.values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const out of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
  }
  vi.resetModules()
  const modules: Record<string, any> = {}
  for (const f of order) {
    modules[f] = await import(path.join(dir, `${f}.js`))
  }
  return { modules, repo }
}

describe('generated type paths: positions resolved with the blocks they depend on (review 29)', () => {
  const decls = [
    'interface K {\n  k: string\n}',
    'interface H {\n  x: K\n  y: string\n}',
    'interface J0 {\n  h: H\n}',
    'interface J2 {\n  work: J0\n}',
    'interface J9 {\n  work: J0\n}',
    'type U = J2 | J9',
    "annotate J2 {\n  @meta.label 'a'\n  work.h.x.k\n}",
    'interface Q {\n  x: K\n}',
    'export interface X {\n  v: U.work.h | Q\n}',
    'export interface Y {\n  p: X.v.x\n}',
    "annotate Y {\n  @meta.label 'w'\n  p.k\n}",
    'export interface Z {\n  z: Y.p.k\n}',
  ]

  it('a type path through one split by a block: the same module in any declaration order', async () => {
    for (const order of [decls, [...decls.slice(9), ...decls.slice(0, 9)]]) {
      const m = await load(order.join('\n'))
      const p = m.Y.type.props.get('p')
      // (three positions: H.x via J2, with J2's block below it; H.x via J9; Q.x)
      expect(p.type.items.map((i: any) => label(i.type.props.get('k')))).toEqual(['w', 'w', 'w'])

      // (two positions: K.k with J2's block, and K.k without it)
      const z = m.Z.type.props.get('z')
      expect(z.type.items.map((i: any) => label(i))).toEqual(['w', 'w'])
      expect(m.Z.validator().validate({ z: 'a' }, true)).toBe(true)
    }
  })

  it('a chain ref to a nullable field, and a block through the referrer', async () => {
    const m = await load(`
interface I0 {
  h: string
}
interface I2 {
  work: I0
}
interface I9 {
  work: I0
}
type U = I2 | I9
annotate I2 {
  @meta.label 'a'
  work.h
}
export interface X {
  v?: U.work | null
}
export interface Y {
  p: X.v
}
annotate Y {
  @meta.label 'w'
  p.h
}
interface Q {
  h: string
}
export interface V {
  q?: Q | null
}
export interface W {
  r: V.q
}
annotate W {
  @meta.label 'r'
  r.h
}
`)
    const p = m.Y.type.props.get('p')
    // (`p` is X.v's node: a union of U.work's two positions and null)
    expect(shape(p)).toEqual(['union', undefined, 2])
    const items = p.type.items[0].type.items
    expect(items.map((i: any) => label(i.type.props.get('h')))).toEqual(['w', 'w'])
    expect(m.Y.validator().validate({ p: { h: '1' } }, true)).toBe(true)
    expect(m.Y.validator().validate({ p: null }, true)).toBe(true)
    const r = m.W.type.props.get('r')
    expect(label(r.type.items[0].type.props.get('h'))).toBe('r')
    expect(label(m.V.type.props.get('q').type.items[0].type.props.get('h'))).toBeUndefined()
  })

  it("blocks in a module the path's module does not import: counted as the generated code loads them", async () => {
    const { modules, repo } = await loadFiles(
      {
        'a.as': `export interface I0 {
  @meta.label 'I0.h'
  h: string
}
export interface I2 {
  work: I0
}
export interface I9 {
  work: I0
}
`,
        'b.as': `import { I2 } from './a'
annotate I2 {
  @meta.label 'B'
  work.h
}
`,
        'u.as': `import { I2, I9 } from './a'
export type U = I2 | I9
`,
        'm.as': `import { U } from './u'
export interface X {
  v?: U.work.h
}
`,
      },
      ['a.as', 'b.as', 'u.as', 'm.as']
    )
    const v = modules['m.as'].X.type.props.get('v')
    expect(v.type.items.map((i: any) => label(i))).toEqual(['B', 'I0.h'])
    // (core: the same two fields)
    const diagnostics = await repo.diagnostics()
    const doc = repo.getDoc([...diagnostics.keys()].find(id => id.endsWith('m.as'))!)!
    const ref = [...doc.referred].find(t => (t.parentNode as any)?.hasChain)?.parentNode as any
    expect(doc.unwindRef(ref)?.fields?.length).toBe(2)
  })

  it('each branch of a split field validates with its own annotations', async () => {
    const m = await load(`
interface Address {
  city: string
}
export interface User {
  address: Address
}
export interface Admin extends User {
  role: string
}
type Member = Admin | User
annotate Admin {
  @expect.maxLength 3
  address.city
}
export interface X {
  c?: Member.address.city
}
`)
    const c = m.X.type.props.get('c')
    expect(c.type.items.map((i: any) => i.metadata.get('expect.maxLength')?.length)).toEqual([
      3,
      undefined,
    ])
    // ('abcdef' is valid for the User branch)
    expect(m.X.validator().validate({ c: 'abcdef' }, true)).toBe(true)
    expect(m.Admin.validator().validate({ role: 'r', address: { city: 'abcdef' } }, true)).toBe(
      false
    )
    expect(m.User.validator().validate({ address: { city: 'abcdef' } }, true)).toBe(true)
  })

  it('a block on a named distributed merge writes each branch; an `as` copy declared first', async () => {
    const m = await load(`
export annotate U1 as Cc0 {
  @meta.description 'c'
  q
}
export annotate U2 as Cc2 {
}
annotate Cc2 {
  @meta.label 'L'
  e
}
export type U1 = (C0 | C1) & {
  q?: string
}
annotate U1 {
  @meta.label 'b'
  q
}
export type U2 = C0 | null
export interface C0 {
  e?: string
}
export interface C1 {
  f?: string
}
`)
    expect(m.U1.type.items.map((i: any) => label(i.type.props.get('q')))).toEqual(['b', 'b'])
    expect(
      m.Cc0.type.items.map((i: any) => i.type.props.get('q').metadata.get('meta.description'))
    ).toEqual(['c', 'c'])
    expect(label(m.Cc2.type.items[0].type.props.get('e'))).toBe('L')
    expect(label(m.U2.type.items[0].type.props.get('e'))).toBeUndefined()
  })

  it('a chain into the items of a union of chains, read before they are filled in declaration order', async () => {
    const m = await load(`
export interface Y1 {
  p: X2.v.g
}
export interface X2 {
  v: X1.v
}
export interface X1 {
  v?: U0.work
}
export type U0 = C1 | C0
export interface C0 {
  work: I0
}
export interface C1 {
  work: I0
}
export interface I0 {
  @meta.label 'g'
  g: string
}
annotate C1 {
  @meta.label 'C1'
  work
}
`)
    expect(label(m.Y1.type.props.get('p'))).toBe('g')
    expect(m.Y1.validator().validate({ p: 'x' }, true)).toBe(true)
  })

  it('a chain through an `as` copy of a nullable type, declared before the types it walks', async () => {
    const m = await load(`
export interface X0 {
  v?: Cc0.work.g
  w?: Cc1.work.g
}
export annotate U2 as Cc0 {
}
export annotate U3 as Cc1 {
}
export type U2 = C0 | null
export type U3 = U0 | null
export type U0 = C1 | C0
export interface C0 {
  work?: I0
}
export interface C1 {
  work: I0
}
export interface I0 {
  @meta.label 'g'
  g: string
}
`)
    expect(label(m.X0.type.props.get('v'))).toBe('g')
    expect(label(m.X0.type.props.get('w'))).toBe('g')
    expect(m.X0.validator().validate({ v: 'x', w: 'y' }, true)).toBe(true)
  })
})
