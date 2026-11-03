import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { withLoadCheck } from '../codegen/js-next'
import { Realm } from '../codegen/realm'
import { tsPlugin } from '../plugin'
import { isPhantomType } from '../runtime/annotated-type'
import { pendingStatements } from '../runtime/blocks'
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

/** Every rotation of `decls` (declaration order is not semantics, MODEL §7). */
const rotations = (decls: string[]) =>
  decls.map((_, i) => [...decls.slice(i), ...decls.slice(0, i)])
/** The first item of a union node (`X | null`: X). */
const item0 = (n: any) => n.type.items[0]

describe('generated type paths: every read is a dependency, `as` copies inside their target (review 30)', () => {
  it('a chain through a union branch reads the branch class after its shells, in any declaration order', async () => {
    const decls = [
      'export interface X {\n  v: U.work.k\n}',
      'export interface I {\n  k: string\n}',
      'export interface A {\n  work: I\n}',
      'export interface B {\n  e: string\n}',
      'export type U = A | B',
      "annotate A {\n  @meta.label 'L'\n  work.k\n}",
    ]
    for (const order of rotations(decls)) {
      const m = await load(order.join('\n'))
      expect(label(m.X.type.props.get('v'))).toBe('L')
    }
  })

  it('a field split by a block on one branch: each item over its own position, in any declaration order', async () => {
    const decls = [
      'export interface K0 {\n  c0?: U0.work.g\n}',
      'export interface I1 {\n  g: string\n}',
      'export interface C0 {\n  work: I1\n}',
      'export interface C1 {\n  work: I1\n}',
      'export type U0 = C1 | C0',
      "annotate C1 {\n  @meta.label 'L'\n  work.g\n}",
    ]
    for (const order of rotations(decls)) {
      const m = await load(order.join('\n'))
      expect(m.K0.type.props.get('c0').type.items.map(label)).toEqual(['L', undefined])
    }
  })

  it('a chain through a chain ref under the split field: filled before a shell reads below it', async () => {
    const decls = [
      'export interface X {\n  v?: U.work.c.y\n}',
      'export interface H {\n  y: string\n}',
      'export interface I {\n  h: H\n  c?: U.work.h\n}',
      'export interface A {\n  work: I\n}',
      'export interface B {\n  work: I\n}',
      'export type U = A | B',
      "annotate A {\n  @meta.label 'L'\n  work.c.y\n}",
    ]
    for (const order of rotations(decls)) {
      const m = await load(order.join('\n'))
      expect(m.X.type.props.get('v').type.items.map(label)).toEqual(['L', undefined])
    }
  })

  it('an `as` copy referenced inside its target (`next?: X | null`): built, its shells inside the target', async () => {
    const decls = [
      "export annotate T as X {\n  @meta.label 'l'\n  next.y\n}",
      'export interface T {\n  next?: X | null\n  y: string\n}',
    ]
    for (const order of rotations(decls)) {
      const m = await load(order.join('\n'))
      expect([...m.T.type.props.keys()]).toEqual(['next', 'y'])
      expect(label(item0(m.X.type.props.get('next')).type.props.get('y'))).toBe('l')
      expect(label(m.X.type.props.get('y'))).toBeUndefined()
      // (T.next is X: X's own shells are there, T's own y is not X's)
      const tNext = item0(m.T.type.props.get('next'))
      expect(label(tNext.type.props.get('y'))).toBeUndefined()
      expect(label(item0(tNext.type.props.get('next')).type.props.get('y'))).toBe('l')
      expect(m.T.validator().validate({ y: 'a', next: { y: 'b', next: null } }, true)).toBe(true)
    }
  })

  it('an `as` copy referenced inside its target (`x?: X`): the same in any declaration order', async () => {
    const decls = [
      "export annotate T as X {\n  @meta.label 'l'\n  x\n}",
      'export interface T {\n  x?: X\n  y: string\n}',
    ]
    for (const order of rotations(decls)) {
      const m = await load(order.join('\n'))
      expect(label(m.X.type.props.get('x'))).toBe('l')
      expect(label(m.T.type.props.get('x'))).toBeUndefined()
      expect(label(m.T.type.props.get('x').type.props.get('x'))).toBe('l')
    }
  })

  it('a chain through an `as` copy of a type with blocks of its own and a nullable field', async () => {
    const decls = [
      'export interface X {\n  v: Cc.work.h\n  u: Cc.work\n}',
      "export annotate C as Cc {\n  @meta.label 'cp'\n  work.h\n}",
      'export interface C {\n  work: I | null\n}',
      'export interface I {\n  h: string\n  g: string\n}',
      "annotate C {\n  @meta.description 'D'\n  work.h\n  @meta.label 'CL'\n  work.g\n}",
    ]
    for (const order of rotations(decls)) {
      const m = await load(order.join('\n'))
      const v = m.X.type.props.get('v')
      expect([label(v), v.metadata.get('meta.description')]).toEqual(['cp', 'D'])
      expect(label(m.X.type.props.get('u'))).toBeUndefined()
    }
  })
})

