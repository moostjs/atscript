import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { AnnotationSpec, build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import { buildJsonSchema } from '../runtime/json-schema'

/*
 * Final acceptance of the metadata-layer switch (r26): one test per root cause the oracle and the
 * cascade found, each a minimal project. The expected values are MODEL.md's.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type TModules = Record<string, any>

/**
 * Builds `files` in one build (`partial`: one build per file, each writing its own module only),
 * loads the modules in `order` (default: as listed).
 */
async function load(
  files: Record<string, string>,
  opts: {
    compiled?: boolean
    order?: string[]
    annotations?: Record<string, unknown>
    partial?: boolean
  } = {}
): Promise<TModules> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-final-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}')
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  for (const entries of opts.partial ? Object.keys(files).map(f => [f]) : [Object.keys(files)]) {
    const repo = await build({
      rootDir: dir,
      entries,
      plugins: [tsPlugin({ compileValidators: !!opts.compiled })],
      ...(opts.annotations ? { annotations: opts.annotations as never } : {}),
    })
    const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
    expect(errors.map(m => m.message)).toEqual([])
    for (const out of await repo.generate({ format: 'js' })) {
      if (entries.includes(path.basename(out.source))) {
        writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
      }
    }
  }
  vi.resetModules()
  const modules: TModules = {}
  for (const name of opts.order ?? Object.keys(files)) {
    Object.assign(modules, await import(path.join(dir, `${name}.js`)))
  }
  return modules
}

/** The node at a dotted path (`[]` an element, `|i` a union item). */
function at(type: any, dotted: string): any {
  let node = type
  for (const step of dotted.split('.').filter(Boolean)) {
    node =
      step === '[]'
        ? node.type.of
        : step.startsWith('|')
          ? node.type.items[Number(step.slice(1))]
          : node.type.props.get(step)
  }
  return node
}

/** `n` interfaces `O<i>` and `type T = (string | O0) & … & (string | O<n-1>)` (MODEL §15 FIX7-1). */
function unionOperands(n: number): string {
  return [
    ...Array.from({ length: n }, (_, i) => `export interface O${i} {\n  a${i}?: string\n}`),
    `export type T = ${Array.from({ length: n }, (_, i) => `(string | O${i})`).join(' & ')}`,
  ].join('\n')
}

/** Whether `type` accepts `value` (its validator, errors thrown off). */
const ok = (type: any, value: unknown) => type.validator().validate(value, true)

const meta = (type: unknown, dotted: string, key = 'meta.label') =>
  at(type, dotted)?.metadata.get(key)

