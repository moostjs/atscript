import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import { defineAnnotatedType as $n, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { $blk, $f } from '../runtime/blocks'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator } from '../runtime/validator'

/*
 * One merge (the core's) whatever the size of a schema (round 22): an intersection a merge does
 * not inline — recursive, repeated, over the merge budget — is a merge state, merged at build
 * time by the same rule as a small merge (scalar and literal narrowing, unions distributed,
 * tuples, `never` shapes, optional flags), its members' type-level annotations linked live, no
 * depth limit, one per place it is reached at (a runtime edit of one place does not reach
 * another), compiled like any type. Each `describe` is a class of the round-22 review; each test
 * failed before.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type TModules = Record<string, any>

/** Builds `files`, loads their modules in `order` (a fresh runtime). */
async function load(
  files: Record<string, string>,
  opts: { compiled?: boolean; order?: string[]; jsonSchema?: false | 'lazy' } = {}
): Promise<{ m: TModules; js: Record<string, string>; warnings: string[] }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-states-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [
      tsPlugin({
        jsonSchema: opts.jsonSchema ?? 'bundle',
        compileValidators: !!opts.compiled,
      }),
    ],
  })
  const messages = [...(await repo.diagnostics()).values()].flat()
  expect(messages.filter(m => m.severity === 1).map(m => m.message)).toEqual([])
  const js: Record<string, string> = {}
  for (const out of await repo.generate({ format: 'js' })) {
    js[path.basename(out.source)] = out.content
    writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
  }
  vi.resetModules()
  const m: TModules = {}
  for (const name of opts.order ?? Object.keys(files)) {
    Object.assign(m, await import(path.join(dir, `${name}.js`)))
  }
  return {
    m,
    js,
    warnings: messages.filter(m => m.severity === 2).map(m => m.message),
  }
}

/** MODEL §6 (+ §9 U5): a union operand of a merge on a recursion cycle is a compile error. */
const UNIREC = 'union members are not supported in recursive merges; split with named types'

/** The error messages of building `files` (MODEL §6 errors are diagnostics: nothing loads). */
async function buildErrors(files: Record<string, string>): Promise<string[]> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-states-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const repo = await build({ rootDir: dir, entries: Object.keys(files), plugins: [tsPlugin()] })
  return [...(await repo.diagnostics()).values()]
    .flat()
    .filter(m => m.severity === 1)
    .map(m => m.message)
}

/** The nodes at a dotted path (`[]` an element; a union / intersection: each item having it). */
function at(type: any, dotted: string): any[] {
  let nodes = [type]
  for (const step of dotted.split('.').filter(Boolean)) {
    nodes = nodes.flatMap(function into(node: any): any[] {
      const def = node.type
      if (step === '[]') {
        return def.kind === 'array' ? [def.of] : []
      }
      if (def.kind === 'object') {
        return def.props.has(step) ? [def.props.get(step)] : []
      }
      return def.kind === 'union' || def.kind === 'intersection' ? def.items.flatMap(into) : []
    })
  }
  return nodes
}

/** `key` at a dotted path (`|`-joined when several nodes are there, `-` when unset). */
function meta(type: unknown, dotted: string, key = 'meta.label'): string {
  return at(type, dotted)
    .map(n => {
      const v = n.metadata.get(key)
      return v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    })
    .join('|')
}

/** The kind (with a design type, a literal) of the nodes at a dotted path. */
const kind = (type: unknown, dotted: string) =>
  at(type, dotted)
    .map(
      n =>
        n.type.kind +
        (n.type.designType ?? '') +
        (n.type.value === undefined ? '' : `=${n.type.value}`) +
        (n.type.items ? `[${n.type.items.length}]` : '')
    )
    .join('|')

/** Validator verdicts (`P` / `F`) of `values`. */
const verdicts = (type: TAtscriptAnnotatedType, values: unknown[]) =>
  values
    .map(v =>
      new Validator(type, { unknownProps: 'ignore' }).validate(structuredClone(v), true) ? 'P' : 'F'
    )
    .join('')

/** Props `p0` … `p<n-1>` (optional strings): a member too large to merge in place. */
const wide = (n: number) => Array.from({ length: n }, (_, i) => `  p${i}?: string`).join('\n')

const ENGINES = [false, true]

describe('N: a prop that resolves to `never` keeps its `?`', () => {
  for (const compiled of ENGINES) {
    it(`small and large merges${compiled ? ' (compiled)' : ''}`, async () => {
      const { m, warnings } = await load(
        {
          'a.as': `export interface X { a?: string }
export interface Y { b?: string }
export interface Z { c?: string }
export type DU = { k?: string; u?: X | Y } & { u?: X | Z }
export type DT = { k?: string; t?: [X] } & { t?: [Z] }
export type DA = { k?: string; aa?: X[][] } & { aa?: Z[][] }
export type DUA = { k?: string; ua?: (X | Y)[] } & { ua?: Z[] }
export interface S1 {\n${wide(12)}\n  u?: X | Y\n}
export interface S2 {\n${wide(12)}\n  u?: X | Z\n}
export interface P { s?: S1 }
export interface Q { s?: S2 }
export type M = P & Q
`,
        },
        { compiled }
      )
      for (const [name, key] of [
        ['DU', 'u'],
        ['DT', 't'],
        ['DA', 'aa'],
        ['DUA', 'ua'],
      ]) {
        expect([name, at(m[name], key)[0].optional]).toEqual([name, true])
        expect([name, verdicts(m[name], [{ k: 'x' }, { [key]: {} }])]).toEqual([name, 'PF'])
        expect([name, buildJsonSchema(m[name]).required]).toEqual([name, undefined])
      }
      // (in a merge state too)
      expect(at(m.M, 's.u')[0].optional).toBe(true)
      expect(verdicts(m.M, [{ s: { p0: 'x' } }, { s: { u: { a: 'x' } } }])).toBe('PF')
      expect(warnings.filter(w => w.includes('"M.s.u"'))).toHaveLength(1)
    })
  }
})

describe('SU: scalar and literal unions, tuples merge alike in every merge', () => {
  const MEMBERS = (name: string, next: string, own: string) => `export interface ${name} {
${next}  k?: ${own === 'A' ? "'a' | 'b'" : "'a'"}
  n?: ${own === 'A' ? 'number | string' : 'number'}
  t?: [string, number]
  e?: ${own === 'A' ? 'string' : 'string.email'}
}`
  for (const compiled of ENGINES) {
    it(`recursive and large merges are the small one${compiled ? ' (compiled)' : ''}`, async () => {
      const { m } = await load(
        {
          'a.as': [
            MEMBERS('A', '  next?: A\n', 'A'),
            MEMBERS('B', '  next?: B\n', 'B'),
            'export type M = A & B',
            MEMBERS('SA', '', 'A'),
            MEMBERS('SB', '', 'B'),
            'export type S = SA & SB',
            `export interface W1 {\n${wide(12)}\n  w?: SA\n}`,
            `export interface W2 {\n${wide(12)}\n  w?: SB\n}`,
            'export interface P { s?: W1 }',
            'export interface Q { s?: W2 }',
            'export type L = P & Q',
          ].join('\n'),
        },
        { compiled }
      )
      for (const [type, prefix] of [
        [m.S, ''],
        [m.M, ''],
        [m.M, 'next.'],
        [m.M, 'next.next.'],
        [m.L, 's.w.'],
      ] as const) {
        expect([prefix, kind(type, `${prefix}k`)]).toEqual([prefix, 'string=a'])
        expect([prefix, kind(type, `${prefix}n`)]).toEqual([prefix, 'number'])
        expect([prefix, kind(type, `${prefix}t`)]).toEqual([prefix, 'tuple[2]'])
      }
      const values = [{ k: 'a', n: 1, t: ['x', 1] }, { k: 'b' }, { n: 'x' }, { e: 'nope' }]
      const wrap = (prefix: string, v: unknown) =>
        prefix
          .split('.')
          .filter(Boolean)
          .reduceRight((x, k) => ({ [k]: x }), v)
      expect(verdicts(m.S, values)).toBe('PFFF')
      expect(
        verdicts(
          m.M,
          values.map(v => wrap('next.next', v))
        )
      ).toBe('PFFF')
      expect(
        verdicts(
          m.L,
          values.map(v => wrap('s.w', v))
        )
      ).toBe('PFFF')
    })
  }
})

describe('RU: union members of recursive and large merges: the later member wins', () => {
  for (const compiled of ENGINES) {
    it(`as in a small merge${compiled ? ' (compiled)' : ''}`, async () => {
      // MODEL §6 + §9 U5: the recursive one (`A.next?: (A | C) & B`) is a compile error now; the
      // large (non-recursive) ones distribute as a small merge does (MODEL §5).
      const C = `export interface C {
  @expect.maxLength 3
  y?: string
  c?: string
}
`
      expect(
        await buildErrors({
          'a.as': `export interface A {
  next?: (A | C) & B
  @expect.maxLength 3
  y?: string
}
${C}export interface B {
  next?: B
  @expect.maxLength 8
  y?: string
}
export type M = A & B
`,
        })
      ).toEqual([UNIREC])
      const { m } = await load(
        {
          'a.as': `${C}export interface S1 {
${wide(12)}
  @expect.maxLength 3
  y?: string
}
export interface S2 {
${wide(12)}
  @expect.maxLength 8
  y?: string
}
export interface P { s?: (S1 | C) & S2 }
export interface Q { s?: S2 }
export type L = P & Q
export interface T1 {
  @expect.maxLength 3
  y?: string
}
export interface T2 {
  @expect.maxLength 8
  y?: string
}
export interface P2 { s?: (T1 | C) & T2 }
export interface Q2 { s?: T2 }
export type SM = P2 & Q2
`,
        },
        { compiled }
      )
      const v = { y: 'abcde' }
      expect(verdicts(m.SM, [{ s: v }])).toBe('P')
      expect(verdicts(m.L, [{ s: v }])).toBe('P')
      expect(kind(m.L, 's')).toBe(kind(m.SM, 's'))
    })
  }
})

describe('DP: no depth limit', () => {
  /** `X0` … `X<n-1>`, `X<i>.next: X<i+1>` (or `X<cycle>` from the last one). */
  const chain = (x: string, n: number, cycle?: number) =>
    Array.from(
      { length: n },
      (_, i) =>
        `export interface ${x}${i} {\n${i < n - 1 ? `  next?: ${x}${i + 1}\n` : cycle === undefined ? '' : `  next?: ${x}${cycle}\n`}  @meta.label '${x}${i}'\n  y?: string\n}`
    ).join('\n')
  const deep = (n: number) => {
    let v: Record<string, unknown> = { y: 'x' }
    for (let i = 0; i < n; i++) {
      v = { next: v, y: 'x' }
    }
    return v
  }
  const path = (n: number) => Array(n).fill('next').join('.')
  for (const compiled of ENGINES) {
    it(
      `a chain of 80 merges, recursions of periods 7 and 11${compiled ? ' (compiled)' : ''}`,
      { timeout: 60_000 },
      async () => {
        const { m } = await load(
          {
            'a.as': [
              chain('A', 80),
              chain('B', 80),
              'export type M = A0 & B0',
              'export interface H { m?: A0 & B0 }',
              chain('C', 7, 0),
              chain('D', 11, 0),
              'export type R = C0 & D0',
            ].join('\n'),
          },
          { compiled }
        )
        for (const d of [1, 64, 65, 66, 79]) {
          expect([d, meta(m.M, `${path(d)}.y`)]).toEqual([d, `B${d}`])
          expect([d, meta(m.H, `m.${path(d)}.y`)]).toEqual([d, `B${d}`])
        }
        expect(verdicts(m.M, [deep(79)])).toBe('P')
        for (const d of [1, 66, 77, 78, 100, 154]) {
          expect([d, kind(m.R, path(d))]).toEqual([d, 'object'])
          expect([d, meta(m.R, `${path(d)}.y`)]).toEqual([d, `D${d % 11}`])
        }
        expect(verdicts(m.R, [deep(100)])).toBe('P')
      }
    )
  }
})