describe('chain refs: the annotations core reads are the generated metadata (review 30)', () => {
  /** Builds `source`, imports it; per prop of X: core's annotations (blocks too) and the runtime's. */
  async function both(source: string) {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
    dirs.push(dir)
    writeFileSync(path.join(dir, 'm.as'), source)
    const repo = await build({ rootDir: dir, entries: ['m.as'], plugins: [tsPlugin()] })
    for (const out of await repo.generate({ format: 'js' })) {
      writeFileSync(path.join(dir, 'm.as.js'), out.content)
    }
    vi.resetModules()
    const m = await import(path.join(dir, 'm.as.js'))
    const doc = repo.getDoc(`file://${path.join(dir, 'm.as')}`)!
    const X = doc.nodes.find(n => n.id === 'X') as any
    const out: Record<string, [Record<string, unknown>, Record<string, unknown>]> = {}
    for (const [k, prop] of X.getDefinition().props) {
      const anns = doc.evalAnnotationsForNode(prop, prop.annotations, true) ?? []
      const core = Object.fromEntries(
        anns.map(a => [a.name, a.args[0]?.text.replace(/'/g, '') ?? true])
      )
      out[k] = [core, Object.fromEntries(m.X.type.props.get(k).metadata.entries())]
    }
    return out
  }
  const types = `
export interface Customer {
  name: string
}
export interface Order {
  customer: Customer
}
`

  it('the blocks of every type on the way; `passedWhenReferred: false` keys dropped either way', async () => {
    for (const source of [
      `${types}export interface X {\n  v: Order.customer.name\n}\nannotate Customer {\n  @meta.label 'C'\n  name\n}`,
      `${types}export interface X {\n  v: Order.customer.name\n}\nannotate Customer {\n  @meta.label 'C'\n  @meta.id\n  @meta.readonly\n  name\n}`,
      `${types.replace('  name: string', "  @meta.label 'C'\n  @meta.id\n  @meta.readonly\n  name: string")}export interface X {\n  v: Order.customer.name\n}`,
      `annotate Order {\n  @meta.label 'O'\n  customer.name\n}\nexport interface X {\n  v: Order.customer.name\n  w: Customer.name\n}${types}annotate Customer {\n  @meta.label 'C'\n  @meta.description 'CD'\n  name\n}`,
    ]) {
      for (const [core, runtime] of Object.values(await both(source))) {
        expect(core).toEqual(runtime)
      }
    }
  })
})

// Shapes the chain fuzzer found (fix 18c): each loads with nothing left waiting, as its model says.
describe('fuzz regressions', () => {
  it('a merge operand read through a placeholder its own builder fills: the merge is made in place later (751)', async () => {
    const before = pendingStatements()
    const m = await load(`export interface I0 {
  c1?: V0.next.next | null
  z0?: U0.work.c1.work & E9
}
export annotate C1 as R0 {
}
export interface C1 {
  work: I0
  next?: R0 | null
}
export interface C0 {
}
export type U0 = C1 | C0
export type V0 = C0 | C1
export interface E9 {
}`)
    expect(pendingStatements()).toBe(before)
    expect(m.I0.type.props.get('z0').type.kind).toBe('object')
  })

  it('a merge operand read through a placeholder filled later: filled first (845, 372)', async () => {
    const before = pendingStatements()
    const m = await load(`export interface H0 {
  z0?: U0.next.work.h & E9
}
export interface I0 {
  h: H0
}
export interface C0 {
  work?: I0
  next?: R0 | null
}
export interface C1 {
}
export type U0 = C0 | C1
export annotate C0 as R0 {

}
export interface E9 {
}`)
    expect(pendingStatements()).toBe(before)
    expect(m.H0.type.props.get('z0').type.kind).toBe('object')
  })

  it('a read through an `as` copy waits for the shells of the target it views (1447)', async () => {
    const m = await load(`export interface K0 {
  j?: string
}
export interface E9 {
}
export interface Y0 {
  p: X0.v.x
}
export interface I0 {
  h: H0
}
export interface C1 extends B0 {
}
export interface X0 {
  v: Cc0.work.h | null
}
export annotate C0 as Cc0 {
}
annotate C0 {
  @meta.label 'L2.0:3'
  work.h.x.j
  @meta.label 'L2.1:4'
  work.h.x
}
export type U1 = C1 | C0
export interface H0 {
  @meta.label 'H0.x:0'
  x?: K0
  z0?: U1.work.h & E9
}
export interface C0 extends B0 {
}
export interface B0 {
  work: I0
}`)
    expect(m.Y0.type.props.get('p').metadata.get('meta.label')).toBe('L2.1:4')
  })

  it("a block crossing what another file's block splits: a diagnostic on each, in generated code's scope (review 32)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
    dirs.push(dir)
    const files: Record<string, string> = {
      'm.as': `export interface H0 {
  y: string
  x?: U1.work.h
}
export interface I0 {
  h: H0
}
export interface A0 {
  work: I0
}
export interface B0 {
  work: I0
}
export type U0 = A0 | B0
export interface H1 {
  y: string
  x?: U0.work.h
}
export interface I1 {
  h: H1
}
export interface A1 {
  work: I1
}
export interface B1 {
  work: I1
}
export type U1 = A1 | B1`,
      'a0.as': `import { A0 } from './m'
annotate A0 {
  @meta.label 'a0'
  work.h.x.y
}`,
      'a1.as': `import { A1 } from './m'
annotate A1 {
  @meta.label 'a1'
  work.h.x.y
}`,
    }
    for (const [f, t] of Object.entries(files)) {
      writeFileSync(path.join(dir, f), t)
    }
    const repo = await build({ rootDir: dir, entries: Object.keys(files), plugins: [tsPlugin()] })
    const errors = [...(await repo.diagnostics()).entries()].flatMap(([id, ms]) =>
      ms.filter(m => m.severity === 1).map(m => `${path.basename(id)}: ${m.message}`)
    )
    expect(errors.sort()).toEqual([
      "a0.as: A block's path can't cross the type path it splits.",
      "a1.as: A block's path can't cross the type path it splits.",
    ])
  })

  it('a merge reading its own field for another (`c?: M0.s`) in an import cycle: built in order (review 33 mc11)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
    dirs.push(dir)
    const files: Record<string, string> = {
      'm1.as': `import { I0, I1 } from './m2'\nexport type M0 = I0 & I1\n`,
      'm2.as': `import { M0 } from './m1'\nexport interface I0 {\n  s: string\n  c?: M0.s\n}\nexport interface I1 {\n  @meta.label 'x'\n  s: string\n  c?: I0.s\n}\n`,
    }
    for (const [f, t] of Object.entries(files)) {
      writeFileSync(path.join(dir, f), t)
    }
    const repo = await build({ rootDir: dir, entries: Object.keys(files), plugins: [tsPlugin()] })
    // (the build loads the cycle from each module: nothing left waiting, or it throws)
    const out = await repo.generate({ format: 'js' })
    expect(out.map(o => path.basename(String(o.source))).sort()).toEqual(['m1.as', 'm2.as'])
  })

  it('a build loads every import cycle from each of its modules; other renders do not (CYCLE-GUARD-6, -7)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
    dirs.push(dir)
    const files: Record<string, string> = {
      'a.as': `import { B } from './b'\nexport interface A {\n  b?: B\n  x: string\n}\n`,
      'b.as': `import { A } from './a'\nexport interface B {\n  a?: A\n  y: string\n}\n`,
    }
    for (const [f, t] of Object.entries(files)) {
      writeFileSync(path.join(dir, f), t)
    }
    const loads = vi.spyOn(Realm.prototype, 'loadFrom')
    try {
      const repo = await build({ rootDir: dir, entries: Object.keys(files), plugins: [tsPlugin()] })
      await repo.generate({ format: 'js' })
      expect(loads).not.toHaveBeenCalled()
      const again = await build({
        rootDir: dir,
        entries: Object.keys(files),
        plugins: [tsPlugin()],
      })
      await withLoadCheck(() => again.generate({ format: 'js' }))
      // (from each module of the cycle)
      expect(loads.mock.calls.map(([d]) => path.basename(d.id)).sort()).toEqual(['a.as', 'b.as'])
    } finally {
      loads.mockRestore()
    }
  })

  /** The metadata `key` of every node a type path reaches at runtime (unions fanned out). */
  const reached = (root: any, path: string[], key: string) => {
    const objs = (n: any): any[] =>
      n.type.kind === 'union' ? n.type.items.flatMap(objs) : n.type.kind === 'object' ? [n] : []
    let ns = [root]
    for (const k of path) {
      ns = ns.flatMap(objs).flatMap(n => (n.type.props.has(k) ? [n.type.props.get(k)] : []))
    }
    return ns.map(n => n.metadata.get(key))
  }

  it('a type path through a named distributed merge with blocks of its own: an item per position (5689)', async () => {
    const m = await load(`export interface I0 { g: string }
export interface C0 { work?: I0 }
export interface C2 { work: I0 }
export interface C3 { work: I0 }
export type U1 = (C0 | C2) & { q: string }
export type U2 = U1 | C3
export interface X0 { v: U2.work.g }
annotate U1 {
  @meta.description 'L'
  work.g
}`)
    expect(reached(m.U2, ['work', 'g'], 'meta.description')).toEqual(['L', 'L', undefined])
    const v = m.X0.type.props.get('v')
    expect(v.type.items.map((i: any) => i.metadata.get('meta.description'))).toEqual([
      'L',
      undefined,
    ])
  })

  it("a type path through an `as` copy of a union: the copy's entries make a position of their own (1711)", async () => {
    const m = await load(`export interface H0 { y: string }
export interface I0 { h: H0 }
export interface C1 { work: I0 }
export interface C2 { }
export type U1 = C2 | C1
export annotate U1 as Cc0 {
  @meta.label 'cp'
  work.h.y
}
export interface X0 { w: Cc0.work.h | H0 }
export type Z0 = X0.w.y`)
    expect(m.Z0.type.items.map((i: any) => label(i))).toEqual(['cp', undefined])
  })

  it('in an import cycle, a read of a node waits for a shell stage through its `X | null` item (912876)', async () => {
    const { modules } = await loadFiles(
      {
        'a.as': `import { U1 } from './b'
export interface K1 { c0?: U1.work.h }
export interface H0 { }
`,
        'b.as': `import { H0 } from './a'
export interface I0 { h: H0 }
export interface C0 { work: I0 | null }
export interface C1 { work?: I0 }
export type U1 = C0 | C1
export interface X0 { v: U1.work }
export interface Y0 { p: X0.v.h }
annotate U1 {
  @meta.description 'D'
  work.h
}
`,
      },
      // (a.as first: b.as's statements wait for H0, X0.v's item read U1's `work` before the
      // stage cloning its `I0 | null` def ran)
      ['a.as', 'b.as']
    )
    const b = modules['b.as']
    expect(reached(b.X0, ['v', 'h'], 'meta.description')).toEqual(['D', 'D'])
    expect(b.Y0.type.props.get('p').metadata.get('meta.description')).toBe('D')
  })

  it('a merged scalar field typed by a chain through an `as` copy of its own merge, in an import cycle: filled later (gtop 7074)', async () => {
    const files = {
      'm0.as': `import { M0 } from './m1'
import { I2 } from './m2'
export interface I0 {
  c?: X0.s
}
export type B0 = I2
export annotate M0 as X0 {
}
`,
      'm1.as': `import { I0 } from './m0'
import { I2 } from './m2'
export interface L0 {
  s: string
}
@meta.label 'A0'
export type A0 = I2
export type M0 = I0 & I2
`,
      'm2.as': `import { B0 } from './m0'
import { A0, L0 } from './m1'
export interface I2 {
  @meta.label 's36'
  s: string
  c?: L0.s
}
`,
    }
    const before = pendingStatements()
    // (M0's builder read X0.s — X0 a copy of M0 — for its field c: it waited for itself)
    const { modules, repo } = await loadFiles(files, ['m0.as', 'm1.as', 'm2.as'])
    expect(pendingStatements()).toBe(before)
    const c = modules['m1.as'].M0.type.props.get('c')
    expect([c.type.designType, c.optional, label(c)]).toEqual(['string', true, 's36'])
    // (the build loads the cycle from each module: nothing left waiting)
    await withLoadCheck(() => repo.generate({ format: 'js' }))
  })

  it("a hidden merge's scalar field typed by a chain into the merge's own branch, in an import cycle: filled later (gtop 70)", async () => {
    const files = {
      'm0.as': `import { M0 } from './m1'
import { A1, I0 } from './m3'
export interface I1 {
  s: string
  f?: M0
}
export annotate I0 as X0 {
  @meta.label 'cp'
  s
}
annotate A1 {
  @meta.label 'b0'
  f.s
}
`,
      'm1.as': `import { B0 } from './m2'
import { I0 } from './m3'
@meta.label 'A0'
export type A0 = I0
export type M0 = B0 & A0
`,
      'm2.as': `import { A1, I2 } from './m3'
export type B0 = I2 | A1
`,
      'm3.as': `import { X0 } from './m0'
import { M0 } from './m1'
export interface I0 {
  @meta.label 's66'
  s: string
  f?: A1
  c?: M0.s
}
export interface I2 {
  s: string
  f?: X0
  c?: I0.s
}
@meta.label 'A1'
export type A1 = I2
`,
    }
    const before = pendingStatements()
    // (M0's first branch, a hidden merge, typed its field c by M0.|0.s: its builder read itself)
    const { modules, repo } = await loadFiles(files, ['m0.as', 'm1.as', 'm2.as', 'm3.as'])
    expect(pendingStatements()).toBe(before)
    const cs = modules['m1.as'].M0.type.items.map((i: any) => i.type.props.get('c'))
    expect(cs.map((c: any) => [c.type.designType, c.optional])).toEqual([
      ['string', true],
      ['string', true],
    ])
    await withLoadCheck(() => repo.generate({ format: 'js' }))
  })

  it("a type path through an `as` copy of an alias of `X | null`: read through the copy's own union (review 34 cntC2)", async () => {
    const m = await load(`export interface I0 {
  h?: string
}
export interface C1 {
  work?: I0
}
export type U1 = C1 | null
export annotate U1 as V1 {
  @meta.label 'Z'
  work.h
}
export type U2 = V1 | C1
export interface X1 {
  v: U2.work.h
}`)
    expect(m.X1.type.props.get('v').type.items.map((i: any) => label(i))).toEqual(['Z', undefined])
  })

  it('a merged scalar field typed by a type path naming several fields: a union of them, filled later (review 36)', async () => {
    // (I0.c's `V.s` names X0.s — X0 a copy of M0, whose builder makes c — and K.s: never `any`)
    const files = {
      'm.as': `export interface I2 {
  c?: string
  @meta.label 'S'
  s?: string
}
export interface I0 { c?: V.s }
export type M0 = I2 & I0
export annotate M0 as X0 {}
export interface K {
  @meta.label 'K'
  s?: string
}
export type V = X0 | K
`,
    }
    const { modules, repo } = await loadFiles(files, ['m.as'])
    const c = modules['m.as'].M0.type.props.get('c')
    expect(c.type.kind).toBe('union')
    expect(c.type.items.map((i: any) => [i.type.designType, label(i)])).toEqual([
      ['string', 'S'],
      ['string', 'K'],
    ])
    await withLoadCheck(() => repo.generate({ format: 'js' }))
  })

  // (the `X | null` item `I1.next.|0` is shelled by a stage of its own: the merge `I1 & I0` reads
  // it, and I1's deeper stage `next.|0.next` clones that merge's def — one statement for both
  // waited for itself: never ran, in one module and in an import cycle alike)
  const g4 = {
    i0: `export interface I0 {
  next?: (I1 & I0) | null
  c: string
}
annotate I0 {
  @meta.label 'L16'
  next.c
}
`,
    i1: `export interface I1 extends I0 {}
annotate I1 {
  @meta.label 'L25'
  next.next
}
`,
  }
  const g4check = (I0: any, I1: any) => {
    const at = (n: any, ...p: string[]) =>
      p.reduce((x, s) => (s[0] === '|' ? x.type.items[Number(s.slice(1))] : x.type.props.get(s)), n)
    expect(label(at(I0, 'next', '|0', 'c'))).toBe('L16')
    expect(label(at(I1, 'next', '|0', 'c'))).toBe('L16')
    expect(label(at(I1, 'next', '|0', 'next'))).toBe('L25')
    expect(I1.validator().validate({ c: 'x', next: { c: 'y', next: null } }, true)).toBe(true)
    expect(I1.validator().validate({ c: 'x', next: { c: 1 } }, true)).toBe(false)
  }

  it('an `X | null` item a merge reads is shelled before a deeper stage that clones the merge (4440)', async () => {
    const m = await load(`${g4.i0}${g4.i1}`)
    g4check(m.I0, m.I1)
  })

  it('… in an import cycle, from either module (4440, 382, 13156)', async () => {
    const files = {
      'a.as': `import { I1 } from './b'\n${g4.i0}`,
      'b.as': `import { I0 } from './a'\n${g4.i1}`,
    }
    for (const order of [
      ['a.as', 'b.as'],
      ['b.as', 'a.as'],
    ]) {
      const before = pendingStatements()
      const { modules, repo } = await loadFiles(files, order)
      expect(pendingStatements()).toBe(before)
      g4check(modules['a.as'].I0, modules['b.as'].I1)
      await withLoadCheck(() => repo.generate({ format: 'js' }))
    }
  })

  it('an item stage waits for the fills of the items it clones, in any declaration order (chainfuzz 929)', async () => {
    const decls = [
      "export interface Y1 {\n  p: X0.v\n}\nannotate Y1 {\n  @meta.description 'D'\n  p.e\n}",
      'export interface X0 {\n  v?: R0.next.next | H0\n}',
      "export interface C0 {\n  e?: string\n  next?: R0 | null\n}\nexport annotate C0 as R0 {\n  @meta.label 'rc'\n  next.e\n}",
      'export interface H0 {\n  y: string\n}',
    ]
    for (const order of [decls, [...decls].reverse()]) {
      const m = await load(order.join('\n'))
      const e = m.Y1.type.props.get('p').type.items[0].type.items[0].type.props.get('e')
      expect([e.metadata.get('meta.description'), label(e)]).toEqual(['D', 'rc'])
      expect(m.Y1.validator().validate({ p: { e: 'x', next: null } }, true)).toBe(true)
      expect(m.Y1.validator().validate({ p: { y: 's' } }, true)).toBe(true)
      expect(m.Y1.validator().validate({ p: { e: 1 } }, true)).toBe(false)
    }
  })

  // (I1's item stage `next.|0` clones the union `I0.next`, not I3's def: a read stopping at that
  // union reached I3, so in the import cycle the stage waited for I3's shells and I3's builder
  // for the stage — never ran, every class left a placeholder)
  it('in an import cycle, an item stage does not wait for the class its item is (4951)', async () => {
    const files = {
      'a.as': `import { I3 } from './b'
export interface I0 {
  b: string
  next?: I3 | null
}
export interface I1 extends I0 {
  k?: string
}
annotate I1 {
  @meta.label 'L22'
  next.b
}
`,
      'b.as': `import { I0, I1 } from './a'
export interface I3 extends I1, I0 {}
annotate I3 {
  @meta.label 'L21'
  k
}
`,
    }
    for (const order of [
      ['a.as', 'b.as'],
      ['b.as', 'a.as'],
    ]) {
      const before = pendingStatements()
      const { modules, repo } = await loadFiles(files, order)
      expect(pendingStatements()).toBe(before)
      const { I1 } = modules['a.as']
      const { I3 } = modules['b.as']
      for (const n of [I1, I3]) {
        expect(label(n.type.props.get('next').type.items[0].type.props.get('b'))).toBe('L22')
      }
      expect(label(I3.type.props.get('k'))).toBe('L21')
      expect(() => buildJsonSchema(I3)).not.toThrow()
      expect(I3.validator().validate({ b: 'x', next: { b: 'y', next: null } }, true)).toBe(true)
      expect(I3.validator().validate({ b: 'x', next: { b: 1 } }, true)).toBe(false)
      await withLoadCheck(() => repo.generate({ format: 'js' }))
    }
  })
})

