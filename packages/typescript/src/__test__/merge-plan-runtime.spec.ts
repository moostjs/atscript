import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator } from '../runtime/validator'

/*
 * Merged props (MODEL §5): the compiler writes the final merged structure; a field several members
 * have is a node layered over theirs, the later member first and a member written in place the
 * highest; blocks on a member's paths reach every merge of it (§3); the same in every load order.
 * (Round 24/25 checked the runtime merge plans here; P4C deleted them: the values stay.)
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type TModules = Record<string, any>

async function load(
  files: Record<string, string>,
  opts: { compiled: boolean; order: string[] }
): Promise<TModules> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-plan-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators: opts.compiled })],
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const out of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
  }
  vi.resetModules()
  const modules: TModules = {}
  for (const name of opts.order) {
    Object.assign(modules, await import(path.join(dir, `${name}.js`)))
  }
  return modules
}

function orders(names: string[]): string[][] {
  if (names.length <= 1) {
    return [names]
  }
  return names.flatMap((name, i) =>
    orders([...names.slice(0, i), ...names.slice(i + 1)]).map(rest => [name, ...rest])
  )
}

const valid = (type: TAtscriptAnnotatedType, value: unknown) =>
  new Validator(type, { unknownProps: 'ignore' }).validate(structuredClone(value), true)

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
function meta(type: unknown, dotted: string, key: string): string {
  return at(type, dotted)
    .map(n => {
      const v = n.metadata.get(key)
      return v === undefined ? '-' : typeof v === 'object' ? String(v.length) : String(v)
    })
    .join('|')
}

/** Every class's bundled schema is the runtime's (no block module outside the build). */
function expectSchemas(m: TModules) {
  for (const type of Object.values(m)) {
    if (typeof type?.toJsonSchema === 'function') {
      expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
    }
  }
}

const RM1 = {
  'a.as': [
    'export interface Address {\n  @expect.maxLength 20\n  city: string\n}',
    'export interface User {\n  home: Address\n}',
    'export interface HO {\n  home: {\n    @expect.maxLength 8\n    city: string\n  }\n}',
    'export type UM = User & {\n  home: {\n    @expect.maxLength 8\n    city: string\n  }\n}',
    'export type UN = User & HO',
    'export interface H {\n  m: User & {\n    home: {\n      @expect.maxLength 8\n      city: string\n    }\n  }\n}',
  ].join('\n'),
  'b.as': "import { User } from './a'\nannotate User {\n  @expect.maxLength 6\n  home.city\n}\n",
}

const RM2 = {
  'a.as': [
    'export interface Address {\n  @expect.maxLength 20\n  city: string\n}',
    'export interface User {\n  home: Address\n  list: Address[]\n  deep: { a: Address }\n  opt?: Address\n}',
    'export type UArr = User & {\n  list: {\n    @expect.maxLength 8\n    city: string\n  }[]\n}',
    'export type UDeep = User & {\n  deep: {\n    a: {\n      @expect.maxLength 8\n      city: string\n    }\n  }\n}',
    'export type UOpt = User & {\n  opt?: {\n    @expect.maxLength 8\n    city: string\n  }\n}',
    'export type URev = {\n  home: {\n    @expect.maxLength 8\n    city: string\n  }\n} & User',
    'export interface Holder extends User {\n  x?: string\n}',
    'export type HM = Holder & {\n  home: {\n    @expect.maxLength 8\n    city: string\n  }\n}',
  ].join('\n'),
  'b.as': [
    "import { User } from './a'",
    "annotate User {\n  @meta.label 'h'\n  home.city\n  @meta.label 'l'\n  list.city\n  @meta.label 'd'\n  deep.a.city\n  @meta.label 'o'\n  opt.city\n}",
  ].join('\n'),
}

const RM3 = {
  'a.as': [
    'export interface Address {\n  @expect.maxLength 20\n  city: string\n}',
    'export interface Addr2 {\n  city: string\n  zip?: string\n}',
    'export interface A {\n  home: Address\n  list: Address[]\n}',
    'export interface B {\n  home?: Address | null\n  list?: Address[] | null\n}',
    'export type M = A & B',
    'export type N = B & A',
    'export interface A2 {\n  home: Address\n}',
    'export interface B2 {\n  home?: Addr2 | null\n}',
    'export type M2 = A2 & B2',
  ].join('\n'),
  'b.as': [
    "import { A, B, Addr2 } from './a'",
    "annotate B {\n  @meta.label 'B'\n  @expect.maxLength 3\n  home.city\n  @meta.label 'BL'\n  @expect.maxLength 3\n  list.city\n}",
    "annotate A {\n  @meta.label 'A'\n  @expect.maxLength 5\n  home.city\n}",
    "annotate Addr2 {\n  @meta.label 'a2'\n  @expect.maxLength 3\n  city\n  @expect.maxLength 2\n  zip\n}",
  ].join('\n'),
}