describe('TL: an intersection carries its members’ type-level annotations, live', () => {
  const A = `@meta.label 'IA'
export interface IA { x?: string; next?: IA }
export interface IB { x?: string; next?: IB }
@meta.label 'TA'
export type TA = { x?: string; next?: TA }
export type TB = { x?: string; next?: TB }
export type MI = IA & IB
export type MT = TA & TB
export interface H { mi?: IA & IB; mt?: TA & TB }
@meta.label 'AXL'
export annotate IA as AX {
  @meta.label 'ax'
  x
}
export type K = AX & { y?: string }
export interface X { a?: string }
@expect.minLength 2
export type L1 = X[]
export type L2 = X[]
export type LL = L1 & L2
export type LX = L1 & X[]
export interface P { l?: L1 }
export interface Q { l?: L2 }
export type PQ = P & Q
@expect.minLength 3
export type S3 = string
export type SS = S3 & string
`
  const B = `import { IA, IB, TB, L2 } from './a'
@meta.description 'IAblk'
annotate IA {}
@meta.description 'IBblk'
annotate IB {}
@meta.description 'TBblk'
annotate TB {}
@expect.maxLength 3
annotate L2 {}
`
  for (const compiled of ENGINES) {
    for (const order of [
      ['a.as', 'b.as'],
      ['b.as', 'a.as'],
    ]) {
      it(`small and recursive merges, blocks, aliases, arrays${compiled ? ' (compiled)' : ''}, ${order.join(' then ')}`, async () => {
        const { m } = await load({ 'a.as': A, 'b.as': B }, { compiled, order })
        const both = (t: unknown, p: string) => `${meta(t, p)}/${meta(t, p, 'meta.description')}`
        for (const [t, p] of [
          [m.MI, ''],
          [m.MI, 'next'],
          [m.MI, 'next.next'],
          [m.H, 'mi'],
          [m.H, 'mi.next'],
        ] as const) {
          expect([p, both(t, p)]).toEqual([p, 'IA/IBblk'])
        }
        for (const [t, p] of [
          [m.MT, ''],
          [m.MT, 'next'],
          [m.H, 'mt'],
          [m.H, 'mt.next'],
        ] as const) {
          expect([p, both(t, p)]).toEqual([p, 'TA/TBblk'])
        }
        expect(both(m.K, '')).toBe('AXL/IAblk')
        expect(meta(m.LL, '', 'expect.minLength')).toBe('{"length":2}')
        expect(meta(m.LL, '', 'expect.maxLength')).toBe('{"length":3}')
        expect(verdicts(m.LL, [[{}], [{}, {}], [{}, {}, {}, {}]])).toBe('FPF')
        expect(verdicts(m.LX, [[{}], [{}, {}]])).toBe('FP')
        expect(verdicts(m.PQ, [{ l: [{}] }, { l: [{}, {}] }])).toBe('FP')
        expect(verdicts(m.SS, ['ab', 'abc'])).toBe('FP')
        for (const t of [m.MI, m.MT, m.LL, m.H]) {
          expect(t.toJsonSchema()).toEqual(buildJsonSchema(t))
        }
      })
    }
  }
})

describe('ED: one merge, wherever its members are merged (owner rule: a reference, not a copy)', () => {
  it('a runtime edit of a merge shows wherever the same members are merged', async () => {
    const { m, js } = await load({
      'a.as': `export interface A { next?: A; y?: string }
export interface B { next?: B; y?: string }
export type M = A & B
export interface SA { y?: string }
export interface SB { y?: string }
export interface H {
  m1?: A & B
  m2?: A & B
  s1?: SA & SB
  s2?: SA & SB
}
`,
    })
    // (MODEL §5: one hidden class per distinct merge per module, which every place of that
    // merge in the module refers to; it was: no class per merge)
    expect(js['a.as']).toMatch(/^class \$M\d+ /m)
    at(m.H, 'm1.next.y')[0].metadata.set('meta.label', 'EDIT')
    at(m.H, 's1.y')[0].metadata.set('meta.label', 'EDITS')
    for (const [t, p] of [
      [m.H, 'm1.next.y'],
      [m.H, 'm1.y'],
      [m.H, 'm2.next.y'],
      [m.H, 'm2.next.next.y'],
      [m.M, 'next.y'],
    ] as const) {
      expect([p, meta(t, p)]).toEqual([p, 'EDIT'])
    }
    expect(meta(m.H, 's2.y')).toBe('EDITS')
    // (the members are not the merge: their own nodes are untouched; MODEL §5: a named merge
    // `M = A & B` is a class of its own, so `M.y` is M's own field, not the hidden class's)
    for (const [t, p] of [
      [m.M, 'y'],
      [m.A, 'y'],
      [m.A, 'next.y'],
      [m.B, 'y'],
      [m.SA, 'y'],
    ] as const) {
      expect([p, meta(t, p)]).toEqual([p, '-'])
    }
  })

  it("a referrer path override stays the referrer's own", async () => {
    const { m } = await load({
      'a.as': `export interface A { next?: A; y?: string }
export interface B { next?: B; y?: string }
export type M = A & B
export interface H {
  m1?: A & B
  m2?: A & B
}
annotate H {
  @meta.label 'H1'
  m1.next.y
}
annotate M {
  @meta.label 'M'
  y
}
`,
    })
    expect(meta(m.H, 'm1.next.y')).toBe('H1')
    for (const [t, p] of [
      [m.H, 'm1.y'],
      [m.H, 'm2.next.y'],
      [m.A, 'y'],
    ] as const) {
      expect([p, meta(t, p)]).toEqual([p, '-'])
    }
    expect(meta(m.M, 'y')).toBe('M')
    expect(meta(m.M, 'next.y')).toBe('-')
  })

  it('in a merge of many nested merges too: one object per members', async () => {
    /** `A0 & B0`: `Ai` / `Bi` share `p0`, `p1`, typed `A<i+1>` / `B<i+1>` (`n` levels). */
    const lines: string[] = []
    const n = 9
    for (let i = 0; i < n; i++) {
      for (const X of ['A', 'B']) {
        const t = i === n - 1 ? 'string' : `${X}${i + 1}`
        lines.push(`export interface ${X}${i} {\n  p0?: ${t}\n  p1?: ${t}\n  y?: string\n}`)
      }
    }
    lines.push('export type T = A0 & B0', 'export interface U {\n  t?: A0 & B0\n  u?: A0 & B0\n}')
    const { m, js } = await load({ 'a.as': lines.join('\n') })
    // (no class per merge: generated code writes the operands, the runtime merges them once)
    expect(js['a.as']).not.toMatch(/^class \$_/m)
    const deep = 'p0.p0.p0.p0.p0.p0.y'
    at(m.T, deep)[0].metadata.set('meta.label', 'EDIT')
    for (const [t, p] of [
      [m.T, deep],
      [m.T, `p1.${deep.slice(3)}`],
      [m.U, `t.${deep}`],
      [m.U, `u.p1.${deep.slice(3)}`],
    ] as const) {
      expect([p, meta(t, p)]).toEqual([p, 'EDIT'])
    }
    for (const [t, p] of [
      [m.A0, deep],
      [m.B0, deep],
      [m.T, 'p0.p0.p0.p0.p0.y'],
    ] as const) {
      expect([p, meta(t, p)]).toEqual([p, '-'])
    }
  })
})