describe('a type path split by blocks is one type for structure (MODEL §15 STRUCT-N3)', () => {
  const types = `export interface H { y?: string }
export interface I0 { h: H }
export interface I2 { work: I0 }
export interface I9 { work: I0 }
export type U = I2 | I9
export type Z = U.work.h
export interface X extends Z { q?: string }
export type ZH = Z & H
export interface P { k?: Z; next?: M }
export interface Q { k?: H; next?: M }
export type M = P & Q
`
  const block = `annotate I2 {
  @meta.label 'L'
  work.h
}
`
  const forms: Array<[string, Record<string, string>]> = [
    ['in the same file', { 'a.as': `${types}${block}` }],
    ['in another file', { 'a.as': types, 'b.as': `import { I2 } from './a'\n${block}` }],
  ]

  it.each(forms)(
    'the block %s: `extends` it, a merge with it, a recursive merge through it build as without it',
    async (_, files) => {
      const { modules, repo } = await loadFiles(files)
      const m = modules['a.as']
      // (at runtime the path is still its two positions, each with its blocks: POS-1)
      expect(m.Z.type.items.map((i: any) => label(i))).toEqual(['L', undefined])
      // (structure: one type — `extends` keeps the props, a merge is the type, no `never`)
      expect([...m.X.type.props.keys()]).toEqual(['y', 'q'])
      expect([m.ZH.type.kind, [...m.ZH.type.props.keys()]]).toEqual(['object', ['y']])
      expect([...m.M.type.props.get('k').type.props.keys()]).toEqual(['y'])
      const warnings = [...(await repo.diagnostics()).values()].flat()
      expect(warnings.filter(w => !/applies only in builds/.test(w.message))).toEqual([])
      const dts = (await repo.generate({ format: 'dts' })).find(o => o.fileName === 'a.as.d.ts')!
      expect(dts.content).toContain('export declare class X extends Z {\n  q?: string')
      // (its data type collapses; its descriptor is what the runtime holds, a union: STRUCT-N3-DTS)
      expect(dts.content).toContain('const type: TAtscriptTypeComplex<Z>')
    }
  )

  it.each(forms)(
    'the blocks %s: a merge of many split type paths is one object',
    async (_, files) => {
      const n = 15
      const parts = Array.from(
        { length: n },
        (_, i) => `export interface H${i} { y${i}?: string }
export interface I${i} { h: H${i} }
export interface A${i} { work: I${i} }
export interface B${i} { work: I${i} }
export type U${i} = A${i} | B${i}
export type Z${i} = U${i}.work.h
`
      ).join('')
      const big = `export type BIG = ${Array.from({ length: n }, (_, i) => `Z${i}`).join(' & ')}\n`
      const blocks = Array.from(
        { length: n },
        (_, i) => `annotate A${i} {\n  @meta.label 'L${i}'\n  work.h\n}\n`
      ).join('')
      const two = Object.keys(files).length > 1
      const { modules } = await loadFiles(
        two
          ? {
              'a.as': `${parts}${big}`,
              'b.as': `import { ${Array.from({ length: n }, (_, i) => `A${i}`).join(', ')} } from './a'\n${blocks}`,
            }
          : { 'a.as': `${parts}${big}${blocks}` }
      )
      const BIG = modules['a.as'].BIG
      expect([BIG.type.kind, BIG.type.props.size]).toEqual(['object', n])
    }
  )
})