/** Two members of one type: a path override of one of them is merged at runtime (C3). */
const C3 = {
  'a.as': [
    'export interface Address {\n  @expect.maxLength 20\n  city: string\n}',
    'export interface A {\n  addr: Address\n  list: Address[]\n}',
    'export interface B {\n  addr: Address\n  list: Address[]\n}',
    'export type M = A & B',
    'export type N = B & A',
    'export interface C extends B, A {\n  z?: string\n}',
  ].join('\n'),
  'u.as': [
    "import { A, B } from './a'",
    "annotate A {\n  @meta.label 'A'\n  @expect.maxLength 5\n  addr.city\n  @meta.label 'AL'\n  @expect.maxLength 3\n  list.city\n}",
    "annotate B {\n  @meta.label 'B'\n  @expect.maxLength 3\n  addr.city\n}",
  ].join('\n'),
}

/** Merges of merges, an `extends` of one, arrays and nullable unions of one, blocks on each. */
const N1 = {
  'a.as': [
    "export interface Base {\n  @meta.label 'base'\n  @expect.maxLength 10\n  name: string\n  extra?: string\n}",
    "export interface Meta {\n  @meta.description 'meta'\n  name: string\n}",
    'export type M1 = Base & Meta',
    'export type M2 = M1 & {\n  @expect.minLength 2\n  name: string\n}',
    "export type M3 = {\n  @meta.label 'pre'\n  name: string\n} & M1",
    'export interface I extends M1 {\n  z?: string\n}',
    'export interface H {\n  m: M2\n  arr: M1[]\n  opt?: M1 | null\n  i: I\n}',
  ].join('\n'),
  'b.as': [
    "import { Base, Meta, M1 } from './a'",
    "annotate Base {\n  @meta.label 'base-blk'\n  @expect.maxLength 4\n  name\n}",
    "annotate Meta {\n  @meta.description 'meta-blk'\n  name\n}",
    "annotate M1 {\n  @meta.example 'm1'\n  name\n}",
  ].join('\n'),
}

const P1 = {
  'a.as': [
    "export interface Address {\n  @meta.label 'addr'\n  @expect.maxLength 20\n  city: string\n  next?: Address\n}",
    'export interface User {\n  home: Address\n  work: Address\n}',
    'export interface Admin extends User {\n  level?: number\n}',
    'export type UM = User & {\n  home: {\n    @expect.maxLength 8\n    city: string\n  }\n}',
    "annotate User {\n  @meta.label 'U-home'\n  @expect.maxLength 6\n  home.city\n}",
  ].join('\n'),
  'b.as': [
    "import { Address, Admin } from './a'",
    "annotate Address {\n  @meta.label 'B-addr'\n  @expect.maxLength 3\n  city\n}",
    "annotate Admin {\n  @meta.label 'Admin-home'\n  home.city\n}",
  ].join('\n'),
}