describe('PERF: a merge too large to inline compiles like any type', () => {
  it('no interpreted site in its compiled check', async () => {
    const props = (n: number) =>
      Array.from({ length: n }, (_, i) => `  @expect.maxLength 20\n  p${i}?: string`).join('\n')
    const { m, js } = await load(
      {
        'a.as': `export interface S1 {\n${props(20)}\n}
export interface S2 {\n${props(20)}\n}
export interface P { s?: S1; a?: string }
export interface Q { s?: S2; b?: string }
export type M = P & Q
`,
      },
      { compiled: true }
    )
    const registration = js['a.as'].slice(js['a.as'].indexOf('$cv(M,'))
    expect(registration.length).toBeGreaterThan(0)
    // (`-2`: an interpreted site — a merge known only at runtime, before)
    expect(registration.split('\n')[0]).not.toMatch(/\[\d+,\d+,-2,/)
    const v = { a: 'x', b: 'y', s: { p0: 'abc', p19: 'abc' } }
    expect(verdicts(m.M, [v, { ...v, s: { p19: 'x'.repeat(30) } }])).toBe('PF')
  })
})

/*
 * Classes the round-22 oracle (generator v4, `$H/r22/oracle/classes/`) found: each failed before
 * (on the round-22 snapshot, or on the tree before its fix in this round).
 */
describe('round-22 oracle classes', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    it(`TL1: a member declared later carries its type-level annotations${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export type M0 = I3 & { c?: string }
export interface H { v?: I2 & I3 }
export interface I2 { c?: string }
@meta.description 'D0'
export interface I3 { n?: string }
`,
        },
        { compiled }
      )
      expect(meta(m.M0, '', 'meta.description')).toBe('D0')
      expect(meta(m.H, 'v', 'meta.description')).toBe('D0')
    })

    it(`TL1: a member of a module of an import cycle evaluated later${mode}`, async () => {
      const files = {
        'm0.as': `import { M0 } from './m3'
@meta.description 'D0'
export interface I3 {
  n?: string
}
export interface Y { m?: M0 }
`,
        'm3.as': `import { I3 } from './m0'
export type M0 = I3 & {
  c: string
}
`,
      }
      for (const order of [
        ['m0.as', 'm3.as'],
        ['m3.as', 'm0.as'],
      ]) {
        const { m } = await load(files, { compiled, order })
        expect([order, meta(m.M0, '', 'meta.description')]).toEqual([order, 'D0'])
        expect([order, meta(m.Y, 'm', 'meta.description')]).toEqual([order, 'D0'])
      }
    })

    it(`TL2: a recursive merge with the enclosing type carries its annotations${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 { x?: string }
@meta.description 'D0'
export interface I1 { next?: I1 & I0 }
@meta.label 'L2'
export interface I2 {
  next?: I2 & I2
  a?: string
}
export interface J0 { next?: J0 & J1 }
@meta.label 'L3'
export interface J1 { next?: J0 }
`,
        },
        { compiled }
      )
      for (const p of ['next', 'next.next', 'next.next.next']) {
        expect([p, meta(m.I1, p, 'meta.description')]).toEqual([p, 'D0'])
        expect([p, meta(m.I2, p)]).toEqual([p, 'L2'])
      }
      expect(meta(m.J0, 'next')).toBe('L3')
    })

    it(`DP1: a recursive merge of a type and its child has no placeholder${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  next?: I0
}
export interface I1 {
  next?: I2 & I1
}
export interface I2 extends I1, I0 {
  t: [string, string]
}
export type M0 = I0 & I1
`,
        },
        { compiled }
      )
      for (const p of ['next.t', 'next.next.t', 'next.next.next.t']) {
        expect([p, kind(m.M0, p)]).toEqual([p, 'tuple[2]'])
      }
      const t = ['ab', 'ab']
      expect(
        verdicts(m.M0, [
          { next: { t, next: { t } } },
          { next: { t, next: { t: 'a' } } },
          { next: { t, next: {} } },
        ])
      ).toBe('PFF')
    })

    it(`BLD1: a recursive merge with a member recursing through a plain alias builds${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I1 {
  next?: P1
  @meta.label 'b1'
  b?: string
}
export type P1 = I1
export interface I0 {
  next?: I0 & I1
  @meta.label 'b0'
  b?: string
}
`,
        },
        { compiled }
      )
      expect(meta(m.I0, 'next.b')).toBe('b1')
      expect(meta(m.I0, 'next.next.b')).toBe('b1')
    })

    it(`RM1: a block on a member at a nested path keeps the merge below it${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  b: string
  work: {
    b: string
    list?: {
      c: string
    }[]
  }
}
export interface I1 {
  list?: I0[]
  work?: I0
}
export type M0 = I1 & {
  work: I1
}
annotate I1 {
  @meta.label 'L60'
  work.b
}
`,
        },
        { compiled }
      )
      expect(at(m.M0, 'work.work.work')).toHaveLength(1)
      expect(meta(m.M0, 'work.work.b')).toBe('L60')
    })

    it(`TL3: a parenthesized plain alias carries its target's annotations${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `@meta.label 'L8'
annotate I1 {}
@meta.description 'D0'
@meta.label 'L4'
export interface I1 { b: string; next?: P1 }
export type P1 = (I1)
export type P2 = P1
export interface H1 { u: P1 }
export annotate P1 as X0 {
}
`,
        },
        { compiled }
      )
      expect(meta(m.H1, 'u', 'meta.description')).toBe('D0')
      expect(meta(m.P2, '', 'meta.description')).toBe('D0')
      expect(meta(m.X0, '', 'meta.description')).toBe('D0')
      // (the alias does not copy its target's annotations as its own: a later block wins)
      for (const [t, p] of [
        [m.H1, 'u'],
        [m.P2, ''],
        [m.I1, 'next'],
      ] as const) {
        expect([p, meta(t, p)]).toEqual([p, 'L8'])
      }
    })

    it(`IP1: blocks on a type an in-place member's prop names reach the merge${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface IA { a?: string }
export interface IB { a?: string }
export interface P { s?: IA }
export type M0 = P & { s?: IB }
@meta.label 'L32'
annotate IB {}
export interface J0 {
  work?: {
    a?: string
  }
}
export interface J2 {
  a: string
}
export interface H0 {
  v?: J0 & {
    work?: J0 & J2
  }
}
annotate J2 {
  @meta.label 'L24'
  a
}
export type S0 = string
export type M1 = IA & {
  a: S0
}
@expect.minLength 3
annotate S0 {}
`,
        },
        { compiled }
      )
      expect(meta(m.M0, 's')).toBe('L32')
      expect(meta(m.H0, 'v.work.a')).toBe('L24')
      expect(verdicts(m.M1, [{ a: 'ab' }, { a: 'abc' }])).toBe('FP')
    })

    it(`RU1: the branches of a distributed union operand keep the members' annotations${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 { a?: string; k?: string }
export interface I2 { z?: string }
export interface I1 { a?: string; k?: string }
export interface WP { s?: (I0 | I2) & I1 }
export interface WQ { s?: I1 }
export type WM = WP & WQ
annotate I1 {
  @expect.maxLength 5
  a
}
annotate WQ {
  @expect.pattern '^[^q]*$'
  s.k
}
`,
        },
        { compiled }
      )
      expect(meta(m.WM, 's.a', 'expect.maxLength')).toBe('{"length":5}|{"length":5}')
      expect(
        verdicts(m.WM, [{ s: { a: 'abcde' } }, { s: { a: 'abcdef' } }, { s: { k: 'q' } }])
      ).toBe('PFF')
      // MODEL §6 + §9 U5: `K3.next?: (K3 | K0) & K2` (a union operand of a merge on K3's recursion)
      // is a compile error now (it was: both branches of K3.next's `next` carry K2's maxLength).
      expect(
        await buildErrors({
          'a.as': `export interface K2 {
  next?: K0
  @expect.maxLength 5
  a: string
}
export interface K0 {
  a?: string
}
export interface K3 {
  next?: (K3 | K0) & K2
}
`,
        })
      ).toEqual([UNIREC])
    })

    it(`NT1: branches no value can take are dropped${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 { a?: string }
export interface I2 { b?: string }
export type M0 = (I2 | null) & (I0 | null) & { k?: string }
export interface N1 { n?: number | string }
export interface N0 { n?: number | string }
export type M1 = N1 & N0 & { n?: number }
`,
        },
        { compiled }
      )
      expect(kind(m.M0, '')).toBe('object')
      expect(kind(m.M1, 'n')).toBe('number')
    })

    it(`SN1: one node reached twice in a slot keeps a path override${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  next?: I3
  b: string
}
export interface I1 extends I0 {
}
export interface I3 extends I1, I0 {
}
annotate I1 {
  @meta.label 'L18'
  next.b
}
export interface J1 {
  home?: {
    home?: {
      t?: [number, string]
    } | null
  }
}
export interface J2 extends J1 {
}
export interface J0 {
  next?: J2 & J1
}
annotate J2 {
  @meta.label 'L14'
  home.home.t
}
`,
        },
        { compiled }
      )
      expect(meta(m.I3, 'next.b')).toBe('L18')
      expect(meta(m.J0, 'next.home.home.t')).toBe('L14')
    })
  }
})

/*
 * Classes the round-22 verification run of the oracle found (seeds 1–500, `$H/r22/v/`): each failed
 * before (on the round-22 snapshot; RP's recursion part on this round's tree before its fix).
 */
describe('round-22 verification classes', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    it(`QW: a merged slot carries a class declared later in the module${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface H0 {
  v: I0 & {
    list?: I2[]
  }
}
export type M0 = I0 & {
  list: I2[]
}
export type M1 = I4 & {
  list: I4[]
}
export interface I0 {
  list?: {
    c: string
  }[]
}
@meta.label 'L4'
export interface I2 {
  a: string
}
@meta.description 'D1'
export interface I4 extends I0 {
}
`,
        },
        { compiled }
      )
      expect(meta(m.H0, 'v.list.[]')).toBe('L4')
      expect(meta(m.M0, 'list.[]')).toBe('L4')
      expect(meta(m.M1, 'list.[]', 'meta.description')).toBe('D1')
    })

    it(`NU: a member's path override through a nullable union reaches the merge${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  home?: {
    list: string
  } | null
  next?: I0
}
export interface I1 { w?: string }
export type M0 = I1 & I0
export type M1 = I0 & M0
annotate M0 {
  @meta.label 'L39'
  next.home.list
}
export interface J0 {
  next?: J1 | null
}
export interface J1 {
  c: string
}
export type N0 = J0
export type N1 = N0 & {
  home?: {
    home?: J0
  }
}
export interface C0 extends J0, N1 {
}
annotate N1 {
  @meta.label 'L61'
  next.c
}
`,
        },
        { compiled }
      )
      expect(meta(m.M1, 'next.home.list')).toBe('L39')
      expect(meta(m.C0, 'next.c')).toBe('L61')
    })

    it(`NB: the branches of a distributed member keep a nullable member's slot${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  home?: {
    t?: string
  } | null
}
export interface I2 {
  b: string
}
export type M0 = I0 & {
  home: (I2 | I0) & I0
}
annotate I0 {
  @meta.label 'L60'
  home.t
}
export interface J1 {
  k: 'c'
}
export interface J0 {
  work: {
    k: 'c'
  }
}
export interface J2 {
  home?: J1 | null
}
export interface J3 {
  home: (J2 | J1) & J0
}
export type N0 = J3 & J2
annotate J2 {
  @meta.label 'L19'
  home.k
}
`,
        },
        { compiled }
      )
      expect(meta(m.M0, 'home.t')).toBe('L60|L60')
      expect(meta(m.N0, 'home.k')).toBe('L19|L19')
    })

    it(`MI: a member's merged nullable array merges its element again${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I1 {
  b: string
}
export type M1 = M0 & {
  list?: P0[]
}
export type P0 = I0
export interface I0 {
  list?: {
    b: string
  }[] | null
}
export type M0 = I0 & {
  list?: I1[] | null
}
annotate P0 {
  @expect.maxLength 5
  list.b
}
`,
        },
        { compiled }
      )
      expect(meta(m.M1, 'list.[].b', 'expect.maxLength')).toBe('{"length":5}')
      expect(
        verdicts(m.M1, [
          { list: [{ b: 'abcde', list: null }] },
          { list: [{ b: 'abcdef', list: null }] },
        ])
      ).toBe('PF')
    })

    it(`RP: a type repeated counts where it last occurs${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface X {
  @meta.label 'LX'
  p?: string
}
export interface Y {
  @meta.label 'LY'
  p?: string
}
export type M = X & Y & X
`,
        },
        { compiled }
      )
      expect(meta(m.M, 'p')).toBe('LX')
    })

    it(`RP: a recursion whose levels merge in alternating order${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  next?: I0 & I1
}
@meta.label 'L3'
export interface I1 {
  @meta.label 'L4'
  next?: I0
}
`,
        },
        { compiled }
      )
      // (I0.next is I0 & I1; each level below merges the two levels above it, the later winning)
      expect(
        [
          'next',
          'next.next',
          'next.next.next',
          'next.next.next.next',
          'next.next.next.next.next',
        ].map(p => meta(m.I0, p))
      ).toEqual(['L3', 'L4', 'L3', 'L4', 'L3'])
    })

    // MODEL §6 + §9 U5: `I4.next?: (I2 | I0) & I3`, reached on I1's recursion (`I1 & I4`), is a
    // union operand of a recursive merge: a compile error now (it was: I1.next.next.next = 'L6|L6').
    it(`BS: a branch merging an intersection member's slot keeps its location${mode}`, async () => {
      const errors = await buildErrors({
        'a.as': `export interface I2 {
  b?: string
}
export interface I0 {
  home: {
    c: string
  }
}
@meta.label 'L6'
export interface I3 {
  t: [number, string]
}
export interface I1 {
  @meta.label 'L3'
  next?: I1 & I4
}
export interface I4 {
  next?: (I2 | I0) & I3
}
`,
      })
      expect([compiled, errors]).toEqual([compiled, [UNIREC]])
    })
  }
})

/* Classes of the round-23 review (`$H/r23/REVIEW-r23.md`): each failed before (`$H/r23/pre`). */
describe('round-23 classes', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    it(`O1: a path override where a recursive merge is first reached stays at its path${mode}`, async () => {
      const files = {
        'a.as': `export interface A {
  y?: string
  next?: A
}
export interface B {
  @expect.maxLength 3
  y?: string
  next?: B
}
export interface P { a?: A }
export interface R { a?: B }
export type Q = P & R
`,
        'z.as': `import { P } from './a'
annotate P {
  @meta.label 'P.a.next.y'
  @expect.maxLength 9
  a.next.y
}
`,
      }
      for (const order of [
        ['a.as', 'z.as'],
        ['z.as', 'a.as'],
      ]) {
        const { m } = await load(files, { compiled, order })
        expect(
          ['a.y', 'a.next.y', 'a.next.next.y', 'a.next.next.next.y'].map(
            p => `${meta(m.Q, p)}/${meta(m.Q, p, 'expect.maxLength')}`
          )
        ).toEqual(['-/{"length":3}', 'P.a.next.y/{"length":3}', '-/{"length":3}', '-/{"length":3}'])
        const deep = (n: number, y: string): unknown => (n === 0 ? { y } : { next: deep(n - 1, y) })
        expect(verdicts(m.Q, [{ a: deep(2, 'abcd') }, { a: deep(1, 'abc') }])).toBe('FP')
      }
    })

    it(`PWR: an operand does not pass its passedWhenReferred:false annotations${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `@meta.readonly
@meta.label 'RO'
export type RO = {
  x?: string
}
export type W = {
  y?: string
}
export interface K1 { q?: RO }
export interface K2 { q?: W }
export type K = K1 & K2
export interface K3 { q?: RO & W }
export type T = RO & W
@meta.readonly
annotate W {}
`,
        },
        { compiled }
      )
      for (const [t, p] of [
        [m.K, 'q'],
        [m.K3, 'q'],
        [m.T, ''],
      ] as const) {
        expect([p, meta(t, p, 'meta.readonly'), meta(t, p)]).toEqual([p, '-', 'RO'])
      }
    })

    it(`CH-TL: a chain member carries the field's annotations and its type's${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `@meta.description 'A-class'
export interface A {
  @meta.label 'A.x'
  x?: X
}
@meta.description 'X-class'
export interface X {
  p?: string
}
export type Q = A.x & { z?: string }
export interface H {
  q?: A.x & { z?: string }
}
export type L = A.x
export type Q2 = L & { z?: string }
`,
        },
        { compiled }
      )
      for (const [t, p] of [
        [m.Q, ''],
        [m.H, 'q'],
        [m.Q2, ''],
      ] as const) {
        expect([p, meta(t, p), meta(t, p, 'meta.description')]).toEqual([p, 'A.x', 'X-class'])
      }
    })
  }
})

/*
 * Regressions of round 23's O1 fix (a merge state's members rooted at their declarations): a
 * place reaching a state merges again, at every depth, where a member's nodes there changed after
 * the build — through arrays, merged slots of merged slots and the branches of a distributed union.
 * Each fails with the fix reverted (`$H/r23/w/p-o1l.py`, `p-ru2.py`).
 */