describe('a type path split by blocks, as structure reads it (review 36, fix 18j)', () => {
  const labels = (n: any, p = '', out: string[] = []): string[] => {
    const v = n.metadata.get('meta.label')
    if (v !== undefined) {
      out.push(`${p || '.'}=${v}`)
    }
    if (n.type.kind === 'object') {
      for (const [k, x] of n.type.props) {
        labels(x, `${p}.${k}`, out)
      }
    } else if (n.type.items) {
      n.type.items.forEach((x: any) => labels(x, p, out))
    }
    return out.sort()
  }

  it('a merge with it: no position’s blocks, whatever the union’s order (F1, MODEL §15 STRUCT-N3-META)', async () => {
    const source = (members: string) => `export interface H { y?: string }
export interface K { kk?: number }
export interface I0 { h: H }
export interface J0 { h: K }
export interface I2 { work: I0 }
export interface I9 { work: I0 }
export interface I7 { work: J0 }
export type U = ${members}
export type Z = U.work.h
export type ZE = Z & { e?: string }
annotate I2 {
  @meta.label 'L'
  work.h
}
`
    for (const members of ['I2 | I9 | I7', 'I9 | I2 | I7', 'I7 | I2 | I9']) {
      const { modules } = await loadFiles({ 'a.as': source(members) })
      const m = modules['a.as']
      // (at runtime the path is its positions, I2's with its block: POS-1)
      expect(labels(m.Z)).toEqual(['.=L'])
      expect([m.ZE.type.kind, m.ZE.type.items.length, labels(m.ZE)]).toEqual(['union', 2, []])
    }
  })

  it('a named merge with it: over the declared field’s own node, as without the blocks (STRUCT-N3-META)', async () => {
    const source = `export interface H { y?: string }
export interface I0 {
  @meta.label 'F'
  h: H
}
export interface I2 { work: I0 }
export interface I9 { work: I0 }
export type U = I2 | I9
export type Z = U.work.h
export type ZE = Z & { e?: string }
export type WE = U.work.h & { e?: string }
`
    const block = `annotate I2 {
  @meta.description 'D'
  work.h.y
}
`
    for (const text of [source, `${source}${block}`]) {
      const m = (await loadFiles({ 'a.as': text })).modules['a.as']
      for (const t of [m.ZE, m.WE]) {
        expect([
          t.type.kind,
          labels(t),
          t.type.props.get('y').metadata.get('meta.description'),
        ]).toEqual(['object', ['.=F'], undefined])
      }
    }
  })

  it('its descriptor is typed as the runtime holds it, through aliases and copies (F2, STRUCT-N3-DTS)', async () => {
    const { modules, repo } = await loadFiles({
      'a.as': `export interface H { y?: string }
export interface I0 { h: H }
export interface I2 { work: I0 }
export interface I9 { work: I0 }
export type U = I2 | I9
export type Z = U.work.h
export type Z2 = Z
export annotate Z as ZC {
}
export interface X extends Z { q?: string }
annotate I2 {
  @meta.label 'L'
  work.h
}
`,
    })
    const dts = (await repo.generate({ format: 'dts' })).find(o => o.fileName === 'a.as.d.ts')!
    for (const name of ['Z', 'Z2', 'ZC']) {
      expect(modules['a.as'][name].type.kind).toBe('union')
      expect(dts.content).toContain(`const type: TAtscriptTypeComplex<${name}>`)
    }
  })

  it('`X | null` positions merged: nullable as without the blocks (F6)', async () => {
    const source = `export interface H { y?: string }
export interface J0 { h?: H | null }
export interface I0 { work: J0 }
export interface I1 { work: J0 }
export interface I2 { work: J0 }
export type U = I0 | I1 | I2
export type Z2 = U.work.h
export type M7 = Z2 & Z2
export type MH = Z2 & (H | null)
`
    const block = `annotate I0 {
  @meta.label 'B'
  work.h.y
}
annotate I1 {
  @meta.label 'C'
  work.h.y
}
`
    for (const text of [source, `${source}${block}`]) {
      const m = (await loadFiles({ 'a.as': text })).modules['a.as']
      for (const t of [m.M7, m.MH]) {
        expect(t.validator().validate(null, true)).toBe(true)
        expect(t.validator().validate({ y: 'a' }, true)).toBe(true)
      }
    }
  })

  it('positions of one type from different fields: one for structure, without blocks too (MODEL §15 STRUCT-N3-DEF)', async () => {
    const { modules } = await loadFiles({
      'a.as': `export interface H { y?: string }
export interface E { e?: string }
export interface A { h: H }
export interface B { h?: H }
export type U = A | B
export type Z = U.h
export type ZH = Z & H
export type ZE = Z & E
@meta.label 'P'
export type P = U.h
export type PE = P & E
`,
    })
    const m = modules['a.as']
    expect(m.Z.type.kind).toBe('union')
    expect([m.ZH.type.kind, m.ZE.type.kind, [...m.ZE.type.props.keys()]]).toEqual([
      'object',
      'object',
      ['y', 'e'],
    ])
    // (an annotated alias of it as a merge operand: its own annotations, the type's structure)
    expect([m.PE.type.kind, m.PE.metadata.get('meta.label')]).toEqual(['object', 'P'])
  })

  it('a field every contributor of which is the same split type path: that type, never `any`', async () => {
    const { modules } = await loadFiles({
      'a.as': `export interface H0 { y: string }
export interface H1 { y: number }
export interface J0 { h: H0 }
export interface J1 { h: H1 }
export interface I0 { work: J0 }
export interface I1 { work: J1 }
export interface I2 { work: J0 }
export type U = I0 | I2 | I1
export type Z = U.work.h
export interface A { z?: Z }
export interface B { z: Z }
export type M = A & B
annotate I2 {
  @meta.label 'L'
  work.h
}
`,
    })
    const z = modules['a.as'].M.type.props.get('z')
    expect([z.type.kind, z.type.items.length]).toEqual(['union', 3])
  })
})