for (const compiled of [false, true]) {
  describe(`merged props: one rule at build time and at runtime${compiled ? ' (compiled)' : ''}`, () => {
    // R1: a member written in place keeps its nested annotations against a member referencing a
    // type — also after a block on that type's path (the in-place member beats it).
    it('an in-place member’s nested annotations win over an earlier member’s type', async () => {
      for (const order of orders(Object.keys(RM1))) {
        const m = await load(RM1, { compiled, order })
        const paths = [
          ['User', 'home.city'],
          ['UM', 'home.city'],
          ['UN', 'home.city'],
          ['H', 'm.home.city'],
        ]
        expect(paths.map(([t, p]) => meta(m[t], p, 'expect.maxLength'))).toEqual([
          '6',
          '8',
          '8',
          '8',
        ])
        expect(['UM', 'UN'].map(t => valid(m[t], { home: { city: 'abcdefg' } }))).toEqual([
          true,
          true,
        ])
        expect(valid(m.H, { m: { home: { city: 'abcdefghi' } } })).toBe(false)
        expectSchemas(m)
      }
    })

    it('in arrays, at depth, optional, through `extends`, and the later member wins', async () => {
      for (const order of orders(Object.keys(RM2))) {
        const m = await load(RM2, { compiled, order })
        const rows: Array<[string, string, unknown]> = [
          ['UArr', 'list.[].city', { home: { city: 'a' }, list: [{ city: 'abcdefghij' }] }],
          ['UDeep', 'deep.a.city', { home: { city: 'a' }, deep: { a: { city: 'abcdefghij' } } }],
          ['UOpt', 'opt.city', { home: { city: 'a' }, opt: { city: 'abcdefghij' } }],
          ['URev', 'home.city', { home: { city: 'abcdefghij' } }],
          ['HM', 'home.city', { home: { city: 'abcdefghij' } }],
        ]
        const base = { list: [], deep: { a: { city: 'a' } } }
        // (URev: the member written in place is the highest contributor, written first or not —
        // MODEL §5; it was the later member, User)
        expect(rows.map(([t, p]) => meta(m[t], p, 'expect.maxLength'))).toEqual([
          '8',
          '8',
          '8',
          '8',
          '8',
        ])
        expect(rows.map(([t, , v]) => valid(m[t], { ...base, ...(v as object) }))).toEqual([
          false,
          false,
          false,
          false,
          false,
        ])
        // (the block on User's paths reaches every merge of them)
        expect(rows.map(([t, p]) => meta(m[t], p, 'meta.label'))).toEqual(['l', 'd', 'o', 'h', 'h'])
        expectSchemas(m)
      }
    })

    // R2: a member whose prop is `T | null` (`T[] | null`) takes part in the merge.
    it('a nullable member takes part in the merge', async () => {
      for (const order of orders(Object.keys(RM3))) {
        const m = await load(RM3, { compiled, order })
        const paths = [
          ['M', 'home.city'],
          ['M', 'list.[].city'],
          ['N', 'home.city'],
          ['N', 'list.[].city'],
          ['M2', 'home.city'],
          ['M2', 'home.zip'],
        ]
        expect(paths.map(([t, p]) => meta(m[t], p, 'meta.label'))).toEqual([
          'B',
          'BL',
          'A',
          'BL',
          'a2',
          '-',
        ])
        expect(paths.map(([t, p]) => meta(m[t], p, 'expect.maxLength'))).toEqual([
          '3',
          '3',
          '5',
          '20',
          '3',
          '2',
        ])
        expect([
          valid(m.M, { home: { city: 'abcd' }, list: [] }),
          valid(m.M, { home: { city: 'a' }, list: [{ city: 'abcd' }] }),
          valid(m.N, { home: { city: 'abcd' }, list: [] }),
          valid(m.M2, { home: { city: 'abcd' } }),
          valid(m.M2, { home: { city: 'a', zip: 'abc' } }),
        ]).toEqual([false, false, true, false, false])
        expectSchemas(m)
      }
    })

    it('two members of one type: their path overrides merge at runtime, by priority', async () => {
      for (const order of orders(Object.keys(C3))) {
        const m = await load(C3, { compiled, order })
        expect(['M', 'N', 'C'].map(t => meta(m[t], 'addr.city', 'meta.label'))).toEqual([
          'B',
          'A',
          'A',
        ])
        // (M: B is later, its `Address.city` wins; C: the last parent, A, wins)
        expect(['M', 'N', 'C'].map(t => meta(m[t], 'list.[].city', 'expect.maxLength'))).toEqual([
          '20',
          '3',
          '3',
        ])
        expectSchemas(m)
      }
    })

    it('merges of merges, `extends` of one, and blocks on every member', async () => {
      for (const order of orders(Object.keys(N1))) {
        const m = await load(N1, { compiled, order })
        expect(
          ['M1', 'M2', 'M3', 'I'].map(t =>
            ['meta.label', 'meta.description', 'expect.maxLength', 'meta.example']
              .map(k => meta(m[t], 'name', k))
              .join('/')
          )
        ).toEqual([
          'base-blk/meta-blk/4/m1',
          'base-blk/meta-blk/4/m1',
          // (M3: its member written in place is the highest contributor — MODEL §5)
          'pre/meta-blk/4/m1',
          'base-blk/meta-blk/4/m1',
        ])
        expect(meta(m.H, 'opt.name', 'meta.example')).toContain('m1')
        expectSchemas(m)
      }
    })

    it('an in-place member beats a later block on its base, and runtime edits follow', async () => {
      for (const order of orders(Object.keys(P1))) {
        const m = await load(P1, { compiled, order })
        expect(meta(m.UM, 'home.city', 'meta.label')).toBe('U-home')
        expect(meta(m.UM, 'home.city', 'expect.maxLength')).toBe('8')
        expect(meta(m.UM, 'work.city', 'expect.maxLength')).toBe('3')
        expect(meta(m.Admin, 'home.city', 'meta.label')).toBe('Admin-home')
        expectSchemas(m)
        m.Address.type.props.get('city').metadata.set('meta.label', 'rt')
        expect(meta(m.UM, 'work.city', 'meta.label')).toBe('rt')
        expect(meta(m.UM, 'home.city', 'meta.label')).toBe('U-home')
      }
    })
  })
}