describe('round-23 regressions of the member rooting', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    it(`O1L: a holder override through an array step${mode}`, async () => {
      const files = {
        'a.as': `export interface RA {
  list?: RA[]
}
export interface RB {
  y?: string
  next?: RB
  list?: RB[]
}
export interface HA { a?: RA }
export interface HB { a?: RB }
export type Q0 = HB & HA
`,
        'z.as': `import { HB } from './a'
annotate HB {
  @meta.label 'L10'
  @expect.maxLength 2
  a.list.next.y
}
`,
      }
      for (const order of [
        ['a.as', 'z.as'],
        ['z.as', 'a.as'],
      ]) {
        const { m } = await load(files, { compiled, order })
        expect(
          [
            'a.list.[].y',
            'a.list.[].next.y',
            'a.list.[].next.next.y',
            'a.list.[].list.[].next.y',
          ].map(p => meta(m.Q0, p))
        ).toEqual(['-', 'L10', '-', '-'])
        expect(
          verdicts(m.Q0, [
            { a: { list: [{ next: { y: 'abc' } }] } },
            { a: { list: [{ next: { y: 'ab', next: { y: 'abc' } } }] } },
          ])
        ).toBe('FP')
      }
    })

    it(`O1M: a member's path override below a recursive merge, at every depth${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  k?: string
}
export interface I2 {
  next?: I1
}
export interface I1 {
  next?: I3
  work?: I0
}
export interface I3 {
  work?: I1
  next?: I2
}
export interface H0 {
  w: I2 & I1
}
annotate I2 {
  @meta.label 'L15'
  next.next.work
}
`,
        },
        { compiled }
      )
      expect(
        Array.from({ length: 7 }, (_, k) => meta(m.H0, `w${'.next'.repeat(k)}.work`)).join(' ')
      ).toBe('- - L15 - L15 L15 -')
    })

    it(`O1M: through a plain alias of a recursive merge's member${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I1 extends I0 {
  next?: I2 & I1
}
export interface I0 {
  kids?: I2[]
  home?: {
    work?: {
      work?: {
        a: string
      }
    }
  }
}
export type P0 = (I1)
export interface I2 {
  kids?: I0[]
}
annotate P0 {
  @meta.label 'L7'
  kids.kids.home.work
}
`,
        },
        { compiled }
      )
      for (const t of [m.I1, m.P0]) {
        expect(
          [
            'kids.[].kids.[].home.work',
            'next.kids.[].kids.[].home.work',
            'next.next.kids.[].kids.[].home.work',
            'next.kids.[].kids.[].kids.[].home.work',
          ].map(p => meta(t, p))
        ).toEqual(['L7', 'L7', 'L7', '-'])
      }
    })

    it(`RU2: a member's block reaches the branches of a distributed union${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I1 {
  a: string
}
export type WM = WP & WQ
annotate WQ {
  @expect.maxLength 3
  s.a
}
export interface WP {
  s?: (I0 | I2) & I1
}
export interface I0 {
  t?: [string, number, string]
}
export interface I2 {
  t?: [number, string]
  n?: 1 | 2
  next?: I2
  list?: {
    a?: string
  }[] | null
}
export interface WQ {
  s?: I1
}
`,
        },
        { compiled }
      )
      expect(meta(m.WM, 's.a', 'expect.maxLength')).toBe('{"length":3}|{"length":3}')
      expect(
        verdicts(m.WM, [
          { s: { a: 'abcd', t: ['x', 1, 'y'] } },
          { s: { a: 'abcd', t: [1, 'y'] } },
          { s: { a: 'abc', t: [1, 'y'] } },
        ])
      ).toBe('FFP')
      const schema = JSON.stringify(buildJsonSchema(m.WM))
      expect(schema.match(/"maxLength":3/g)?.length).toBe(2)
    })
  }
})

/*
 * Round-23 oracle (generator v5) classes that predate round 23: each fails on `$H/r23/pre`.
 */
describe('round-23 oracle classes', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    it(`O1R: a block on a merge reused as a member stays at its path${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  work: {
    a?: string
  }
  kids?: I1[]
}
export interface I1 {
  kids?: I0[]
  next?: I0
}
export type M1 = M0 & I0
annotate M0 {
  @meta.label 'L10'
  kids.next.work
}
export type M0 = I1 & I0
`,
        },
        { compiled }
      )
      expect(
        [
          'kids.[].next.work',
          'kids.[].kids.[].next.work',
          'kids.[].kids.[].kids.[].next.work',
          'kids.[].kids.[].kids.[].kids.[].kids.[].next.work',
        ].map(p => meta(m.M1, p))
      ).toEqual(['L10', '-', '-', '-'])
      expect(meta(m.M0, 'kids.[].next.work')).toBe('L10')
    })

    it(`TL1: a member declared after the merge keeps its priority over an earlier member's block${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export type RW = {
  c?: string
}
export interface KR {
  p?: RW & RO
}
@meta.label 'L34'
annotate RW {}
@meta.label 'L15'
export type RO = {
  c?: string
}
`,
        },
        { compiled }
      )
      expect(meta(m.KR, 'p')).toBe('L15')
    })

    it(`RN: a repeated member counts where it last occurs in nested merges too${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  @meta.label 'L1'
  c: string
  next?: I1
}
export interface I1 {
  next?: (I1 & I0) | null
  @meta.label 'L3'
  c: string
}
`,
        },
        { compiled }
      )
      expect(
        Array.from({ length: 6 }, (_, k) => meta(m.I1, `${'next.'.repeat(k)}c`)).join(' ')
      ).toBe('L3 L1 L3 L1 L3 L1')
      expect(
        Array.from({ length: 6 }, (_, k) => meta(m.I0, `${'next.'.repeat(k)}c`)).join(' ')
      ).toBe('L1 L3 L1 L3 L1 L3')
    })

    it(`CH-IN: a chain through an inherited prop keeps its holder's block${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  work: {
    t?: string
  }
}
export interface I1 extends I0 {}
export interface CH0 {
  r?: I1.work
}
annotate CH0 {
  @meta.label 'L28'
  @expect.maxLength 2
  r.t
}
annotate I1 {
  @meta.label 'L10'
  work
}
`,
        },
        { compiled }
      )
      expect([meta(m.CH0, 'r.t'), meta(m.CH0, 'r'), meta(m.I1, 'work')]).toEqual([
        'L28',
        'L10',
        'L10',
      ])
      expect(verdicts(m.CH0, [{ r: { t: 'abc' } }, { r: { t: 'ab' } }])).toBe('FP')
    })

    it(`CH-OWN: a chain is its field, not the type declaring it${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `@meta.description 'D1'
export type RO = {
  c?: string
}
export interface KR {
  r?: RO
}
@meta.description 'D0'
export interface I0 {
  @meta.label 'I0.work'
  work: {
    n?: string
  }
}
@meta.description 'H1'
export type H1 = {
  w: I0
}
export interface CH0 {
  v?: KR.r.c
  r?: H1.w.work
  q?: H1.w
  s?: KR.r
}
export type L = H1.w
`,
        },
        { compiled }
      )
      expect(
        ['v', 'r', 'q', 's'].map(p => `${meta(m.CH0, p, 'meta.description')}/${meta(m.CH0, p)}`)
      ).toEqual(['-/-', '-/I0.work', 'D0/-', 'D1/-'])
      expect(meta(m.L, '', 'meta.description')).toBe('D0')
    })
  }
})

/*
 * Round-23 acceptance (oracle generator v5, seeds 101–500): classes found after the open list
 * was fixed. Each fails on `$H/r23/pre` (or, the two marked, with this round's change reverted).
 */
describe('round-23 acceptance classes', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    it(`CH-SH: a chain through a slot shared from a class declared later loads${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  work: {
    @expect.maxLength 2
    k?: string
  }
}
export interface C0 extends I3 {}
export interface CH0 {
  v?: C0.work.work.k
  w?: M1.next.work
}
export interface I3 {
  work: I0
}
export type M1 = I1
export interface I1 extends I2 {}
export interface I2 {
  next?: I3
}
`,
        },
        { compiled }
      )
      expect(kind(m.CH0, 'v')).toBe('string')
      expect(kind(m.CH0, 'w')).toBe('object')
      expect(verdicts(m.CH0, [{ v: 'abc' }, { v: 'ab' }])).toBe('FP')
    })

    it(`PWR2: a merged slot naming a class does not pass its passedWhenReferred:false keys${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I2 {
  home?: {
    a?: string
    c?: string
  }
  list?: P0[] | null
}
export interface I1 extends I0 {
  n?: string | boolean
  b?: string
}
@meta.readonly
export type P0 = (I1)
export type L0 = I2[]
export interface I0 {
  kids?: L0
  c: string
  a: string
  t?: [string, number]
}
export type M0 = I2 & {
  list?: L0
}
`,
        },
        { compiled }
      )
      expect(meta(m.M0, 'list.[]', 'meta.readonly')).toBe('-')
    })

    it(`NU2: a path override through a nullable member's item reaches a merge of one type${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  home: {
    work?: {
      a: string
    }
    b: string
    c: string
  }
  work: {
    home: {
      t?: [string, string]
    }
    t?: [number, string]
    b: string
  }
}
export interface I1 {
  home?: I0 | null
}
export type P0 = (I1)
export type M0 = {
  home?: I0 | null
} & P0
annotate P0 {
  @meta.label 'L23'
  home.work
}
`,
        },
        { compiled }
      )
      expect([meta(m.M0, 'home.work'), meta(m.I1, 'home.work'), meta(m.I0, 'work')]).toEqual([
        'L23',
        'L23',
        '-',
      ])
    })

    it(`EXN: \`extends\` a nullable intersection alias shares its item's nodes${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export type N0 = I1 | null
export interface I0 {
  k: 'c'
}
export interface I1 {
  work: {
    list: I0[]
  }
}
export type M1 = (I0 | null) & N0
export interface C0 extends M1, I0 {}
export type P1 = I1
annotate P1 {
  @meta.label 'L8'
  work
}
`,
        },
        { compiled }
      )
      expect([meta(m.C0, 'work'), meta(m.M1, 'work')]).toEqual(['L8', 'L8'])
    })

    it(`ST2: a merge state built after a block re-merges over the slots built since${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  next?: I3
}
export interface I1 extends I0 {}
export interface I3 {
  next?: I1
  home?: {
    home: I1
  }
}
annotate I1 {
  @meta.label 'L51'
  next.home.home
}
export type M1 = {
  home: {
    home?: I1 & I3
  }
}
`,
        },
        { compiled }
      )
      expect(kind(m.M1, 'home.home.next.next.home')).toBe('object')
      expect(kind(m.M1, 'home.home.next.home')).toBe('object')
      expect(meta(m.I1, 'next.home.home')).toBe('L51')
    })

    it(`CHM: a chain through a recursive merge names the field inside a merge too${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  work: {
    a?: string
  }
}
export interface I1 {
  next?: I0 & I1
  work: P0
}
export type M0 = I1
export type P0 = I0
export type CQ2 = M0.next.work.work & I1
export interface RB {
  y?: string
  next?: RB1
}
export interface RB1 {
  @meta.label 'L13'
  y?: string
  next?: RB
}
export interface RA {
  next?: RA1
}
export interface RA1 {
  next?: RA
}
export interface HB { a?: RB }
export interface HA { a?: RA }
export interface HQ {
  q?: HB & HA
}
export type CQ3 = HQ.q.a.next & I0
`,
        },
        { compiled }
      )
      expect([...m.CQ2.type.props.keys()].sort()).toEqual(['a', 'next', 'work'])
      expect(['y', 'next.y', 'next.next.y'].map(p => meta(m.CQ3, p))).toEqual(['L13', '-', 'L13'])
    })

    it(`CH-EX: a chain to a prop inherited from another module of an import cycle builds${mode}`, async () => {
      const { m } = await load(
        {
          'm0.as': `import { I1 } from './m2'
export interface C0 extends I1 {}
`,
          'm2.as': `import { C0 } from './m0'
export interface I1 {
  @meta.label 'I1.work'
  work?: I0
}
export interface I0 {
  c?: string
}
export type CQ2 = C0.work
`,
        },
        { compiled, order: ['m2.as', 'm0.as'] }
      )
      expect([meta(m.CQ2, ''), kind(m.CQ2, 'c')]).toEqual(['I1.work', 'string'])
    })
  }
})