for (const compiled of [false, true]) {
  describe(`final acceptance (${compiled ? 'compiled' : 'interpreted'})`, () => {
    // MODEL §5: an in-place member is the highest contributor of the merge it is WRITTEN in; with
    // `extends M1, M0` the last parent wins over everything M1 brings, M1's in-place member too.
    it('an in-place member is highest only in its own merge (extends of named merges)', async () => {
      const m = await load(
        {
          'm.as': [
            "export interface I0 {\n  @meta.label 'L2'\n  home: { t: string }\n}",
            'export interface I2 {\n  k?: string\n}',
            'export type M0 = I2 & I0',
            "export type M1 = {\n  @meta.label 'L9'\n  home: I2\n} & I2",
            'export interface C0 extends M1, M0 {}',
            '@expect.maxLength 8\nexport type S0 = string',
            'export interface J0 {\n  @expect.maxLength 5\n  c: S0\n}',
            'export type P0 = (J0)',
            'export interface J1 {\n  work: P0\n}',
            'export type N0 = J0 & {\n  work: { c: S0 }\n}',
            'export interface C1 extends N0, J1 {}',
            // (in its own merge, the in-place member stays the highest — also below it)
            "export interface K0 {\n  @meta.label 'K'\n  w: { @meta.label 'Kx'\n x?: string }\n}",
            "export type C2 = {\n  @meta.label 'In'\n  w: { @meta.label 'Inx'\n x?: string }\n} & K0",
          ].join('\n'),
        },
        { compiled }
      )
      expect(meta(m.C0, 'home')).toBe('L2')
      expect(meta(m.C1, 'work.c', 'expect.maxLength')?.length).toBe(5)
      expect([meta(m.C2, 'w'), meta(m.C2, 'w.x')]).toEqual(['In', 'Inx'])
    })

    // MODEL §12 Q4: merges flatten — an operand that is a merge (here a chain alias to a field
    // whose type is a merge) is its operands; a raw write on the inner merge's field stays local.
    it('a merge operand reached through a chain alias is flattened (Q4)', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface HM {\n  m?: RB & RA\n}',
            'export type CL0 = HM.m',
            "export type CQ1 = CL0 & {\n  k: 'b'\n}",
            "export interface RA {\n  k?: 'b'\n  n?: string\n}",
            "export interface RB {\n  k?: 'b'\n  n?: string\n}",
          ].join('\n'),
        },
        { compiled }
      )
      at(m.CL0, 'k').metadata.set('meta.label', 'E0')
      at(m.RB, 'k').metadata.set('meta.label', 'E1')
      at(m.RA, 'k').metadata.set('meta.label', 'E2')
      expect(meta(m.CQ1, 'k')).toBe('E2')
      // (a field one written operand has is that operand's node, MODEL §5: CL0's)
      expect(at(m.CQ1, 'n')).toBe(at(m.CL0, 'n'))
    })

    // MODEL §8: `annotate T as X { … }` entries are X's own (shells of X); T = `I0 | null` is a
    // union T owns, not X: the copy's path through it shells, T and I0 are unchanged.
    it('an `as` copy of a nullable alias shells its own path', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface I0 {\n  a: string\n}',
            'export type M0 = I0 | null',
            "export annotate M0 as X0 {\n  @meta.label 'L9'\n  a\n}",
          ].join('\n'),
        },
        { compiled }
      )
      expect([meta(m.M0, '|0.a'), meta(m.I0, 'a'), meta(m.X0, '|0.a')]).toEqual([
        undefined,
        undefined,
        'L9',
      ])
    })

    // MODEL §3/§8: a block is "as if written in T": a chain alias through a self-reference
    // (`I1.next.work.work`, next: I1) reaches T's shell, whatever the statement order.
    it('a chain alias through a self-reference reaches the block shell', async () => {
      const m = await load(
        {
          'm.as': [
            'export type P0 = I0',
            'export interface I0 {\n  work?: {\n    home: { c?: string }\n  }\n}',
            'export type CL0 = I1.next.work.work',
            'export interface I1 {\n  next?: I1\n  work: P0\n}',
            "annotate I1 {\n  @meta.label 'L8'\n  next.work.work\n}",
          ].join('\n'),
        },
        { compiled }
      )
      expect([meta(m.I1, 'work.work'), meta(m.CL0, ''), meta(m.I0, 'work')]).toEqual([
        'L8',
        'L8',
        undefined,
      ])
    })

    // MODEL §3/§4: a copy's path through a reference to I1 layers over I1's nodes, I1's block
    // shells included, also when I1's module (an import cycle) runs its blocks after the copy.
    it("a copy's shell over a reference waits for the referenced class's shells (cycle)", async () => {
      const files = {
        'm0.as': [
          "import { I1 } from './m1'",
          'export interface I0 {\n  c?: string\n  t: string\n  next?: I1 & I0\n}',
          'export interface I2 {\n  kids?: I1[]\n}',
          "export annotate I2 as X0 {\n  @expect.pattern '^[^z]*$'\n  kids.next.c\n}",
          "annotate I1 {\n  @meta.label 'L14'\n  next.t\n}",
        ].join('\n'),
        'm1.as': "import { I0 } from './m0'\nexport interface I1 extends I0 {}\n",
      }
      for (const order of [
        ['m0.as', 'm1.as'],
        ['m1.as', 'm0.as'],
      ]) {
        const m = await load(files, { compiled, order })
        expect([order, meta(m.I1, 'next.t'), meta(m.X0, 'kids.[].next.t')]).toEqual([
          order,
          'L14',
          'L14',
        ])
      }
    })

    // MODEL §7: same-key conflicts on one node go by static rank (source order in a module),
    // also when a block writes a node before an import cycle fills its def (`u: X0`).
    it('block ranks survive a reference filled later (cycle)', async () => {
      const files = {
        'm0.as': [
          "import { I0, I1 } from './m3'",
          'export annotate I0 as X0 {}',
          'export interface H0 {\n  u: X0\n}',
          "annotate H0 {\n  @meta.label 'L57'\n  u\n  @expect.pattern '^[^k]*$'\n  u.g\n}",
          'export interface I2 extends I1 {}',
          "annotate H0 {\n  @meta.label 'L36'\n  u\n}",
        ].join('\n'),
        'm3.as': [
          "import { I2 } from './m0'",
          'export interface I0 {\n  g: string\n}',
          'export interface I1 {\n  t?: string\n}',
          'export interface C0 extends I2 {}',
        ].join('\n'),
      }
      for (const order of [
        ['m0.as', 'm3.as'],
        ['m3.as', 'm0.as'],
      ]) {
        const m = await load(files, { compiled, order })
        expect([order, meta(m.H0, 'u')]).toEqual([order, 'L36'])
      }
    })

    // MODEL §12 Q4 + §14 N3: an operand that is a block shell of a merge is that merge's
    // operands (a raw write on the inner merge's field stays local); the shell's layers still
    // reach the flattened merge.
    it('a merge operand that is a shell of a merge is flattened (Q4, N3)', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface I1 {\n  b: string\n  n?: string\n}',
            'export interface I2 {\n  b: string\n}',
            'export interface I0 {\n  next?: I1 & I2\n}',
            'export interface H0 {\n  u: I0\n}',
            "annotate H0 {\n  @meta.label 'L18'\n  u.next.n\n}",
            'export interface CH0 {\n  q?: H0.u.next & { b: string }\n}',
          ].join('\n'),
        },
        { compiled }
      )
      at(m.H0, 'u.next.b').metadata.set('meta.label', 'E2')
      expect([meta(m.H0, 'u.next.b'), meta(m.CH0, 'q.b'), meta(m.CH0, 'q.n')]).toEqual([
        'E2',
        undefined,
        'L18',
      ])
    })

    // MODEL §3/§4: a child's shell over a parent's node (`C0 extends I0`, next a reference to
    // I0.next) layers over the parent's block shells, whatever the statement order.
    it("a shell over another class's node clones it after that class's shells", async () => {
      const m = await load(
        {
          'm.as': [
            "annotate C0 {\n  @meta.label 'L16'\n  next.k\n}",
            "annotate I0 {\n  @meta.label 'LN6'\n  next.c\n}",
            "export interface I4 {\n  c: string\n  k?: 'c'\n}",
            'export interface C0 extends I0 {}',
            'export interface I0 {\n  next?: I4 | null\n}',
          ].join('\n'),
        },
        { compiled }
      )
      expect([meta(m.I0, 'next.|0.c'), meta(m.C0, 'next.|0.c'), meta(m.C0, 'next.|0.k')]).toEqual([
        'LN6',
        'LN6',
        'L16',
      ])
    })

    // (the same through a node another class owns: `I1 extends I0`, I1.next IS I0.next)
    it("a chain alias through an inherited field reaches the parent's block shell", async () => {
      const m = await load(
        {
          'm.as': [
            'export interface I2 {\n  c: string\n  work: I1\n}',
            'export interface I1 extends I0 {}',
            'export type M1 = I1',
            'export type CL0 = M1.next.work.next',
            'export interface I0 {\n  next?: I2\n}',
            "annotate I0 {\n  @meta.label 'LN6'\n  next.c\n}",
          ].join('\n'),
        },
        { compiled }
      )
      expect([meta(m.I0, 'next.c'), meta(m.CL0, 'c')]).toEqual(['LN6', 'LN6'])
    })

    // MODEL §4: a shell deeper on one path (`next.next…`) is over the node at `next` (a merge
    // field that IS I1.next): it reads the shells another entry puts below `next` (`next.list…`).
    it("a deeper shell over the same class's node sees that node's other shells", async () => {
      const m = await load(
        {
          'm.as': [
            'export interface I0 {\n  c: string\n}',
            'export interface I1 {\n  list?: I0[]\n  next?: I0 & I1\n}',
            "annotate I1 {\n  @meta.label 'L5'\n  next.next.next.next.list\n  @meta.label 'L6'\n  next.list.c\n}",
          ].join('\n'),
        },
        { compiled }
      )
      expect([
        meta(m.I1, 'next.list.[].c'),
        meta(m.I1, 'next.next.list.[].c'),
        meta(m.I1, 'next.next.next.next.list'),
      ]).toEqual(['L6', 'L6', 'L5'])
    })

    // MODEL §4/§5: another module's field of a hidden merge class is reached through a position
    // that holds the class's own def, not through a block shell's clone (Q0's shells are Q0's).
    it("a hidden class's node is not read through another class's shell clone", async () => {
      const m = await load(
        {
          'm0.as': [
            "import { RA, RB } from './m2'",
            'export interface HA {\n  a?: RA\n}',
            'export interface HB {\n  a?: RB\n}',
            'export type Q0 = HA & HB',
            'export interface HQ {\n  q?: HA & HB\n}',
            "annotate HQ {\n  @meta.label 'L33'\n  q.a\n}",
          ].join('\n'),
          'm2.as': [
            "import { HQ, Q0 } from './m0'",
            'export interface RA {\n  next?: RA\n  y?: string\n}',
            'export interface RB {\n  next?: RB\n  y?: string\n}',
            "annotate Q0 {\n  @meta.label 'L14'\n  a.next.next.y\n}",
            'export type CL0 = HQ.q.a',
            'export type CQ1 = CL0 & {\n  z?: string\n}',
          ].join('\n'),
        },
        { compiled, order: ['m0.as', 'm2.as'] }
      )
      expect([
        meta(m.Q0, 'a.next.next.y'),
        meta(m.CQ1, 'next.next.y'),
        meta(m.HQ, 'q.a.next.next.y'),
      ]).toEqual(['L14', undefined, undefined])
    })

    // MODEL §15 F1: the `passedWhenReferred: false` filter comes from the annotation spec (core
    // and plugins), not from the keys a generated module writes: a plugin's raw write of such a
    // key on T does not show through a reference to T although no `.as` module writes the key.
    it('a raw write of a passedWhenReferred:false plugin key does not pass a reference (F1)', async () => {
      const annotations = {
        db: {
          http: {
            path: new AnnotationSpec({
              passedWhenReferred: false,
              argument: { name: 'v', type: 'string' },
            }),
          },
        },
      }
      const m = await load(
        {
          'm.as': [
            "export interface R13Dict {\n  @meta.label 'D'\n  name: string\n}",
            'export interface R13Item {\n  snap?: R13Dict\n}',
          ].join('\n'),
        },
        { compiled, annotations }
      )
      m.R13Dict.metadata.set('db.http.path', '/r13-dicts')
      m.R13Dict.metadata.set('meta.description', 'passes')
      expect([
        m.R13Dict.metadata.get('db.http.path'),
        at(m.R13Item, 'snap').metadata.get('db.http.path'),
        at(m.R13Item, 'snap').metadata.get('meta.description'),
      ]).toEqual(['/r13-dicts', undefined, 'passes'])
    })

    // Append keys come from the annotation spec too: a raw write of a plugin append key that no
    // `.as` module writes still appends through a reference layer (the base's values first).
    it('a raw write of a plugin append key appends through a reference', async () => {
      const annotations = {
        x: {
          tags: new AnnotationSpec({
            multiple: true,
            mergeStrategy: 'append',
            argument: { name: 'v', type: 'string' },
          }),
        },
      }
      const m = await load(
        {
          'm.as': [
            "export interface A1Dict {\n  @meta.label 'D'\n  name: string\n}",
            'export interface A1Item {\n  snap?: A1Dict\n}',
          ].join('\n'),
        },
        { compiled, annotations }
      )
      m.A1Dict.metadata.set('x.tags', ['base'])
      at(m.A1Item, 'snap').metadata.set('x.tags', ['own'])
      expect([
        m.A1Dict.metadata.get('x.tags'),
        at(m.A1Item, 'snap').metadata.get('x.tags'),
      ]).toEqual([['base'], ['base', 'own']])
    })

    // MODEL §3/§4, §11 Q1: in an import cycle the partner module may run a read before the shells
    // it reaches by reference (`I1.next` is I1 again): the read waits for them at runtime too.
    it('a chain alias through a self-reference waits for the shells in an import cycle', async () => {
      const files = {
        'm0.as': [
          "import { CL0, I0, N0, P0 } from './m1'",
          'export interface I1 {\n  next?: I1\n  work: P0\n}',
          'export interface H0 {}',
          "@meta.description 'D2'\nexport type CQ0 = I1.next.work.work & {}",
          "annotate I1 {\n  @meta.label 'L8'\n  next.work.work\n}",
        ].join('\n'),
        'm1.as': [
          "import { CQ0, H0, I1 } from './m0'",
          'export type P0 = I0',
          'export type N0 = I0 | null',
          "@meta.description 'D0'\nexport interface I0 {\n  kids?: I1[]\n  home?: {}\n  work?: {\n    home: {}\n  }\n}",
          "@meta.description 'D1'\nexport annotate P0 as X0 {\n  work.home\n}",
          'export type CL0 = I1.next.work.work',
        ].join('\n'),
      }
      for (const order of [
        ['m0.as', 'm1.as'],
        ['m1.as', 'm0.as'],
      ]) {
        const m = await load(files, { compiled, order })
        expect([
          meta(m.CL0, ''),
          meta(m.CQ0, ''),
          meta(m.I1, 'work.work'),
          meta(m.I0, 'work'),
        ]).toEqual(['L8', 'L8', 'L8', undefined])
      }
    })

    // MODEL §5, §11 Q3: a branch item of a distributed merged field layers over what each
    // contributor gives that branch — the union contributor's member there, the other
    // contributor's type as written (an annotated alias: its own annotations, then its target's).
    // The contributor's node itself (its own annotations, a raw write) is the field's base, not
    // the branch's.
    it("a distributed merged field's branch items layer over the contributors' branch types", async () => {
      const m = await load(
        {
          'm.as': [
            'export interface I0 {\n  c?: string\n}',
            'export interface I2 {\n  z?: string\n}',
            'export interface I3 {\n  work: (I1 | I0) & I2\n}',
            "@meta.label 'P'\n@meta.readonly\nexport type P1 = (I0)",
            "export interface I1 {\n  @meta.description 'own'\n  work?: P1\n}",
            'export type M = I1 & I3',
          ].join('\n'),
        },
        { compiled }
      )
      const desc = (p: string) => meta(m.M, p, 'meta.description')
      expect([meta(m.M, 'work.|0'), meta(m.M, 'work.|1'), desc('work'), desc('work.|0')]).toEqual([
        'P',
        'P',
        'own',
        undefined,
      ])
      // (a reference layer: `passedWhenReferred: false` keys stay on P1 — MODEL §9 U3)
      expect([m.P1.metadata.get('meta.readonly'), meta(m.M, 'work.|0', 'meta.readonly')]).toEqual([
        true,
        undefined,
      ])
      // (a contributor whose written merge reduces to one declaration, `(I3 & I3) | null`: that class)
      const m2 = await load(
        {
          'n.as': [
            'export interface I0 {}',
            "@meta.label 'L1'\nexport interface I1 {}",
            "@meta.label 'L3'\nexport interface I3 {}",
            'export interface I4 {\n  next?: (I3 & I3) | null\n}',
            'export interface I2 {\n  next?: (I4 | I1) & I0\n}',
            'export interface C0 extends I2, I4 {}',
          ].join('\n'),
        },
        { compiled }
      )
      expect([meta(m2.C0, 'next.|0'), meta(m2.C0, 'next.|1')]).toEqual(['L3', 'L3'])
      at(m.I1, 'work').metadata.set('meta.label', 'E1')
      m.P1.metadata.set('meta.keyword', 'K')
      at(m.I3, 'work.|1').metadata.set('meta.description', 'E3')
      expect([
        meta(m.M, 'work'),
        meta(m.M, 'work.|0'),
        meta(m.M, 'work.|1', 'meta.keyword'),
        desc('work.|0'),
        desc('work.|1'),
      ]).toEqual(['E1', 'P', 'K', undefined, 'E3'])
    })

    // MODEL §8: an `as` copy has its target's structure — a copy of an all-nullable merge is a
    // union at its root too —, also when a merge with the copy reads its fields (import cycle).
    it("a merge reads an `as` copy's fields below its nullable root", async () => {
      const m = await load(
        {
          'm0.as': [
            "import { M0 } from './m2'",
            'export interface I0 {\n  n: number\n}',
            "@meta.label 'L3'\nexport interface I1 {}",
            "@meta.label 'L6'\nexport interface C0 extends M0 {}",
          ].join('\n'),
          'm1.as': [
            "import { M0 } from './m2'",
            "@meta.label 'L8'\nexport annotate M0 as X0 {\n  @meta.label 'L7'\n  n\n}",
          ].join('\n'),
          'm2.as': [
            "import { I0, I1 } from './m0'",
            "import { X0 } from './m1'",
            'export type M0 = (I1 | null) & (I0 | null)',
            'export interface H0 {\n  u: X0 & {}\n}',
          ].join('\n'),
        },
        { compiled }
      )
      expect([at(m.H0, 'u').type.kind, meta(m.H0, 'u.n'), meta(m.X0, '|0.n')]).toEqual([
        'object',
        'L7',
        'L7',
      ])
    })

    // MODEL §5: recursion refers to the same merge — one per distinct operand list, whatever order
    // the operands' shells were grouped in: the recursive field is one node from where it repeats.
    it('a recursive merge with shell operands reaches its fixed point', async () => {
      const m = await load(
        {
          'm0.as': [
            "import { P0 } from './m1'",
            'export interface I0 {\n  next?: I0 & I1\n}',
            'export interface I1 extends I0 {\n  a: string\n}',
            "annotate P0 {\n  @meta.label 'L17'\n  next.next\n}",
          ].join('\n'),
          'm1.as': [
            "import { I0, I1 } from './m0'",
            'export type P0 = I1',
            'export interface C0 extends I1, I0 {\n  c: string\n}',
          ].join('\n'),
        },
        { compiled }
      )
      const n3 = at(m.C0, 'next.next.next')
      expect(at(m.C0, 'next.next.next.next')).toBe(n3)
      n3.metadata.set('meta.label', 'E0')
      expect(meta(m.C0, 'next.next.next.next.next')).toBe('E0')
    })

    // (the same, a shell of the merge and its per-operand parts grouped once)
    it('a recursive merge through a shell of a merge reaches its fixed point', async () => {
      const m = await load(
        {
          'm.as': [
            'export type P0 = I1',
            'export type P1 = P0',
            'export interface I0 {\n  next?: I0 & I1\n  work: {\n    t?: string\n  }\n}',
            'export interface I1 extends I0 {\n  home: I0\n}',
            "annotate P0 {\n  @meta.label 'L17'\n  next.next\n  @meta.label 'L18'\n  work\n}",
            'annotate P1 {\n  home.next\n}',
          ].join('\n'),
        },
        { compiled }
      )
      expect(at(m.I0, 'next.next.next.work')).toBe(at(m.I0, 'next.next.work'))
    })

    // MODEL §15 F2: an annotated alias (D3b) gets the `passedWhenReferred: false` filter like a
    // reference layer; a bare alias is literally the type (D3).
    it('an annotated alias filters passedWhenReferred:false keys, a bare alias is the type (F2)', async () => {
      const annotations = {
        db: {
          table: new AnnotationSpec({
            passedWhenReferred: false,
            argument: { name: 'v', type: 'string' },
          }),
          alias: new AnnotationSpec({ argument: { name: 'v', type: 'string' } }),
        },
      }
      const m = await load(
        {
          'm.as': [
            "@db.table 'customers'\n@meta.description 'C'\nexport interface Customer {\n  id: string\n}",
            'export type Buyer = Customer',
            "@db.alias 'Customer'\nexport type Parent = Customer",
          ].join('\n'),
        },
        { compiled, annotations }
      )
      expect(m.Buyer).toBe(m.Customer)
      expect([
        m.Customer.metadata.get('db.table'),
        m.Parent.metadata.get('db.table'),
        m.Parent.metadata.get('db.alias'),
        m.Parent.metadata.get('meta.description'),
      ]).toEqual(['customers', undefined, 'Customer', 'C'])
    })

    // MODEL §12 Q9 + §14 N3: a merge whose operands are one declaration and a block shell of it
    // (I1's shell at `kids.[]` over I3) reduces to that declaration and carries its id; its own
    // node still layers over the shell (the block's label).
    it('a merged item of a declaration and its block shell carries the declaration id (Q9, N3)', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface I0 {\n  kids?: I3[]\n  a?: string\n}',
            'export interface I1 extends I0 {\n  home: I0\n}',
            'export interface I2 extends I0, I1 {\n  b: string\n}',
            'export interface I3 extends I2 {\n  c: string\n}',
            "annotate I1 {\n  @meta.label 'L24'\n  kids.home\n}",
            // (I2's own shell at `home`: the merged `home` of the item is two shells of I0)
            "annotate I2 {\n  @meta.label 'L25'\n  home.a\n}",
          ].join('\n'),
        },
        { compiled }
      )
      expect([at(m.I2, 'kids.[].home').id, at(m.I0, 'kids.[].kids.[].home').id]).toEqual([
        'I0',
        'I0',
      ])
      expect([at(m.I1, 'kids.[]').id, at(m.I2, 'kids.[]').id, at(m.I3, 'kids.[]').id]).toEqual([
        'I3',
        'I3',
        'I3',
      ])
      expect(meta(m.I2, 'kids.[].home')).toBe('L24')
    })

    // A deep path override through a recursive merge builds in bounded time (each merged slot is
    // computed once; it was re-merged at every prefix of every shell stage: ~40 s for 100 steps).
    it(
      'a 100-step block path through a recursive merge builds in bounded time',
      { timeout: 20_000 },
      async () => {
        const chain = (p: string, n: number) =>
          Array.from(
            { length: n },
            (_, i) => `export interface ${p}${i} {\n  next?: ${p}${(i + 1) % n}\n  y?: string\n}`
          )
        const m = await load(
          {
            'a.as': [...chain('A', 5), ...chain('B', 11)].join('\n'),
            'c.as': [
              "import { A0, B0 } from './a'",
              'export type M = A0 & B0',
              'export interface H {\n  m?: A0 & B0\n}',
              `annotate M {\n  @meta.label 'deep'\n  ${'next.'.repeat(100)}y\n}`,
            ].join('\n'),
          },
          { compiled }
        )
        expect(meta(m.M, `${'next.'.repeat(100)}y`)).toBe('deep')
        expect(meta(m.M, `${'next.'.repeat(99)}y`)).toBeUndefined()
      }
    )

    // MODEL §12 Q5: a union operand of scalar / array branches distributes like any union operand;
    // against an object every branch is unmergeable, so the merged field is `never` (it took the
    // object's type). A branch that does merge keeps the field (V7: `number[]`).
    it('a merged field of a scalar / array union and an object is never (Q5)', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface A {\n  m?: number | (number | number[])\n}',
            'export interface B {\n  m?: { c: number }\n}',
            'export interface AA {\n  m?: number[] | string[]\n}',
            'export interface UO {\n  m?: { c: number } | number[]\n}',
            'export type V1 = A & B',
            'export type V6 = AA & B',
            'export interface I0 {\n  b: A & B & { m: boolean }\n}',
            'export type V7 = UO & A',
          ].join('\n'),
        },
        { compiled }
      )
      expect([m.V1, m.V6, m.I0].map(t => at(t, t === m.I0 ? 'b.m' : 'm').type.designType)).toEqual([
        'never',
        'never',
        'never',
      ])
      expect(m.V1.validator().validate({ m: { c: 1 } }, true)).toBe(false)
      expect(m.V1.validator().validate({}, true)).toBe(true)
      expect(at(m.V7, 'm').type.kind).toBe('array')
    })

    // MODEL §5: `null` is a scalar — merged with an object or an array it is `never` (it took the
    // object's type); only a merge whose operands are all nullable (an optional one next to a
    // required one passes `null`, as core merges props) is `null`.
    it('an object or array merged with null is never unless every operand is nullable', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface Ox {\n  a?: { x: number }\n}',
            'export interface Rx {\n  a: { x: number }\n}',
            'export interface Oarr {\n  a?: number[]\n}',
            'export interface On {\n  a?: null\n}',
            'export interface Rn {\n  a: null\n}',
            'export interface Rxn {\n  a: { x: number } | null\n}',
            'export type N1 = Ox & On',
            'export type N2 = Rx & Rn',
            'export type N3 = Oarr & On',
            'export type N4 = Ox & Rn',
            'export type N5 = Rxn & On',
            'export type N6 = ({ x: number } | null) & null',
            'export interface P {\n  p: ({ x: number } | null) & null\n}',
          ].join('\n'),
        },
        { compiled }
      )
      expect([m.N1, m.N2, m.N3, m.N4, m.N5].map(t => at(t, 'a').type.designType)).toEqual([
        'never',
        'never',
        'never',
        'null',
        'null',
      ])
      expect([m.N6.type.designType, at(m.P, 'p').type.designType]).toEqual(['null', 'null'])
      expect(m.N1.validator().validate({ a: { x: 1 } }, true)).toBe(false)
      expect(m.N2.validator().validate({ a: null }, true)).toBe(false)
      expect(m.N4.validator().validate({ a: null }, true)).toBe(true)
    })

    // MODEL §12 Q5: `(string | number[]) & { c: string }[]` = `string & …` (never, dropped) |
    // `number[] & { c: string }[]` — an array whose items merge `number & { c }`: never. The
    // array branch takes part in the merge (it was dropped: the field took the object array).
    it('a merged field keeps the array branch of a scalar / array union (Q5)', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface PU {\n  b: string | number[]\n}',
            'export interface Q {\n  b: { c: string }[]\n}',
            'export interface R {\n  b?: string | boolean[]\n}',
            'export interface S {\n  b?: boolean[]\n}',
            'export type W = PU & Q',
            'export type V = R & S',
          ].join('\n'),
        },
        { compiled }
      )
      expect(at(m.W, 'b').type.kind).toBe('array')
      expect(at(m.W, 'b.[]').type.designType).toBe('never')
      expect(m.W.validator().validate({ b: [{ c: 'x' }] }, true)).toBe(false)
      expect(m.W.validator().validate({ b: [] }, true)).toBe(true)
      expect(at(m.V, 'b.[]').type.designType).toBe('boolean')
    })

    // MODEL §12 Q5 / Q11: a primitive extension's intrinsic checks are part of its type — also
    // when the merge picks it from a union member (`string & (string.email | number)` is
    // `string.email`, `X | never` = X): a merged field and a distributed merge's scalar branch
    // keep them, once; an annotated alias picked so keeps its own annotations, as its branch item.
    it('a merge that picks a scalar type from a union keeps its checks (Q5, Q11)', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface A {\n  @expect.maxLength 10\n  a: string\n}',
            'export interface C {\n  a: string.email | number\n}',
            'export interface Cs {\n  a: string.email\n}',
            'export interface E {\n  a?: number\n}',
            'export interface D {\n  a?: number.int | string\n}',
            'export interface Ox {\n  x: number\n}',
            'export interface Oy {\n  y: number\n}',
            'export type Y = A & C',
            'export type Ys = A & Cs',
            'export type Z = E & D',
            'export type P = (string.email | Ox) & (string | Oy)',
            "@expect.pattern '^x'\nexport type X = string",
            'export interface CX {\n  a: X | number\n}',
            'export type YX = A & CX',
          ].join('\n'),
        },
        { compiled }
      )
      expect([
        ok(m.Y, { a: 'abc' }),
        ok(m.Y, { a: 'a@b.co' }),
        ok(m.Y, { a: 'a@bbbbbbbb.co' }),
      ]).toEqual([false, true, false])
      expect([ok(m.Z, { a: 1.5 }), ok(m.Z, { a: 2 })]).toEqual([false, true])
      expect([ok(m.P, 'abc'), ok(m.P, 'a@b.co')]).toEqual([false, true])
      expect(at(m.Ys, 'a').metadata.get('expect.pattern')).toHaveLength(1)
      expect(at(m.Y, 'a').metadata.get('expect.pattern')).toHaveLength(1)
      expect([ok(m.YX, { a: 'abc' }), ok(m.YX, { a: 'xbc' })]).toEqual([false, true])
    })

    // MODEL §5 (review 27 REACH): another module's hidden merge class is that class itself — the
    // module exports it under a reserved name —, never reached through a declaration's node: a
    // block may have shelled that node (here Q0's `a.next.next.y`), and its blocks must not leak.
    for (const partial of [false, true]) {
      it(`another module's hidden class is the class itself${partial ? ' (one build per file)' : ''}`, async () => {
        const m = await load(
          {
            'm1.as': [
              'export interface RA {\n  y?: string\n  next?: RA\n}',
              "export interface RB {\n  @meta.label 'L18'\n  y?: string\n  next?: RB\n}",
              'export interface HA {\n  a?: RA\n}',
              'export interface HB {\n  a?: RB\n}',
            ].join('\n'),
            'm2.as': [
              "import { HA, HB } from './m1'",
              'export type Q0 = HA & HB',
              'export interface HQ {\n  q?: HA & HB\n}',
              "annotate Q0 {\n  @meta.label 'L21'\n  a.next.next.y\n}",
            ].join('\n'),
            'm3.as': [
              "import { HQ } from './m2'",
              'export type CQ0 = HQ.q.a & {\n  z?: string\n}',
            ].join('\n'),
          },
          { compiled, partial }
        )
        expect([
          meta(m.Q0, 'a.next.next.y'),
          meta(m.CQ0, 'y'),
          meta(m.CQ0, 'next.y'),
          meta(m.CQ0, 'next.next.y'),
        ]).toEqual(['L21', 'L18', 'L18', 'L18'])
      })
    }

    // MODEL §5 (review 27 REACH): a hidden class deep inside another module's declaration is
    // reached at any depth (no search bound)
    it('another module hidden class deep in a declaration is reached', async () => {
      const deep = '{ b?: { c?: { d?: { e?: { f?: { g?: { h?: { q?: HA & HB } } } } } } } }'
      const m = await load(
        {
          'm1.as': [
            'export interface RA {\n  y?: string\n  next?: RA\n}',
            "export interface RB {\n  @meta.label 'L18'\n  y?: string\n  next?: RB\n}",
            'export interface HA {\n  a?: RA\n}',
            'export interface HB {\n  a?: RB\n}',
          ].join('\n'),
          'm2.as': [
            `import { HA, HB } from './m1'`,
            `export interface HQ {\n  a?: ${deep}\n}`,
          ].join('\n'),
          'm3.as': [
            "import { HQ } from './m2'",
            'export type CQ = HQ.a.b.c.d.e.f.g.h.q.a & {\n  z?: string\n}',
          ].join('\n'),
        },
        { compiled }
      )
      expect([meta(m.CQ, 'y'), meta(m.CQ, 'next.y')]).toEqual(['L18', 'L18'])
      expect([ok(m.CQ, { y: 'a', next: { y: 'b' } }), ok(m.CQ, { y: 1 })]).toEqual([true, false])
    })

    // MODEL §15 TUP-ARR: an array intersected with a tuple is a tuple of the items' intersections
    // (also as merged props); `never` only when an item's intersection is
    it('an array intersected with a tuple is a tuple of the item intersections', async () => {
      const m = await load(
        {
          'm.as': [
            'export type TP = [string, string]',
            'export type T2 = string[] & [string, string]',
            'export interface P5 {\n  p: string[]\n}',
            'export interface Q5 {\n  p: [string, string]\n}',
            'export type T5 = P5 & Q5',
            'export type T7 = { p?: number[] } & { p?: [1, number] }',
            'export type TN = number[] & [string, string]',
          ].join('\n'),
        },
        { compiled }
      )
      expect(m.T2.type.kind).toBe('tuple')
      expect([ok(m.T2, ['a', 'b']), ok(m.T2, ['a']), ok(m.T2, ['a', 'b', 'c'])]).toEqual([
        true,
        false,
        false,
      ])
      expect(buildJsonSchema(m.T2)).toEqual(buildJsonSchema(m.TP))
      expect(at(m.T5, 'p').type.kind).toBe('tuple')
      expect([ok(m.T5, { p: ['a', 'b'] }), ok(m.T5, { p: ['a', 1] })]).toEqual([true, false])
      expect([ok(m.T7, { p: [1, 2] }), ok(m.T7, { p: [2, 2] }), ok(m.T7, {})]).toEqual([
        true,
        false,
        true,
      ])
      expect(m.TN.type.designType).toBe('never')
    })

    // review 27 CHAIN-EXT-NULL: `extends` of a nullable type (`I1 | null`, an all-nullable merge)
    // has its object item's props; a chain ref reaches them
    it('a chain ref reaches the props of an extends of a nullable type', async () => {
      const m = await load(
        {
          'm.as': [
            'export interface I0 {\n  a: string\n  f: string\n}',
            'export interface I1 {\n  f?: string\n  n?: number\n}',
            'export type N0 = I1 | null',
            'export type M0 = (I0 | null) & N0',
            'export interface C0 extends N0 {}',
            'export interface C1 extends M0 {}',
            'export interface CH {\n  v?: C0.f\n  w?: C1.a\n}',
          ].join('\n'),
        },
        { compiled }
      )
      expect([...m.C1.type.props.keys()].sort()).toEqual(['a', 'f', 'n'])
      expect([at(m.CH, 'v').type.designType, at(m.CH, 'w').type.designType]).toEqual([
        'string',
        'string',
      ])
      expect([ok(m.CH, { v: 'x', w: 'y' }), ok(m.CH, { v: 1 })]).toEqual([true, false])
    })

    // review 27 CAPS: an object deep in nested arrays is found at any depth (no depth bound): 22
    // levels of arrays of objects merge to `never` at the prop, as 3 levels do
    it('arrays of arrays of objects are never at any depth', async () => {
      const dims = '[]'.repeat(22)
      const m = await load(
        {
          'm.as': [
            'export interface X {\n  a?: string\n}',
            'export interface Z {\n  c?: string\n}',
            `export type DA = { p?: X${dims} } & { p?: Z${dims} }`,
          ].join('\n'),
        },
        { compiled }
      )
      expect(at(m.DA, 'p').type.designType).toBe('never')
    })

    // MODEL §15 FIX7-1: a merge whose union operands distribute into more than PRODUCT_CAP (2^14)
    // branch combinations is the error "merge too complex" at the type — never a truncated union;
    // just under the bound it is built in full (here: the all-objects and the all-strings branch)
    it('a merge distributing past the bound is "merge too complex"; under it, the full merge', async () => {
      const m = await load({ 'm.as': unionOperands(14) }, { compiled })
      expect(m.T.type.items).toHaveLength(2)
      expect([
        ok(m.T, 'x'),
        ok(m.T, { a0: '1', a13: '2' }),
        ok(m.T, 1),
        ok(m.T, { a13: 1 }),
      ]).toEqual([true, true, false, false])
      const dir = mkdtempSync(path.join(tmpdir(), 'atscript-final-'))
      dirs.push(dir)
      writeFileSync(path.join(dir, 'm.as'), unionOperands(15))
      const repo = await build({
        rootDir: dir,
        entries: ['m.as'],
        plugins: [tsPlugin({ compileValidators: compiled })],
      })
      const diagnostics = await repo.diagnostics()
      const errors = [...diagnostics.values()].flat().filter(e => e.severity === 1)
      expect(errors.map(e => e.message)).toContain('merge too complex: split it with named types')
      await expect(repo.generate({ format: 'js' })).rejects.toThrow('merge too complex')
    })
  })
}