/** An interface of string props `keys`, each with `@expect.maxLength max`. */
const wide = (name: string, keys: string[], max: number) =>
  `export interface ${name} {\n${keys.map(k => `  @expect.maxLength ${max}\n  ${k}?: string`).join('\n')}\n}`

/** Intersections a merge does not inline (recursive, over the merge budget): merge states. */
const RT = {
  'a.as': [
    'export interface A {\n  @expect.maxLength 3\n  x?: string\n  next?: A\n}',
    'export interface B {\n  @expect.maxLength 5\n  x?: string\n  y?: string\n  next?: B\n}',
    'export type M = A & B',
    'export interface H {\n  m: A & B\n}',
    wide('W1', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 4),
    wide('W2', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i'], 6),
    'export interface P {\n  home: W1\n}',
    'export interface Q {\n  home?: W2 | null\n}',
    'export type PQ = P & Q',
    'export type PW = P & {\n  home: W2\n}',
    'export interface I1 {\n  work?: A | null\n}',
    'export interface I2 extends I1 {\n  z?: string\n}',
    'export type II = I1 & I2',
  ].join('\n'),
  'b.as': [
    "import { B, W1, I1 } from './a'",
    "annotate B {\n  @meta.label 'BY'\n  y\n}",
    "annotate W1 {\n  @meta.label 'w1'\n  a\n}",
    "annotate I1 {\n  @meta.label 'I1'\n  work.x\n}",
  ].join('\n'),
}

describe('merge states (recursive, over the merge budget): the one rule, in every order', () => {
  for (const compiled of [false, true]) {
    for (const order of orders(Object.keys(RT))) {
      it(`${compiled ? 'compiled' : 'interpreted'}, ${order.join(' then ')}`, async () => {
        const m = await load(RT, { compiled, order })
        expectSchemas(m)
        // (later member wins at every level of the recursion; it closes into one def)
        for (const p of ['x', 'next.x', 'next.next.x']) {
          expect(meta(m.M, p, 'expect.maxLength')).toBe('5')
          expect(meta(m.H, `m.${p}`, 'expect.maxLength')).toBe('5')
        }
        expect(meta(m.M, 'next.next.y', 'meta.label')).toBe('BY')
        const next = m.M.type.props.get('next')
        expect(next.type.props.get('next').type).toBe(next.type)
        expect(valid(m.M, { next: { next: { x: 'abcde' } } })).toBe(true)
        expect(valid(m.M, { next: { next: { x: 'abcdef' } } })).toBe(false)
        // (over the budget: merged, later member wins, a member's block reaches it)
        expect(meta(m.PQ, 'home.a', 'expect.maxLength')).toBe('6')
        expect(meta(m.PQ, 'home.a', 'meta.label')).toBe('w1')
        expect(meta(m.PQ, 'home.h', 'expect.maxLength')).toBe('4')
        expect(meta(m.PW, 'home.a', 'expect.maxLength')).toBe('6')
        expect(meta(m.PW, 'home.i', 'expect.maxLength')).toBe('6')
        expect(valid(m.PQ, { home: { a: 'abcdef', h: 'abcd' } })).toBe(true)
        expect(valid(m.PQ, { home: { h: 'abcde' } })).toBe(false)
        // (members reaching one node through a nullable union keep its override)
        expect(meta(m.II, 'work.x', 'meta.label')).toBe('I1')
        for (const t of [m.M, m.H, m.PQ, m.PW]) {
          expect(t.toJsonSchema()).toEqual(buildJsonSchema(t))
        }
      })
    }
  }
})