describe('round-23, part 3: re-merges at a place', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    it(`a member's override below a recursion merged again at every depth${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  next?: I0 & I1
  n?: string
}
export interface I1 {
  next?: I0
}
annotate I1 {
  @meta.label 'L16'
  next.next.next.n
}
`,
        },
        { compiled }
      )
      // MODEL §8 (no self-collapse through an intersection member) + §4 (exact path): the entry
      // stays `I1 { next.next.next.n }` (I1's shells at next / next.next / next.next.next); a
      // merge place of I0's recursion has the label once the last shell is one of its operands
      // (the oracle agrees). It was: rewritten to `I1 { next.n }`, '- L16 …' / 'L16 - L16 …'.
      const labels = (type: unknown) =>
        Array.from({ length: 7 }, (_, k) => meta(type, `${'next.'.repeat(k + 1)}n`)).join(' ')
      expect(labels(m.I0)).toBe('- - - L16 L16 L16 L16')
      expect(labels(m.I1)).toBe('- - L16 - L16 L16 L16')
    })

    it(`a holder override in a recursion through a child type's array alias${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I1 {
  next?: I1 & I0
}
export interface I2 extends I1 {
  list: L0
}
export type L0 = I1[]
export interface I0 {
  next?: I2
}
annotate I0 {
  @meta.label 'L6'
  next.list
}
`,
        },
        { compiled }
      )
      expect(
        Array.from({ length: 5 }, (_, k) => meta(m.I0, `next.${'next.'.repeat(k + 2)}list`)).join(
          ' '
        )
      ).toBe('L6 L6 L6 L6 L6')
      expect(
        Array.from({ length: 4 }, (_, k) => meta(m.I1, `${'next.'.repeat(k + 2)}list`)).join(' ')
      ).toBe('L6 L6 L6 L6')
    })

    it(`a member's override below an element of an array merge${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  list: {
    c: string
  }[]
  work: {
    list?: {
      b: string
    }[]
  }
}
export interface I1 {
  list?: I0[]
}
annotate I1 {
  @expect.pattern '^[^q]*$'
  list.work.list.b
}
export type L0 = I1[]
export type M0 = {
  list: L0
} & I1
`,
        },
        { compiled }
      )
      expect(meta(m.M0, 'list.[].work.list.[].b', 'expect.pattern')).toBe('[{"pattern":"^[^q]*$"}]')
      const value = (b: string) => ({ list: [{ list: [], work: { list: [{ b }] } }] })
      expect(verdicts(m.M0, [value('aq'), value('ab')])).toBe('FP')
    })

    it(`a member's operand override in a merge reused as a member${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I2 {
  b?: string
  work: I1
  list: {
    c?: string
  }[]
}
export type M1 = M0 & {
  work: {
    a: string
  }
}
export interface I1 {
  e: string
  f?: string
  g: string
  h: string
  k?: 'a'
  n?: number | string
  t: [number, string]
}
export type P1 = (I3)
export interface I3 {
  work?: I2
}
export type M0 = P1 & I2
annotate I3 {
  @meta.label 'L80'
  @expect.maxLength 3
  work.b
}
`,
        },
        { compiled }
      )
      expect(meta(m.M1, 'work.b')).toBe('L80')
      expect(meta(m.M0, 'work.b')).toBe('L80')
      // (`M1.work` is a merge state, over the budget: `M0.work`'s operands rooted at their
      // declarations, I3's `work` merged again there)
      const i1 = { e: 'a', g: 'a', h: 'a', t: [1, 'a'] }
      const value = (b: string) => ({ work: { b, work: i1, list: [], ...i1, a: 'a' }, list: [] })
      expect(verdicts(m.M1, [value('abcd'), value('abc')])).toBe('FP')
    })
  }
})

describe('round-23, part 3: members written in place', () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    // (`M0.home` merges `I0.home` and an intersection written in place, which has no node of
    // its own there: the place's slot keeps what it contributes, at its priority)
    it(`a member with no node at a merged slot keeps its part${mode}`, async () => {
      const { m } = await load(
        {
          'm1.as': `export interface I0 {
  kids?: I0[]
  home?: {
    home?: {
      home?: {
        b: string
      }
      list: {
        b?: string
      }[]
    }
  }
}
export interface I1 extends I0 {

}
export type M0 = I0 & {
  home: I0 & I1
}
annotate I0 {
  @meta.label 'L32'
  kids.home.home
}
`,
        },
        { compiled }
      )
      expect(['home.home', 'home.home.home'].map(p => meta(m.M0, p))).toEqual(['L32', 'L32'])
      expect(['home.home.home.home', 'home.home.home.list'].map(p => kind(m.M0, p))).toEqual([
        'object',
        'array',
      ])
    })

    it(`a merge state's slot merged again keeps the props of every member${mode}`, async () => {
      const { m } = await load(
        {
          'm3.as': `export type P1 = I0
export interface I1 {
  work?: P1
  next?: I1
}
export interface H0 {
  u: I0 & {
    home?: I1 & I0
  }
}
export interface I0 {
  kids?: I2[]
  home?: {
    work?: {
      work?: {
        a: string
      }
    }
  }
}
export type P0 = (I1)
export interface I2 {
  a: string
  k?: string
  home: P0
  @meta.label 'L2'
  kids?: I0[]
}
annotate P0 {
  @meta.label 'L8'
  next
  @meta.label 'L9'
  next.work
}
annotate I0 {
  @meta.label 'L31'
  kids.kids.home
  @meta.label 'L39'
  kids.kids.home.work
  @expect.maxLength 5
  kids.a
}
`,
        },
        { compiled }
      )
      expect(
        ['u.home', 'u.home.work', 'u.home.next', 'u.home.work.home'].map(p => meta(m.H0, p))
      ).toEqual(['L31', 'L9', 'L8', 'L31'])
      expect(kind(m.H0, 'u.home.work.kids')).toBe('array')
    })

    // (`M0.home` merges `I3`, `I0.home` and `I3.home`, a union: each branch merges the members
    // not distributed into one structure — they are that structure there, `I3.home` included)
    it(`the branches of a distributed member keep the other members' blocks${mode}`, async () => {
      const { m } = await load(
        {
          'm2.as': `export interface I3 {
  home: (I0 | I2) & I1
}
export interface I0 {
  home: {
    work: {
      n?: string
    }
  }
}
export type M0 = {
  home?: I3
} & I0 & I3
export interface I1 {
  list?: I0[]
}
export interface I2 {
  a: string
}
annotate I3 {
  @meta.label 'L107'
  home
}
`,
        },
        { compiled }
      )
      expect(meta(m.M0, 'home.home')).toBe('L107|L107')
    })

    // (`M1` is declared before `M0`: `M1.work.b` is merged again when `M0.work.b`, which it
    // stands for, has its sources — I3's override over `I2.b`, then `I1.b`)
    it(`a slot merged again before a member's merge is linked follows it${mode}`, async () => {
      const { m } = await load(
        {
          'm3.as': `export type S0 = string
export interface I2 {
  @meta.label 'L10'
  b?: S0
  work: I1
  list: {
    c?: string
  }[]
}
export type M1 = M0 & {
  work: {
    a: string
  }
}
export interface I1 {
  b: string
  d: string
  e: string
  f?: string
  g: string
  h: string
  k?: 'a'
  n?: number | string
  t: [number, string]
}
export type P1 = (I3)
export interface I3 {
  t?: [string, number, string]
  work?: I2
}
@meta.label 'L13'
export type M0 = P1 & I2
annotate I3 {
  @meta.label 'L80'
  @expect.maxLength 3
  @expect.pattern '^[^q]*$'
  work.b
  @meta.label 'L92'
  t
}
`,
        },
        { compiled }
      )
      expect([meta(m.M1, 'work.b'), meta(m.M0, 'work.b')]).toEqual(['L80', 'L80'])
    })

    // (`work` merges `X0.work` and a distributed union written in place: a branch's slot merged
    // again — a block on `I2.c` — keeps the union item's part, `I0.c`)
    it(`a distributed branch takes the slots of a union item built in place${mode}`, async () => {
      const { m } = await load(
        {
          'm2.as': `export type M0 = {
  work: I2
}
export interface H0 {
  w?: X0 & {
    work: (I3 | I0) & I4
  }
}
export interface I2 {
  c: string
}
export interface I4 {
  n?: boolean
}
annotate I2 {
  @expect.pattern '^[^k]*$'
  c
}
export interface I0 {
  @expect.pattern '^[^z]*$'
  c: string
  k?: 'c'
  work: {
    k: string
  }
}
export interface I3 extends I0 {
  n?: 1 | 2
  next?: (I2 & I3) | null
}
@meta.description 'D2'
@meta.readonly
export annotate M0 as X0 {
  @meta.label 'L5'
  work
}
`,
        },
        { compiled }
      )
      for (const branch of [0, 1]) {
        const c = at(m.H0, 'w.work')[0].type.items[branch].type.props.get('c')
        expect(
          c.metadata
            .get('expect.pattern')
            .map((p: any) => p.pattern)
            .sort()
        ).toEqual(['^[^k]*$', '^[^z]*$'])
      }
    })
  }
})

describe("round-23, part 3: a block on a member's own prop in a large merge", () => {
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''

    // (a merge with a member too large to write out in place: its nested merges are merge
    // states, rooted at the members' declarations; `A.p1` is A's own merge of `X & Y`, and the
    // block writes on its `v` in place — no override node — so the place merges again there)
    it(`reaches the place merging the member${mode}`, async () => {
      const n = 70
      const pairs = Array.from(
        { length: n },
        (_, i) =>
          `export interface X${i} {\n  v?: string\n  u?: string\n}\nexport interface Y${i} {\n  v?: string\n  t?: string\n}`
      ).join('\n')
      const wide = (p: string) =>
        Array.from({ length: n }, (_, i) => `  p${i}?: ${p}${i}`).join('\n')
      const { m } = await load(
        {
          'a.as': `export interface X {
  v?: string
  x?: string
}
export interface Y {
  v?: string
  yy?: string
}
export interface Z {
  @expect.maxLength 3
  v?: string
  z?: string
}
export interface A {
  p1?: X & Y
  p2?: X & Y
  big?: W1
}
export interface B {
  p1?: Z
  p2?: Z
  big?: W2
}
${pairs}
export interface W1 {
${wide('X')}
}
export interface W2 {
${wide('Y')}
}
export type M = B & A
annotate A {
  @meta.label 'A.p1.v'
  @expect.maxLength 9
  p1.v
}
`,
        },
        { compiled }
      )
      expect([meta(m.M, 'p1.v'), meta(m.M, 'p1.v', 'expect.maxLength')]).toEqual([
        'A.p1.v',
        '{"length":9}',
      ])
      expect([meta(m.M, 'p2.v'), meta(m.M, 'p2.v', 'expect.maxLength')]).toEqual([
        '-',
        '{"length":3}',
      ])
      expect(verdicts(m.M, [{ p1: { v: 'abcdefg' } }, { p2: { v: 'abcdefg' } }])).toBe('PF')
    })
  }
})

describe('round-23, part 3: JSON schemas of merges at several places', () => {
  // (`$defs` holds one entry for the same schema of types without an id — one merge wherever
  // its members are merged —, named types keep their entries)
  it('holds one $defs entry per distinct anonymous schema', async () => {
    const { m } = await load({
      'a.as': `export interface A {
  y?: string
  next?: A
}
export interface B {
  @expect.maxLength 3
  y?: string
  next?: B
}
export interface X {
  v?: string
}
export interface Y {
  v?: string
}
export interface H {
  a?: A & B
  b?: A & B
  x?: X
  w?: Y
}
`,
    })
    const schema = buildJsonSchema(m.H) as any
    expect(Object.keys(schema.$defs)).toEqual(['Recursive', 'X', 'Y'])
    // (`a` and `b` merge the same members: one type, one entry)
    expect(schema.properties.b).toEqual(schema.properties.a)
    expect(schema.properties.a.anyOf[0]).toEqual({ $ref: '#/$defs/Recursive' })
    expect(schema.$defs.Recursive.properties.next.anyOf[0]).toEqual({ $ref: '#/$defs/Recursive' })
    expect(m.H.toJsonSchema()).toEqual(schema)
  })
})