describe('a type path naming several fields, as structure and the runtime read it (review 37, fix 18k)', () => {
  const labels = (n: any, p = '', out: string[] = []): string[] => {
    const v = n.metadata.get('meta.label')
    if (v !== undefined) {
      out.push(`${p || '.'}=${v}`)
    }
    if (n.type.kind === 'object') {
      for (const [k, x] of n.type.props) {
        labels(x, `${p}.${k}`, out)
      }
    } else if (n.type.items) {
      n.type.items.forEach((x: any) => labels(x, p, out))
    }
    return out.sort()
  }

  it('a merge with a group of several fields of one type: the type only, in every order (R1, STRUCT-N3-GROUP-META, STRUCT-N3-ALIAS)', async () => {
    const viaChain = (u: string) => `export interface H { y?: string }
export interface A {
  @meta.label 'F'
  h: H
}
export interface B { h: A.h }
export interface C { h: H }
export type U = ${u}
export type Z = U.h
export type ZE = Z & { e?: string }
`
    const viaAlias = (u: string) => `export interface H { y?: string }
@meta.label 'P'
export type P = H
export interface A { h: H }
export interface B { h: P }
export type U = ${u}
export type Z = U.h
export type ZE = Z & { e?: string }
export interface X extends Z { q?: string }
`
    for (const [source, label] of [
      [viaChain('C | B'), 'F'],
      [viaChain('B | C'), 'F'],
      [viaAlias('A | B'), 'P'],
      [viaAlias('B | A'), 'P'],
    ]) {
      const m = (await loadFiles({ 'a.as': source })).modules['a.as']
      // (the field's / alias's own label stays metadata on the type path's runtime items)
      expect(labels(m.Z)).toEqual([`.=${label}`])
      expect([m.ZE.type.kind, labels(m.ZE)]).toEqual(['object', []])
      if (m.X) {
        expect(labels(m.X)).toEqual([])
      }
    }
  })

  it('a type path naming several phantom fields: its descriptor is the one phantom node the runtime holds (R2, POS-1c, STRUCT-N3-DTS)', async () => {
    const { modules, repo } = await loadFiles({
      'a.as': `export interface A { act: phantom; n?: string }
export interface B { act: phantom; n?: string }
export type U = A | B
export type Za = U.act
export type Zn = U.n
`,
    })
    const dts = (await repo.generate({ format: 'dts' })).find(o => o.fileName === 'a.as.d.ts')!
    expect(modules['a.as'].Za.type.kind).toBe('')
    expect(dts.content).toContain('const type: TAtscriptTypeFinal<Za>')
    expect(modules['a.as'].Zn.type.kind).toBe('union')
    expect(dts.content).toContain('const type: TAtscriptTypeComplex<Zn>')
  })

  it('a nullable union merged with itself or another nullable type keeps `null` (R4)', async () => {
    const m = (
      await loadFiles({
        'a.as': `export interface H { y?: string }
export interface K { k?: string }
export interface A { h: H }
export interface D { h: H | null }
export type U = A | D
export type Z = U.h
export type ZZ = Z & Z
export type ZN = Z & (H | null)
export type W = H | (H | null)
export type WW = W & W
export type WN = W & (H | null)
export type V = (H | K | null) & (H | null)
export interface Q { w?: W & W }
`,
      })
    ).modules['a.as']
    for (const name of ['Z', 'ZZ', 'ZN', 'W', 'WW', 'WN', 'V']) {
      expect([name, m[name].validator().validate(null, true)]).toEqual([name, true])
      expect([name, m[name].validator().validate({}, true)]).toEqual([name, true])
    }
    expect(m.Q.validator().validate({ w: null }, true)).toBe(true)
  })

  it('two repositories holding documents of one id render their own documents (R3)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
    dirs.push(dir)
    const repoWith = async (label: string) => {
      writeFileSync(
        path.join(dir, 'm.as'),
        `export interface A {\n  @meta.label '${label}'\n  x: string\n}\n`
      )
      const repo = await build({ rootDir: dir, entries: ['m.as'], plugins: [tsPlugin()] })
      await repo.diagnostics()
      return repo
    }
    const one = await repoWith('ONE')
    const two = await repoWith('TWO')
    const js = async (repo: typeof one) => (await repo.generate({ format: 'js' }))[0].content
    const [b, a] = [await js(two), await js(one)]
    expect([a.includes("'ONE'") || a.includes('"ONE"'), a.includes('TWO')]).toEqual([true, false])
    expect([b.includes('ONE'), b.includes('TWO')]).toEqual([false, true])
  })
})