describe('round-23, part 3: self-collapse scope (owner decision)', () => {
  // A step reaching a type that EXTENDS the annotated type is no collapse (a child is a type of
  // its own); neither is a step reaching a merge or an alias with the annotated type as an
  // intersection member (MODEL §8: self-collapse only through a direct reference, an alias, an
  // array or `| null`; it was a collapse, rule 5).
  const shapes: Record<string, { reach: string; extra: string; collapsed: boolean }> = {
    'a child': {
      reach: 'Sub',
      extra: 'export interface Sub extends Node {\n  extra?: string\n}',
      collapsed: false,
    },
    'a child of a merge alias': {
      reach: 'Sub',
      extra: 'export interface Sub extends M {\n  extra?: string\n}\nexport type M = Node & Meta',
      collapsed: false,
    },
    'an intersection': { reach: 'Node & Meta', extra: '', collapsed: false },
    'an intersection alias': { reach: 'M', extra: 'export type M = Node & Meta', collapsed: false },
  }
  for (const compiled of ENGINES) {
    const mode = compiled ? ' (compiled)' : ''
    for (const [name, shape] of Object.entries(shapes)) {
      it(`a step reaching ${name} of the annotated type${mode}`, async () => {
        const { m, js } = await load(
          {
            'a.as': `export interface Node {
  name?: string
  next?: ${shape.reach}
}
export interface Meta {
  note?: string
}
${shape.extra}
annotate Node {
  @meta.label 'X'
  next.name
}
`,
          },
          { compiled }
        )
        // (P4B default format: a block is printed as data, `$blk(…)`, each entry with its steps)
        const paths = js['a.as']
          .match(/\[\["meta\.label", "X"\]\], \[[^\n]*\]\]/g)
          ?.map(e =>
            [...e.slice(e.indexOf('], [') + 3).matchAll(/\["([^"]+)", \d+\]/g)].map(x => x[1])
          )
        expect(paths).toEqual([shape.collapsed ? ['name'] : ['next', 'name']])
        expect([
          meta(m.Node, 'name'),
          meta(m.Node, 'next.name'),
          meta(m.Node, 'next.next.name'),
        ]).toEqual(
          // (a child reaches the annotated type's own nodes below it: the override is below every
          // `Node` reached, at that path)
          shape.collapsed ? ['X', 'X', 'X'] : ['-', 'X', 'X']
        )
      })
    }

    it(`merged parents: a slot merging the annotated type collapses, a child does not${mode}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I0 {
  next?: I2
}
export interface I1 {
  next?: I0
  t?: string
}
export interface I2 extends I0, I1 {}
annotate I2 {
  @meta.label 'L21'
  next.t
}
export type P0 = (J1)
export interface J1 {
  next?: J2
  home?: {
    b?: string
  }
}
export interface J2 extends J1, J0 {}
export interface J0 {
  home?: {
    c?: string
  }
}
annotate P0 {
  @meta.label 'L31'
  next.home.b
}
`,
        },
        { compiled }
      )
      // (`I2.next` merges I0's `next` — an I2 — and I1's: the annotated type as a member, which is
      // no collapse (MODEL §8): the override is at `I2.next.t` only (the oracle agrees; it was
      // 'L21' at I2.t and I0.next.t too)
      expect([meta(m.I2, 't'), meta(m.I0, 'next.t'), meta(m.I2, 'next.t')]).toEqual([
        '-',
        '-',
        'L21',
      ])
      // (`J1.next` is a J2, a child of J1: no collapse; the override is at `next.home.b` below
      // every J1 reached — J2 inherits J1's `next`)
      expect([
        meta(m.J1, 'home.b'),
        meta(m.J1, 'next.home.b'),
        meta(m.J1, 'next.next.home.b'),
      ]).toEqual(['-', 'L31', 'L31'])
    })
  }
})

describe('PERF: one node shape', () => {
  // The validators read every node they visit (`optional`, `type`, `metadata`): nodes of several
  // shapes — a path override's node lacking `optional`, a builder node getting `ref` / `id` /
  // `optional` in call order — made those reads polymorphic, and a recursive type with a path
  // override validated 7–10 % slower than in 0.1.110.
  it('builder nodes, path overrides, references, merges and runtime re-merges share it', async () => {
    const { m } = await load({
      'a.as': `export interface User {
  name: string
  next?: User
  home: Addr
  work?: Addr
  m?: P & Q
  r?: R1 & R2
}
export interface Addr {
  city: string
  zip?: string
}
export interface P { a?: Addr; p?: string }
export interface Q { a?: Addr; q?: string }
export interface R1 { next?: R1 & R2; x?: string }
export interface R2 { next?: R2; y?: string }
export type C = User.home
export annotate User as UA {
  @meta.label "ua"
  work.zip
}
annotate User {
  @expect.maxLength 20
  home.city
}
annotate R2 {
  @meta.label "r2"
  next.y
}
`,
    })
    const shapes = new Set<string>()
    const seen = new Set<unknown>()
    const visit = (node: TAtscriptAnnotatedType, depth: number) => {
      if (seen.has(node) || depth > 8) {
        return
      }
      seen.add(node)
      if (typeof node !== 'function') {
        shapes.add(Object.keys(node).join(','))
      }
      const type = node.type as any
      for (const child of [...(type.props?.values() ?? []), ...(type.items ?? []), type.of]) {
        if (child) {
          visit(child, depth + 1)
        }
      }
    }
    for (const type of Object.values(m)) {
      visit(type, 0)
    }
    expect(seen.size).toBeGreaterThan(20)
    expect([...shapes]).toEqual([
      '__is_atscript_annotated_type,metadata,type,validator,ref,id,optional',
    ])
    // Path-override shells share their accessors (one hidden class): accessors made per shell
    // gave each shell a class of its own, and a type with one path override validated 35–45 %
    // slower (P5 close perf table).
    const accessors = new Set<unknown>()
    let shells = 0
    for (const node of seen) {
      if (typeof node !== 'function' && Object.getOwnPropertyDescriptor(node, 'type')?.get) {
        shells++
        for (const k of ['type', 'ref', 'id']) {
          accessors.add(Object.getOwnPropertyDescriptor(node, k)?.get)
        }
      }
    }
    expect(shells).toBeGreaterThan(1)
    expect(accessors.size).toBe(3)
  })

  it('layered nodes (references, shells, merged fields, hidden classes) share it too', () => {
    const cls = (id?: string) =>
      class {
        static __is_atscript_annotated_type = true
        static type = {}
        static metadata = new Map()
        static id = id
      } as unknown as TAtscriptAnnotatedType
    const str = () => $n().designType('string').tags('string')
    // interface Addr { city: string; next?: Addr }  interface P { a?: Addr; p?: string }
    // interface Q { a?: Addr; q?: string }  interface User { home: Addr; list?: Addr[]; m?: P & Q }
    // annotate User { @meta.label 'h' home.city }
    const [Addr, P, Q, M, User] = [cls('Addr'), cls('P'), cls('Q'), cls(), cls('User')]
    $n('object', Addr).prop('city', str().$type).prop('next', $n().ref(Addr).optional().$type)
    $n('object', P).prop('a', $n().ref(Addr).optional().$type).prop('p', str().optional().$type)
    $n('object', Q).prop('a', $n().ref(Addr).optional().$type).prop('q', str().optional().$type)
    $n('object', M)
      .over([Q, P], true)
      .prop(
        'a',
        $n()
          .type(Addr)
          .optional()
          .over([$f(Q, 'a'), $f(P, 'a')]).$type
      )
      .prop('p', $f(P, 'p'))
      .prop('q', $f(Q, 'q'))
    $n('object', User)
      .prop('home', $n().ref(Addr).$type)
      .prop('list', $n('array').of($n().ref(Addr).$type).optional().$type)
      .prop('m', $n().ref(M).optional().$type)
    $blk([1, 'm:u'], 0, User, [
      [
        [['meta.label', 'h']],
        [
          ['home', 0],
          ['city', 2],
        ],
      ],
    ])
    const shapes = new Set<string>()
    const seen = new Set<unknown>()
    const visit = (node: TAtscriptAnnotatedType, depth: number) => {
      if (seen.has(node) || depth > 6) {
        return
      }
      seen.add(node)
      if (typeof node !== 'function') {
        shapes.add(Object.keys(node).join(','))
      }
      const type = node.type as any
      for (const child of [...(type.props?.values() ?? []), ...(type.items ?? []), type.of]) {
        if (child) {
          visit(child, depth + 1)
        }
      }
    }
    for (const type of [Addr, P, Q, M, User]) {
      visit(type, 0)
    }
    expect(seen.size).toBeGreaterThan(12)
    expect([...shapes]).toEqual([
      '__is_atscript_annotated_type,metadata,type,validator,ref,id,optional',
    ])
    // (hot-path map classes: the tracked map, or the layered one)
    const maps = new Set(
      [...seen].map(n => (n as TAtscriptAnnotatedType).metadata.constructor.name)
    )
    expect([...maps].sort()).toEqual(['AnnotationMap', 'LayerMap'])
  })
})

describe('round-24 classes (the merge model)', () => {
  /** Interfaces `A0` … `A<n-1>`, each with `k` (maxLength 3) and a prop of its own. */
  const branches = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `export interface A${i} {\n  @expect.maxLength 3\n  k?: string\n  a${i}?: string\n}`
    ).join('\n')
  const union = (n: number) => Array.from({ length: n }, (_, i) => `A${i}`).join(' | ')

  for (const compiled of ENGINES) {
    it(`CAP-DIST: a union operand distributes whatever its size${compiled ? ' (compiled)' : ''}`, async () => {
      const { m } = await load(
        {
          'a.as': `${branches(40)}
export interface B {
  @expect.maxLength 9
  k?: string
}
export interface H2 { h?: (${union(2)}) & B }
export interface H33 { h?: (${union(33)}) & B }
export interface H40 { h?: (${union(40)}) & B }
`,
        },
        { compiled }
      )
      for (const [name, n] of [
        ['H2', 2],
        ['H33', 33],
        ['H40', 40],
      ] as const) {
        expect(kind(m[name], 'h'), name).toBe(`union[${n}]`)
        // (B is the later member: its maxLength wins in every branch)
        expect(verdicts(m[name], [{ h: { k: 'abcdef' } }, { h: { k: 'abcdefghijk' } }]), name).toBe(
          'PF'
        )
      }
    })

    // MODEL §6 + §9 U5: `I0.next?: (I1 | I2) & I0` is a union operand of a merge on I0's own
    // recursion: a compile error now (it was: each distributed branch merges every contributor).
    it(`RU3: a distributed branch merges every contributor's node${compiled ? ' (compiled)' : ''}`, async () => {
      const errors = await buildErrors({
        'a.as': `export interface I2 {
  next?: I1
}
export interface I0 {
  next?: (I1 | I2) & I0
}
annotate I2 {
  @expect.pattern '^[^k]*$'
  next.b
}
export interface I1 {
  @expect.pattern '^[^q]*$'
  b: string
}
`,
      })
      expect([compiled, errors]).toEqual([compiled, [UNIREC]])
    })
  }

  it('RU3 (b): every branch of a distributed merged slot carries its members’ class', async () => {
    const { m } = await load({
      'a.as': `export type M1 = M0 & I1 & {
  home?: (I2 | I1) & I3
}
export interface I1 {
  home: I0
}
export interface I2 {
  home?: I1
}
export interface I3 {
  c: string
}
export type M0 = {
  home: I2
}
@meta.label 'L33'
export interface I0 {
  t?: string
}
`,
    })
    expect(kind(m.M1, 'home')).toBe('union[2]')
    // (a contributor that is not the union passes the branch step through: I1.home is I0's)
    for (const branch of m.M1.type.props.get('home').type.items) {
      expect(branch.metadata.get('meta.label')).toBe('L33')
    }
  })

  // (MODEL §5: an in-place member is the highest contributor — at every depth below it too, as the
  // oracle's D_INPLACE=top —, written first or last: H1.v.home.a is the in-place `home`'s I0.a,
  // 'L1', as H0's; it was 'L27', I3's block path layer, the later member in written order)
  it('NU-P: an in-place contributor wins over a member’s path layer, written first or last', async () => {
    const { m } = await load({
      'a.as': `export interface I3 {
  home: I0
}
annotate I3 {
  @meta.label 'L27'
  home.a
}
export interface I0 {
  @meta.label 'L1'
  a: string
}
export interface H0 {
  v: I3 & {
    home?: I0 | null
  }
}
export interface H1 {
  v: { home?: I0 | null } & I3
}
`,
    })
    expect(meta(m.H0, 'v.home.a')).toBe('L1')
    expect(meta(m.H1, 'v.home.a')).toBe('L1')
    expect(meta(m.I3, 'home.a')).toBe('L27')
  })

  it('XS: the same merge in two modules is one object', async () => {
    const { m } = await load({
      'a.as': `export interface A {
  @meta.label 'A.x'
  x?: string
}
export interface B {
  @expect.maxLength 3
  x?: string
}
export type M = A & B
export interface H1 { m?: A & B }
`,
      'b.as': `import { A, B } from './a'
export interface H2 { m?: A & B }
export type M2 = A & B
`,
    })
    // MODEL §5: the same merge in two modules is two objects (one hidden class per module), and a
    // named merge is a class of its own: four objects; a raw write on M's field is local to M
    // (MODEL §7). It was: one object, the write failing all four ('FFFF').
    const x = [at(m.M, 'x')[0], at(m.H1, 'm.x')[0], at(m.H2, 'm.x')[0], at(m.M2, 'x')[0]]
    expect(new Set(x).size).toBe(4)
    x[0].metadata.set('expect.maxLength', { length: 1 })
    expect(
      [
        verdicts(m.M, [{ x: 'ab' }]),
        verdicts(m.H1, [{ m: { x: 'ab' } }]),
        verdicts(m.H2, [{ m: { x: 'ab' } }]),
        verdicts(m.M2, [{ x: 'ab' }]),
      ].join('')
    ).toBe('FPPP')
  })

  it('NT2: a branch whose merge is `never` is dropped', async () => {
    const { m } = await load({
      'a.as': `export interface I0 {
  n?: number
}
export interface I1 {
  n?: 2
}
export type M0 = I0 & {
  n?: 1 | 2
}
export interface C0 extends I1, M0 {
}
export type K0 = I1 & M0
`,
    })
    for (const name of ['C0', 'K0']) {
      expect(kind(m[name], 'n'), name).toBe('number=2')
      expect(JSON.stringify(buildJsonSchema(m[name]).properties.n), name).not.toContain('"not"')
    }
    expect(kind(m.M0, 'n')).toBe('union[2]')
  })

  it('BLOW: generated code does not grow with the merges members combine into', async () => {
    const source = (n: number) =>
      Array.from({ length: n }, (_, i) => {
        const j = (i + 1) % n
        const k = (i + 2) % n
        return `export interface T${i} {
  v${i}?: string
  o?: T${j} & { p?: T${k} & T${j}, o?: T${i} }
  s?: T${i} & { s?: T${j} }
}`
      })
        .join('\n')
        .concat('\nexport interface Root {\n  r?: T0 & T1\n}\n')
    // MODEL §5: one hidden class per distinct merge per module (the code does grow with the merges
    // members combine into); §6 safety net: four such classes are 245 hidden merge classes
    // (> 200), a compile error. (It was: n = 2 and 4 load, the code linear in the source.)
    expect(await buildErrors({ 'a.as': source(4) })).toEqual([
      'merge too complex: split it with named types',
    ])
    // (a bundled JSON schema spells every merge out: not generated here)
    const { m } = await load({ 'a.as': source(2) }, { jsonSchema: false })
    // (validates through the merges at any depth)
    let value: any = { v0: 'x' }
    for (let i = 0; i < 6; i++) {
      value = { o: value, s: { s: { v1: 'y' } } }
    }
    expect(verdicts(m.Root, [{ r: value }])).toBe('P')
  })

  it('CAP-MISC: a block on the head of a long alias chain reaches its end', async () => {
    const n = 70
    const aliases = Array.from({ length: n }, (_, i) => `export type A${i} = A${i + 1}`).join('\n')
    const { m } = await load({
      'a.as': `${aliases}
export interface A${n} {
  y?: string
}
export interface H { h?: A0 }
export interface G { g?: A${n} }
annotate A0 {
  @meta.label 'blk'
  y
}
`,
    })
    expect(meta(m[`A${n}`], 'y')).toBe('blk')
    expect(meta(m.G, 'g.y')).toBe('blk')
    expect(meta(m.H, 'h.y')).toBe('blk')
  })

  it('CAP-MISC: every merge that resolves to `never` is reported, at any depth', async () => {
    const deep = (d: number) => `${'{ a?: '.repeat(d)}{ m?: A & B }${' }'.repeat(d)}`
    const { warnings } = await load({
      'a.as': `export interface X { x?: string }
export interface Y { y?: string }
export interface A { ${Array.from({ length: 12 }, (_, i) => `u${i}?: X | Y`).join('; ')} }
export interface B { ${Array.from({ length: 12 }, (_, i) => `u${i}?: X`).join('; ')} }
export type M = A & B
export interface D34 { a?: ${deep(33)} }
`,
    })
    const never = warnings.filter(w => w.includes('resolves to never'))
    for (let i = 0; i < 12; i++) {
      expect(
        never.some(w => w.includes(`"M.u${i}"`)),
        `M.u${i}`
      ).toBe(true)
    }
    expect(never.some(w => w.includes('D34.a.'))).toBe(true)
  })
})

describe('round-24 classes, part 2', () => {
  it('NV-CH: a chain reference to a prop a merge made `never` is that `never`, optional — no error', async () => {
    const { m, warnings } = await load({
      'a.as': `export interface A {
  y?: string
  u?: string
}
export interface B {
  y?: string
  u?: number
}
export type M = A & B
export interface C {
  v?: M.u
}
`,
    })
    expect(warnings.some(w => w.includes('"M.u"') && w.includes('resolves to never'))).toBe(true)
    const v = m.C.type.props.get('v')
    expect(v.optional).toBe(true)
    expect(v.type.designType).toBe('never')
    expect(verdicts(m.C, [{}, { v: 1 }, { v: 'x' }])).toBe('PFF')
  })

  it('a block whose path goes through a merge of classes declared below it applies (oracle 128-g5)', async () => {
    const { m } = await load({
      'a.as': `export interface I1 {
  next?: I1 & P1
  home?: {
    a?: string
  }
}
export type CL0 = I1.next.home
annotate CQ1 {
  @expect.maxLength 8
  a
}
export type CQ1 = CL0 & {
  z?: string
}
export type P1 = I1
`,
    })
    expect(verdicts(m.CQ1, [{ a: 'abcdefgh' }, { a: 'abcdefghi' }])).toBe('PF')
  })

  it('tuples of different lengths, then one of the first length, merge into `never` (oracle v4 289, 487)', async () => {
    const { m } = await load({
      'a.as': `export interface A { t?: [string, number] }
export interface B { t?: [string, number, string] }
export interface C { t?: [string, number] }
export interface H { m?: A & B & C }
`,
    })
    expect(verdicts(m.H, [{}, { m: {} }, { m: { t: ['a', 1] } }])).toBe('PPF')
  })

  // Fresh oracle range (v5/v4 2001–3000), round 24 part 2.
  for (const compiled of ENGINES) {
    it(`an interface extending an intersection alias does not get its parents' type-level annotations (v4 2667)${compiled ? ' (compiled)' : ''}`, async () => {
      const { m } = await load(
        {
          'a.as': `@meta.label 'L0'
export interface I0 {
  k: string
}
@meta.label 'L4'
export interface I1 extends I0 {
  n: number
}
@meta.label 'L5'
export type M0 = (I0 | null) & (I1 | null)
@meta.description 'D1'
export interface C0 extends M0 {}
`,
        },
        { compiled }
      )
      expect(m.C0.metadata.get('meta.label')).toBeUndefined()
      expect(m.C0.metadata.get('meta.description')).toBe('D1')
      expect(m.M0.metadata.get('meta.label')).toBe('L5')
      expect(m.C0.toJsonSchema()).toEqual(buildJsonSchema(m.C0))
    })

    it(`a type merging one member twice is a merge of its own, not an alias (v4 2729, 2448)${compiled ? ' (compiled)' : ''}`, async () => {
      const { m } = await load(
        {
          'a.as': `@meta.label 'L0'
export interface I0 {
  a?: string
}
export type N0 = I0 | null
export type M1 = N0 & N0
@meta.label 'L13'
export type M2 = N0 & N0
@meta.description 'D1'
annotate M1 {}
@meta.label 'L37'
annotate M2 {}
annotate M2 {
  @expect.maxLength 2
  a
}
`,
        },
        { compiled }
      )
      // (its members' type-level annotations — a nullable member's type's too —, its own over them)
      expect(m.M1.metadata.get('meta.label')).toBe('L0')
      expect(m.M1.metadata.get('meta.description')).toBe('D1')
      expect(m.M2.metadata.get('meta.label')).toBe('L37')
      // (its blocks are its own)
      expect(m.N0.metadata.get('meta.description')).toBeUndefined()
      expect(m.N0.metadata.get('meta.label')).toBeUndefined()
      expect(verdicts(m.M2, [{ a: 'ab' }, { a: 'abc' }, null])).toBe('PFP')
      expect(verdicts(m.N0, [{ a: 'abc' }])).toBe('P')
      expect(m.M2.toJsonSchema()).toEqual(buildJsonSchema(m.M2))
    })

    it(`a chain member whose field merges its own declaration carries the field's type's annotations (v5 2615)${compiled ? ' (compiled)' : ''}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface I1 {
  k?: string
}
@meta.description 'D0'
export interface I2 extends I1 {
  next?: I2 & I1
}
export interface CH0 {
  q?: I2.next.next.next & { z?: string }
  r?: I2.next.next.next
}
`,
        },
        { compiled }
      )
      expect(m.CH0.type.props.get('r').metadata.get('meta.description')).toBe('D0')
      expect(m.CH0.type.props.get('q').metadata.get('meta.description')).toBe('D0')
    })
  }

  // Dense seeds of the battery (`denseSchema(seed)`, `test-utils.ts`), round 24 part 2.
  const DENSE: Record<number, Record<string, string>> = {
    '858': {
      'd0.as':
        'import { S1, S3 } from \'./d1\'\n\nexport interface S0 {\n  d?: (S1 & { f: S3[] }) | S2[]\n  f?: ({ d: (S4 & null) | S4 | (S0 | S2) }) & (((number & S0) & (S3 | S0) & S1)[])\n  e: S0[]\n}\n\nexport interface S2 {\n  f: string.email\n  e: ({ e: (S2 | S1) & S2 }) | string | (({ d?: S4[], e: S4 | S2 | S4 }) | (S3[] | (S0 | S2) | { e: S3, f: S0 }))\n}\n\nexport interface S4 {\n  f: S0[]\n}\n\nexport type T0 = (S2 | (S4 | S0) | (null & S2 & S4)) & S4 & ((string.email & S2 & null) & { f?: S2 })\n\nannotate S0 {\n  @meta.label "m"\n  d.d\n}\n',
      'd1.as':
        'import { S0, S2, S4 } from \'./d0\'\n\nexport interface S1 {\n  e: S0\n  d: S0\n}\n\nexport interface S3 {\n  e: { d: null, e: boolean | S0[] }\n}\n\nexport type T1 = ((S0 & S0 & S0) & { e: S4 } & (S3 | boolean | S3)) & { f: { d?: S0 }, e: S4 } & ({ f?: { d: string.email }, d: S1 & S3 & S3 })\n\nexport annotate S0 as A1 {\n  @meta.label "a"\n  e.e\n}\n',
    },
    '874': {
      'd0.as':
        'import { S1 } from \'./d1\'\n\nexport interface S0 {\n  f: (((S2 & S0) & (S1 & S0) & (S2 | S1)) | ({ e: S1 } | (S1 & S1 & S0) | (S0 | S1 | S1))) | ((S1 | boolean[] | S2) & ({ f: S1 & S0 & S2 })) | S1\n  d: S0\n}\n\nexport interface S2 {\n  d: S1\n}\n\nexport type T0 = S1 & ((null | null | boolean) | S1) & S1\n\nannotate S2 {\n  @meta.label "m"\n  d.e\n}\n',
      'd1.as':
        'import { S0, S2 } from \'./d0\'\n\nexport interface S1 {\n  e: number | { f: S0 }\n  d: (S1 & string & ({ f: S0, e?: S0 } | (S1 & S2 & null))) | ({ f: { f: S0 } & S1[] })\n}\n\nexport type T1 = S0[] & (S1 & (string & S0) & { f: S1 }) & ({ e: { d?: S2 }, f: number & S2 })\n\nexport annotate S1 as A1 {\n  @meta.label "a"\n  e\n}\n',
    },
    '1314': {
      'd0.as':
        'import { S1, S3, S5 } from \'./d1\'\n\nexport interface S0 {\n  f: { e?: { e: S2 } }[]\n  d: { e?: number, d?: (S3[] | { d: S1 } | string.email) | number | S5 }\n}\n\nexport interface S2 {\n  e: (((S1 & string.email) | { e: S3 }) & ({ d?: S0, e?: S3 } & { d: S5, e: S3 } & { f: S1, d: number })) & (S0 | ({ e: S4, f: S3 } & { e: S5 } & (S2 | S4 | S1)))\n  d?: (({ d: S2 } | S4) | ((S0 | S4) & S5)) & string.email\n}\n\nexport interface S4 {\n  e: { d?: S4[][] | (S2 | { d: string }) }\n}\n\nexport type T0 = ({ d: string } & S3 & S4) & S3\n\nannotate S2 {\n  @meta.label "m"\n  e.f\n}\n',
      'd1.as':
        'import { S0, S2, S4 } from \'./d0\'\n\nexport interface S1 {\n  f?: ({ e: S3[] } | S0) | S4\n}\n\nexport interface S3 {\n  e: (((S5 | S4 | string)[])[]) & S5 & S1[]\n  d: ({ e: S1[] | (S2 | S0 | string.email) })[]\n}\n\nexport interface S5 {\n  d: ({ f: { d: S3, f?: number } } | ({ d: string.email } | { e: S0, f: boolean }))[]\n}\n\nexport type T1 = S0 & S5\n\nexport annotate S4 as A1 {\n  @meta.label "a"\n  e\n}\n',
    },
  }

  it('dense 874: generated code writes the operands a merge was built from, not the nodes the core built (no endless nesting)', async () => {
    const { m } = await load(DENSE[874], { jsonSchema: false })
    expect(m.S0.validator().validate({ d: { e: 'x' } }, true)).toBe(false)
  })

  it('dense 858: a distributed branch that is one of its operands’ named types names it (serialization closes its recursion)', async () => {
    const { m } = await load(DENSE[858], { jsonSchema: false })
    const { serializeAnnotatedType, deserializeAnnotatedType } =
      await import('../runtime/serialize')
    for (const t of Object.values<any>(m).filter(t => t?.__is_atscript_annotated_type)) {
      const payload = JSON.stringify(serializeAnnotatedType(t))
      expect(
        JSON.stringify(serializeAnnotatedType(deserializeAnnotatedType(JSON.parse(payload))))
      ).toBe(payload)
    }
  })

  it('dense 643: a merge that is one of its operands’ named types names it (serialization closes its recursion)', async () => {
    const { m } = await load(
      {
        'd0.as':
          'import { S1, S3 } from \'./d1\'\n\nexport interface S0 {\n  f: string.email\n}\n\nexport interface S2 {\n  e: S2 & ((S2 & boolean & { d: S2, f: string }) | number | S2)\n}\n\nexport type T0 = { e: string }[] & { d: { e: S3 } }\n\nannotate S1 {\n  @meta.label "m"\n  d\n}\n',
        'd1.as':
          'import { S0, S2 } from \'./d0\'\n\nexport interface S1 {\n  e: S2\n  d: number\n}\n\nexport interface S3 {\n  e: { e: number }[]\n  f: S0\n  d: S0\n}\n\nexport type T1 = S1[] & ({ e: S0, d: S1 } | S0 | boolean[]) & (S0 & S1[])\n\nexport annotate S0 as A1 {\n  @meta.label "a"\n  f\n}\n',
      },
      { jsonSchema: false }
    )
    const { serializeAnnotatedType, deserializeAnnotatedType } =
      await import('../runtime/serialize')
    expect(m.S2.type.props.get('e').id).toBe('S2')
    for (const t of Object.values<any>(m).filter(t => t?.__is_atscript_annotated_type)) {
      const payload = JSON.stringify(serializeAnnotatedType(t))
      expect(
        JSON.stringify(serializeAnnotatedType(deserializeAnnotatedType(JSON.parse(payload))))
      ).toBe(payload)
    }
  })

  it('dense 1314: a block through a merge distributed over a union nested in a member lands on the runtime branches', async () => {
    const { m } = await load(DENSE[1314], { jsonSchema: false })
    const e = m.S2.type.props.get('e')
    expect(e.type.kind).toBe('union')
    for (const branch of e.type.items) {
      expect(branch.type.props.get('f').metadata.get('meta.label')).toBe('m')
    }
  })

  it('BLOW: a bundled schema holds one `$defs` entry per distinct schema, in any prop order', async () => {
    // MODEL §6 safety net: n = 4 is 245 hidden merge classes in one module (> 200), a compile
    // error (see the BLOW test above); n = 3 (67) is the largest of the family that builds.
    const n = 3
    const source = Array.from({ length: n }, (_, i) => {
      const j = (i + 1) % n
      const k = (i + 2) % n
      return `export interface T${i} {
  v${i}?: string
  o?: T${j} & { p?: T${k} & T${j}, o?: T${i} }
  s?: T${i} & { s?: T${j} }
}`
    })
      .join('\n')
      .concat('\nexport interface Root {\n  r?: T0 & T1\n}\n')
    const { m } = await load({ 'a.as': source })
    const schema = m.Root.toJsonSchema()
    expect(schema).toEqual(buildJsonSchema(m.Root))
    // (merges of the same members in other orders are one entry: 78 entries, 44 KB before)
    expect(Object.keys(schema.$defs).length).toBeLessThanOrEqual(20)
    expect(JSON.stringify(schema).length).toBeLessThan(15_000)
  })

  for (const jsonSchema of ['bundle', 'lazy'] as const) {
    it(`JSON-STALE: \`toJsonSchema()\` reflects runtime edits (${jsonSchema})`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface A {
  y?: string
  next?: A
}
export interface B {
  y?: string
  b?: B
}
export type M = A & B
export interface H {
  m?: M
  n?: A & B
}
`,
        },
        { jsonSchema: jsonSchema === 'lazy' ? 'lazy' : undefined }
      )
      // (the runtime the generated modules loaded)
      const utils = await import('@atscript/typescript/utils')
      for (const t of [m.H, m.M, m.A]) {
        expect(t.toJsonSchema()).toEqual(buildJsonSchema(t))
      }
      // (raw writes are local, low-level) a bundled literal does not see
      // raw metadata writes (as in 0.1.110); the lazy schema is built from the nodes, which do.
      const lazy = jsonSchema === 'lazy'
      const before = new Map([m.H, m.M, m.A, m.B].map(t => [t, buildJsonSchema(t)]))
      const expected = (t: any) => (lazy ? buildJsonSchema(t) : before.get(t))
      utils.annotate(m.A.type.props.get('y').metadata, 'expect.maxLength', { length: 3 })
      for (const t of [m.H, m.M, m.A]) {
        expect(t.toJsonSchema()).toEqual(expected(t))
      }
      expect(m.A.toJsonSchema().properties.y.maxLength).toBe(lazy ? 3 : undefined)
      m.B.type.props.get('y').metadata.set('expect.minLength', { length: 5 })
      for (const t of [m.H, m.M, m.B]) {
        expect(t.toJsonSchema()).toEqual(expected(t))
      }
      expect(JSON.stringify(m.M.toJsonSchema()).includes('"minLength":5')).toBe(lazy)
    })
  }
})

describe('the object item of an all-nullable merge', () => {
  // `(A | null) & (B | null)` is `union(merged object, null)`; the object is the merge of A and B,
  // so it layers over the operands like any merge (the union node does too).
  for (const compiled of ENGINES) {
    it(`a named merge, a place and a merged field: item 0 reads through the operands${compiled ? ' (compiled)' : ''}`, async () => {
      const { m } = await load(
        {
          'a.as': `@meta.label 'L1'
export interface I1 {
  b: string
  work?: W1 | null
}
@meta.description 'D0'
export interface I0 {
  c?: string
  work?: W0 | null
}
@meta.label 'W1'
export interface W1 {
  x?: string
}
@meta.description 'W0'
export interface W0 {
  y?: string
}
export type M0 = (I1 | null) & (I0 | null)
export interface H {
  m?: (I1 | null) & (I0 | null)
}
export type M3 = I1 & {
  @meta.label 'P'
  work?: W0 | null
}
`,
        },
        { compiled }
      )
      const meta = (n: TAtscriptAnnotatedType) => [
        n.metadata.get('meta.label') ?? '-',
        n.metadata.get('meta.description') ?? '-',
      ]
      const item = m.M0.type.items[0]
      expect(meta(m.M0)).toEqual(['L1', 'D0'])
      expect(meta(item)).toEqual(['L1', 'D0'])
      const place = m.H.type.props.get('m')
      expect(meta(place.type.items[0])).toEqual(['L1', 'D0'])
      // (a merged field every contributor of which is nullable: its item merges the items)
      const work = item.type.props.get('work')
      expect(meta(work.type.items[0])).toEqual(['W1', 'W0'])
      // (an in-place contributor: its item, not its field node — the field's own annotations stay on the union)
      const work3 = m.M3.type.props.get('work')
      expect(meta(work3)).toEqual(['P', '-'])
      expect(meta(work3.type.items[0])).toEqual(['W1', 'W0'])
      // (a raw write on an operand shows through the item: a layer, not a copy)
      m.I0.metadata.set('meta.description', 'D9')
      expect(meta(item)).toEqual(['L1', 'D9'])
      expect(verdicts(m.M0, [{ b: 'x' }, null, { c: 'y' }])).toBe('PPF')
    })
  }
})

describe('a block on an inherited field does not change a merge of it (battery mf seed 2100082)', () => {
  // `T1 extends S2` reaches S2's `b`; a block on `T1.b` gives T1 a shell there (MODEL §4), so
  // `S2 & T1` has two contributors for `b` — with ONE written type: the merge is that type (MODEL
  // §3: a block writes metadata only), not the `never` of two arrays of arrays.
  for (const compiled of ENGINES) {
    it(`an array of arrays inherited and annotated stays an array of arrays${compiled ? ' (compiled)' : ''}`, async () => {
      const { m } = await load(
        {
          'a.as': `export interface S2 {
  b: {
    e: string
  }[][]
}
export interface T1 extends S2 {
  d: string
}
annotate T1 {
  @meta.description 'Z0'
  b
}
export type M2 = S2 & T1
`,
        },
        { compiled }
      )
      const b = m.M2.type.props.get('b')
      expect(b.type.kind).toBe('array')
      expect(b.metadata.get('meta.description')).toBe('Z0')
      expect(
        verdicts(m.M2, [
          { b: [[{ e: 'x' }]], d: 'y' },
          { b: [[{ e: 1 }]], d: 'y' },
        ])
      ).toBe('PF')
    })
  }
})

describe('a shell def counts as the def it shells for structure (MODEL §14 N3)', () => {
  // A metadata-only block never changes verdicts or buildability: `S2.a` gets a shell def from
  // the block on `a.ownS1`, and `S1 & S2` still merges `a` as the one written type `S1 | S2`
  // (it was `never`; merged as two defs it was a union in a recursive merge, a compile error).
  const src = `export interface S1 {
  ownS1?: string
  a?: S1 | S2
}
export interface S2 extends S1 {
  x?: string
}
export type M = S1 & S2
`
  const block = `annotate S2 {
  @meta.description 'Z'
  a.ownS1
}
`
  for (const compiled of ENGINES) {
    it(`a block below an inherited union field keeps the merge's verdicts${compiled ? ' (compiled)' : ''}`, async () => {
      const values = [{ a: { ownS1: 'q' } }, { a: { ownS1: 1 } }, { a: { x: 'y', a: {} } }, {}]
      const plain = await load({ 'a.as': src }, { compiled })
      const blocked = await load({ 'a.as': src + block }, { compiled })
      expect(verdicts(plain.m.M, values)).toBe('PFPP')
      expect(verdicts(blocked.m.M, values)).toBe('PFPP')
      // (the shell still layers: its block shows through the merged field's branches)
      const a = blocked.m.M.type.props.get('a')
      expect(a.type.kind).toBe('union')
      expect(
        blocked.m.S2.type.props
          .get('a')
          .type.items[0].type.props.get('ownS1')
          .metadata.get('meta.description')
      ).toBe('Z')
    })
  }
})
