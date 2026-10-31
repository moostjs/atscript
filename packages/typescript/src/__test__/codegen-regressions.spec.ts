import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build, flatDefinitions, type BuildRepo } from '@atscript/core'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType, TAtscriptTypeObject } from '../runtime/annotated-type'
import { flattenAnnotatedType } from '../runtime/flatten'
import { buildJsonSchema } from '../runtime/json-schema'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { prepareFixtures, rng, WalkValidator } from '../test-utils'
import { dtsFlat } from './dts-flat'

/** A random value shaped like `type` (to depth 4), sometimes off. */
function sample(type: TAtscriptAnnotatedType, r: () => number, depth = 0): unknown {
  const t = type.type as any
  if (depth > 4 || r() < 0.05) {
    return r() < 0.5 ? undefined : 'x'
  }
  switch (t.kind) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [key, prop] of t.props) {
        if (!prop.optional || r() < 0.5) {
          out[key] = sample(prop, r, depth + 1)
        }
      }
      return out
    }
    case 'array': {
      return Array.from({ length: Math.floor(r() * 3) }, () => sample(t.of, r, depth + 1))
    }
    case 'union': {
      return sample(t.items[Math.floor(r() * t.items.length)], r, depth)
    }
    case 'intersection': {
      return Object.assign({}, ...t.items.map((item: any) => sample(item, r, depth)))
    }
    default: {
      return t.designType === 'number' ? Math.floor(r() * 3) : 'ab'.slice(0, Math.floor(r() * 3))
    }
  }
}

// Generated modules that used to be broken (unparseable, a missing import, a throw at module
// init, a type left empty), with and without compiled validator checks.

const rootDir = path.join(__dirname, 'fixtures', 'codegen-regressions')
/** Large generated cases, built by their own tests only. */
const scaleDir = path.join(__dirname, 'fixtures', 'codegen-scale')

type TObj = TAtscriptAnnotatedType<TAtscriptTypeObject>

const valid = (type: TAtscriptAnnotatedType, value: unknown) =>
  type.validator().validate(value, true)

const meta = (type: TAtscriptAnnotatedType, prop: string) =>
  Object.fromEntries((type as TObj).type.props.get(prop)!.metadata)

/** The node at prop path `keys` below `type`. */
const get = (type: any, ...keys: string[]) =>
  keys.reduce((node, key) => node.type.props.get(key), type)

/** The diagnostics of document `name` (`<severity> <line>: <message>`). */
async function messagesOf(repo: BuildRepo, name: string): Promise<string[]> {
  return [...(await repo.diagnostics()).entries()]
    .filter(([id]) => id.endsWith(`/${name}`))
    .flatMap(([, msgs]) => msgs.map(m => `${m.severity} ${m.range.start.line}: ${m.message}`))
}

const PARITY_OPTIONS: Array<Partial<TValidatorOptions>> = [
  {},
  { unknownProps: 'strip' },
  { unknownProps: 'ignore' },
  { partial: 'deep' },
]

/**
 * Same results, errors and strips from the validator (compiled / interpreted pre-check) as
 * from the walk, and from the walk of a serialize round-trip, on values sampled from `type`.
 */
function expectParity(name: string, type: TAtscriptAnnotatedType, seed: number, n = 40) {
  const restored = deserializeAnnotatedType(
    JSON.parse(JSON.stringify(serializeAnnotatedType(type)))
  )
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const value = sample(type, r)
    for (const opts of PARITY_OPTIONS) {
      const walk = new WalkValidator(type, opts)
      const fast = new Validator(type, opts)
      const round = new WalkValidator(restored, opts)
      const [a, b, c] = [structuredClone(value), structuredClone(value), structuredClone(value)]
      const expected = [name, walk.validate(a, true), walk.errors, a]
      expect([name, fast.validate(b, true), fast.errors, b]).toEqual(expected)
      expect([name, round.validate(c, true), round.errors, c]).toEqual(expected)
    }
  }
}

for (const compileValidators of [false, true]) {
  describe(`generated modules (compileValidators: ${compileValidators})`, () => {
    let load: (name: string) => Promise<Record<string, any>>

    beforeAll(async () => {
      await prepareFixtures({ rootDir, formats: ['js'], tsPluginOptions: { compileValidators } })
      // The same files, regenerated: drop the modules loaded by the previous round.
      vi.resetModules()
      load = name => import(path.join(rootDir, `${name}.as.js`))
    })

    it('a one-item tuple holds its item: an inline object, a tuple, a union', async () => {
      const { Tuples } = await load('tuples')
      const code = readFileSync(path.join(rootDir, 'tuples.as.js'), 'utf8')
      expect(code.includes('$cv(Tuples')).toBe(compileValidators)
      const value = { inline: [{ n: 'a' }], nested: [['a', 1]], union: [1], pair: ['a', true] }
      expect(valid(Tuples, { ...value, grouped: { n: 'a' } })).toBe(true)
      expect(valid(Tuples, { ...value, grouped: { n: 1 } })).toBe(false)
      expect(valid(Tuples, { ...value, grouped: { n: 'a' }, inline: [{ n: 1 }] })).toBe(false)
      expect(valid(Tuples, { ...value, grouped: { n: 'a' }, nested: ['a', 1] })).toBe(false)
      expect(valid(Tuples, { ...value, grouped: { n: 'a' }, union: ['a', 1] })).toBe(false)
    })

    it('references inside definitions inlined from another module get their imports', async () => {
      const { Merged, BaseView } = await load('intersect-a')
      expect(valid(Merged, { merged: { meta: { v: 'ab' } } })).toBe(true)
      expect(valid(Merged, { merged: { meta: { v: 'a' } } })).toBe(false)
      expect(valid(BaseView, { meta: { v: 'ab' } })).toBe(true)
      expect(valid(BaseView, { meta: { v: 'a' } })).toBe(false)
    })

    it('a mutating annotate of a type of a module that imports it (import cycle)', async () => {
      // The target's module first: the annotating module is evaluated before it.
      const { CycleA } = await load('cycle-a')
      expect(meta(CycleA, 'x')).toEqual({ 'expect.minLength': { length: 2 } })
      expect(valid(CycleA, { b: {}, x: 'ab' })).toBe(true)
      expect(valid(CycleA, { b: {}, x: 'a' })).toBe(false)
      expect(valid(CycleA, { b: { y: 'abcd' }, x: 'ab' })).toBe(false)
    })

    it('an alias declared above its target is built from the built target', async () => {
      const { Alias, PropAlias, Holder, AliasOfAlias, Target } = await load('forward')
      for (const alias of [Alias, AliasOfAlias]) {
        expect(alias.type.kind).toBe('object')
      }
      expect(valid(Alias, { x: 'ab' })).toBe(true)
      expect(valid(Alias, { x: 'a' })).toBe(false)
      // The mutating annotate of the alias is a block on what it aliases (the target).
      expect(valid(Alias, { x: 'abcd' })).toBe(false)
      expect(valid(Target, { x: 'abcd' })).toBe(false)
      expect(valid(PropAlias, 'ab')).toBe(true)
      expect(valid(PropAlias, 1)).toBe(false)
      expect(valid(Holder, { alias: { x: 'ab' } })).toBe(true)
      expect(valid(Holder, { alias: { x: 1 } })).toBe(false)
    })

    it('a definition inlined from a class above an alias is built after the alias', async () => {
      const { M3, M3e } = await load('inlined-order')
      for (const [type, value] of [
        [M3, (v: string) => ({ m: { la: { v } } })],
        [M3e, (v: string) => ({ la: { v } })],
      ] as const) {
        expect(valid(type, value('ab'))).toBe(true)
        expect(valid(type, value('a'))).toBe(false)
      }
    })

    it('a definition inlined from another module refs an alias of this module', async () => {
      const { M3x, M3xe } = await load('inlined-order-a')
      expect(valid(M3x, { m: { la: { v: 'ab' } } })).toBe(true)
      expect(valid(M3x, { m: { la: { v: 'a' } } })).toBe(false)
      expect(valid(M3xe, { la: { v: 'ab' } })).toBe(true)
      expect(valid(M3xe, { la: { v: 'a' } })).toBe(false)
    })

    it('a mutating annotate path through a type declared below it', async () => {
      const { A } = await load('annotate-order')
      expect(valid(A, { b: { y: 'abc' }, x: '' })).toBe(true)
      expect(valid(A, { b: { y: 'abcd' }, x: '' })).toBe(false)
    })

    it('a deferred mutating annotate path through a type declared below it', async () => {
      // The annotating module first (its import cycle evaluates the target's module first).
      const { AnnB } = await load('annotate-cycle-b')
      const { AnnA } = await load('annotate-cycle-a')
      expect(AnnB.type.kind).toBe('object')
      expect(valid(AnnA, { b: { y: 'abc' }, x: '' })).toBe(true)
      expect(valid(AnnA, { b: { y: 'abcd' }, x: '' })).toBe(false)
    })

    it('references to a type of another module this module does not import', async () => {
      const { HMerged, HView, HChild } = await load('hidden-a')
      expect(valid(HMerged, { merged: { hidden: { h: 'ab' } } })).toBe(true)
      expect(valid(HMerged, { merged: { hidden: { h: 'a' } } })).toBe(false)
      for (const type of [HView, HChild]) {
        expect(valid(type, { hidden: { h: 'ab' } })).toBe(true)
        expect(valid(type, { hidden: { h: 'a' } })).toBe(false)
      }
    })

    it('an annotate alias with a path through a recursive type', async () => {
      const { RView, RTyping } = await load('rec-inline-a')
      const { LView } = await load('rec-inline')
      for (const view of [RView, LView]) {
        expect(valid(view, { j: { x: 'ab' } })).toBe(true)
        expect(valid(view, { j: { x: 'a' } })).toBe(false)
        // (the override is at `j` only: `LJ[]` below it reaches `LJ` itself)
        expect(valid(view, { j: [[{ x: 'a' }]] })).toBe(true)
        expect(valid(view, { j: [[{ x: 'ab' }]] })).toBe(true)
      }
      expect(valid(RTyping, { j: { x: 'a' } })).toBe(true)
    })

    it('an intersection member keeps the props its interface inherits', async () => {
      const { MQ2, MLocal } = await load('inter-ext-a')
      expect(valid(MQ2, { p: 'ab', q: 'q', x: 'x' })).toBe(true)
      expect(valid(MQ2, { p: 'a' })).toBe(false)
      expect(valid(MLocal, { lp: 'ab', lq: 'q', y: 'y' })).toBe(true)
      expect(valid(MLocal, { lp: 'a' })).toBe(false)
    })

    it('a recursive intersection (through extends, or of the type itself)', async () => {
      const { Node, Self } = await load('rec-merge')
      const code = readFileSync(path.join(rootDir, 'rec-merge.as.js'), 'utf8')
      // The recursive occurrence is the type's own node: the merged element has `Node`'s
      // `children` (Base's, which `Node` extends) — recursion by sharing, no runtime
      // intersection. (P4B default format, MODEL §5: the merge is a hidden class of the module,
      // written at build time; it was a merge plan, `.mergeOf(…)`, merged at runtime.)
      expect(code).toMatch(/^class \$M\d+ /m)
      expect(code).not.toContain('$("intersection")')
      const children = get(Node, 'children')
      expect(children.type.of.type.props.get('children')).toBe(children)
      const child = { id: 'c', name: 'ab', tag: 't' }
      expect(valid(Node, { id: 'n', name: 'ab', children: [child] })).toBe(true)
      expect(valid(Node, { id: 'n', name: 'ab', children: [{ id: 'c', name: 'ab' }] })).toBe(false)
      expect(
        valid(Node, { id: 'n', name: 'ab', children: [{ ...child, children: [child] }] })
      ).toBe(true)
      const deep = {
        id: 'n',
        name: 'ab',
        children: [{ ...child, children: [{ ...child, name: 'a' }] }],
      }
      expect(valid(Node, deep)).toBe(false)
      expect(valid(Self, { s: 'ab', next: { s: 'cd', d: 'x' } })).toBe(true)
      expect(valid(Self, { s: 'ab', next: { s: 'cd', d: 'x', next: { s: 'ef' } } })).toBe(true)
      expect(valid(Self, { s: 'ab', next: { s: 'cd', next: { s: 'e' } } })).toBe(false)
    })

    it('an annotate alias path re-entering a recursive type deeper', async () => {
      const { T2 } = await load('deep-annotate')
      const { T3 } = await load('deep-annotate-x')
      const value = (name: string) => ({
        name: 'root',
        peer: { v: 'v', t: { name: 'n', peer: { v: 'w', t: { name } } } },
      })
      for (const type of [T2, T3]) {
        expect(valid(type, value('abc'))).toBe(true)
        expect(valid(type, value('abcdef'))).toBe(false)
        expect(get(type, 'peer', 't', 'peer', 'v').metadata.get('meta.label')).toBe('ptpv')
      }
    })

    it('a recursive intersection alias, of three members, and its round-trip / flatten', async () => {
      const module = await load('rec-merge')
      const { SD, XYZ } = module
      expect(valid(SD, { s: 'ab', d: 'x' })).toBe(true)
      expect(SD.validator().validate({ s: 'ab', next: { s: 'cd', d: 'x' } }, true)).toBe(true)
      expect(valid(SD, { s: 'a' })).toBe(false)
      expect(valid(XYZ, { x: 'ab', y: 'y', z: 'z' })).toBe(true)
      expect(valid(XYZ, { x: 'a' })).toBe(false)
      const r = rng(7)
      for (const [name, type] of Object.entries<TAtscriptAnnotatedType>(module)) {
        const restored = deserializeAnnotatedType(
          JSON.parse(JSON.stringify(serializeAnnotatedType(type)))
        )
        expect(() => flattenAnnotatedType(type as never)).not.toThrow()
        for (let i = 0; i < 30; i++) {
          const value = sample(type, r)
          const walk = new WalkValidator(type).validate(value, true)
          expect([name, new Validator(type).validate(value, true)]).toEqual([name, walk])
          expect([name, restored.validator().validate(value, true)]).toEqual([name, walk])
        }
      }
    })

    it('annotate alias entries through a recursive intersection: at their paths only', async () => {
      const { H, H2, S2, RecA } = await load('rec-annotate')
      // The unannotated type takes the same values (and no constraint of the alias).
      expect(valid(H, { one: { s: 'a', next: { s: 'b', d: 'abc' } } })).toBe(true)
      expect(valid(H2, { one: { s: 'a', next: { s: 'b', d: 'ab' } } })).toBe(true)
      expect(valid(H2, { one: { s: 'a', next: { s: 'b', d: 'abc' } } })).toBe(false)
      // The override is at `one.next.d` only: not below (`one.next.next.d`), not above (`one.d`).
      expect(
        valid(H2, { one: { s: 'a', d: 'abc', next: { s: 'b', next: { s: 'c', d: 'abc' } } } })
      ).toBe(true)
      expect(valid(H2, { one: { s: 'a', d: 'abc', next: { s: 'b', d: 'ab' } } })).toBe(true)
      expect(get(H2, 'one', 'next', 'next', 's').metadata.get('meta.label')).toBe('deep')
      expect(get(H2, 'one', 's').metadata.get('meta.label')).toBeUndefined()
      expect(valid(S2, { s: 'a', next: { s: 'b', next: { s: 'c', d: 'abc' } } })).toBe(true)
      expect(valid(S2, { s: 'a', next: { s: 'b', next: { s: 'c', d: 'abcd' } } })).toBe(false)
      // (an alias's entry is at its path only: `next.d` is Self's own)
      expect(valid(S2, { s: 'a', next: { s: 'b', d: 'abcd' } })).toBe(true)
      expect(valid(RecA, { list: [], r: { list: [], e: 'ab' } })).toBe(true)
      expect(valid(RecA, { list: [], r: { list: [], e: 'abc' } })).toBe(false)
      // Not leaking to `r.list[0].e` (another merge), nor to `Rec` itself, nor to `r.r.e`.
      expect(valid(RecA, { list: [], r: { list: [{ list: [], e: 'abc' }] } })).toBe(true)
      expect(valid(RecA, { list: [], r: { list: [], r: { list: [], e: 'abc' } } })).toBe(true)
    })

    it('types named like the deferred-annotation helpers', async () => {
      const b = await load('helper-names-b')
      const a = await load('helper-names-a')
      expect(b.$m.type.kind).toBe('object')
      expect(valid(a.$mc, { b: {}, x: 'ab' })).toBe(true)
      expect(valid(a.$mc, { b: {}, x: 'a' })).toBe(false)
    })

    it('types named like the utils helpers ($, $a, $p, $cv, $d)', async () => {
      const module = await load('helper-names-c')
      const code = readFileSync(path.join(rootDir, 'helper-names-c.as.js'), 'utf8')
      // (the helpers it uses keep their suffix; `annotate` is imported only when a module uses it)
      expect(code).toContain('defineAnnotatedType as $_1, throwFeatureDisabled as $d_1')
      expect(code).toContain('throwFeatureDisabled as $d_1')
      expect(code.includes('registerCompiledCheck as $cv_1')).toBe(compileValidators)
      expect(valid(module.$d, { x: { b: { a: 'abc' } } })).toBe(true)
      expect(valid(module.$d, { x: { b: { a: 'abcd' } } })).toBe(false)
      // The mutating annotate applies to the path only.
      expect(valid(module.$, { a: 'abcd' })).toBe(true)
      expect(valid(module.$a, { b: { a: 'abcd' } })).toBe(true)
      expect(valid(module.$cv, { d: { c: 'ab' } })).toBe(true)
      expect(valid(module.$cv, { d: { c: 'a' } })).toBe(false)
      expect(() => module.$.toJsonSchema()).toThrow(/JSON Schema support is disabled/)
    })

    it('mutually recursive intersections (in one module, across two)', async () => {
      const mutual = await load('rec-mutual')
      // `n0` is merged; its `n1` is I1's own (shared): the merge `I2 & M1` I1 holds.
      const n1 = get(mutual.I0, 'n0', 'n1')
      expect(n1).toBe(get(mutual.I1, 'n1'))
      expect(n1.type.kind).toBe('object')
      const value = {
        v0: 'a',
        n0: { v1: 'b', m0: 'ab', n1: { v2: 'c', m1: 'ab', k2: { v2: 'd' } } },
      }
      expect(valid(mutual.I0, value)).toBe(true)
      expect(valid(mutual.I0, { ...value, n0: { ...value.n0, m0: 'abc' } })).toBe(false)
      expect(valid(mutual.I0, { ...value, n0: { ...value.n0, n1: { v2: 'c', zz: 1 } } })).toBe(
        false
      )
      expect(valid(mutual.I0, { ...value, n0: { ...value.n0, n1: { v2: 'c', m1: 'abc' } } })).toBe(
        false
      )
      const { T, TA, E, T3 } = await load('rec-cross-a')
      const t = { a: 's', bb: 'b', b: { bb: 'q', x: 'x', a2: { a: 'z', y: 'y' } } }
      expect(valid(T, t)).toBe(true)
      const deep = { ...t, b: { ...t.b, a2: { ...t.b.a2, b: { bb: 'r', x: 'xy' } } } }
      expect(valid(T, deep)).toBe(true)
      // The alias's entry applies at its path only.
      expect(valid(TA, deep)).toBe(false)
      expect(valid(TA, t)).toBe(true)
      expect(valid(T3, { a: 's', bb: 'b', t: { bb: 'b', t: { bb: 'c', zz: 1 } } })).toBe(false)
      expect(valid(E, { a: 's', e: { a: 't', x: 'x', e: { a: 'u', zz: 1 } } })).toBe(false)
      expect(valid(E, { a: 's', e: { a: 't', x: 'x', e: { a: 'u' } } })).toBe(true)
      for (const [name, type] of Object.entries<TAtscriptAnnotatedType>({
        ...mutual,
        ...(await load('rec-cross-a')),
        ...(await load('rec-cross-b')),
      })) {
        expectParity(name, type, 3)
      }
    })

    it('a mutating annotate path through a recursive intersection', async () => {
      const { MSelf, C } = await load('rec-mutate')
      // MODEL §8: no self-collapse through an intersection member (`next?: MSelf & D`): the
      // entries stay at their exact paths, from depth 2 down (every deeper level is the same
      // merge again); the root and depth 1 are not annotated (the oracle agrees). It was: at
      // every depth, the root too.
      const at = (s: string, x: string, deeper?: object) => ({
        s: 'ab',
        next: { s: 'ab', next: { s, child: { x }, ...deeper } },
      })
      expect(valid(MSelf, at('ab', 'abc'))).toBe(true)
      expect(valid(MSelf, at('abc', 'abc'))).toBe(false)
      expect(valid(MSelf, at('ab', 'abcd'))).toBe(false)
      expect(valid(MSelf, { s: 'abc' })).toBe(true)
      expect(valid(MSelf, { s: 'ab', child: { x: 'abcd' } })).toBe(true)
      expect(valid(MSelf, at('ab', 'abc', { next: { s: 'abc' } }))).toBe(false)
      expect(valid(MSelf, at('ab', 'abc', { next: { s: 'ab', child: { x: 'abcd' } } }))).toBe(false)
      // The referenced type is not annotated.
      expect(valid(C, { x: 'abcd' })).toBe(true)
      expectParity('MSelf', MSelf, 4)
    })

    it('mutating annotate paths through other types copy every node they change', async () => {
      // MODEL §8 (no self-collapse through `next?: MDeep & D`): each entry at its exact path —
      // `maxLength 2` at depths 2 and 3 (depth 3 is depth 2's merge again), `4` from depth 4; the
      // root and depth 1 are not annotated (the oracle agrees). It was: both entries MDeep's own
      // `s`, the later one's `maxLength 4` at every depth.
      const { MDeep, Plain } = await load('rec-mutate')
      const deep = (s0: string, s2: string, s4: string) => ({
        s: s0,
        next: { s: 'x', next: { s: s2, next: { s: 'x', next: { s: s4 } } } },
      })
      expect(valid(MDeep, deep('abcd', 'ab', 'abcd'))).toBe(true)
      expect(valid(MDeep, deep('abcde', 'ab', 'abcd'))).toBe(true)
      expect(valid(MDeep, deep('abcd', 'abc', 'abcd'))).toBe(false)
      expect(valid(MDeep, deep('abcd', 'ab', 'abcde'))).toBe(false)
      // Through another type: MHolder's overrides of Plain at exactly `m.next.next.s` (2) and
      // `m.next.next.next.next.s` (4); `m.s` is Plain's own.
      const { MHolder, Tgt } = await load('rec-mutate-b')
      const holder = (s0: string, s2: string, s4: string, x: string) => ({
        m: deep(s0, s2, s4),
        t: { inner: { x } },
      })
      expect(valid(MHolder, holder('abcd', 'ab', 'abcd', 'ab'))).toBe(true)
      expect(valid(MHolder, holder('abcdef', 'ab', 'abcd', 'ab'))).toBe(true)
      expect(valid(MHolder, holder('abcd', 'abc', 'abcd', 'ab'))).toBe(false)
      expect(valid(MHolder, holder('abcd', 'ab', 'abcde', 'ab'))).toBe(false)
      expect(valid(MHolder, holder('abcd', 'ab', 'abcd', 'abc'))).toBe(false)
      // The referenced types (and their nested types) are not annotated.
      expect(valid(Tgt, { inner: { x: 'abcdef' } })).toBe(true)
      expect(valid(Plain, deep('abcdef', 'abcdef', 'abcdef'))).toBe(true)
      expectParity('MHolder', MHolder, 5)
    })

    it('a mutating annotate path through a prop inherited from another module', async () => {
      const { Q } = await load('inherited-b')
      const { $c } = await load('inherited-a')
      expect(valid(Q, { k: { c: 'a' } })).toBe(true)
      expect(valid(Q, { k: { c: 'ab' } })).toBe(false)
      expect(valid($c, { c: 'ab' })).toBe(true)
    })

    it('intersections repeating members through merges (`Node & Node`)', async () => {
      const { Wrapper } = await load('rec-dup')
      const { Wrapper: Wrapper2 } = await load('rec-dup-a')
      for (const type of [Wrapper, Wrapper2]) {
        const value = { ab: { w: { x: '1', y: '2', parent: { ab: { w: { x: 'a' } } } } } }
        expect(valid(type, value)).toBe(true)
        expect(valid(type, { ab: { w: { x: '1', z: 1 } } })).toBe(false)
        expectParity('Wrapper', type, 6)
      }
    })

    it('mutating annotate paths through runtime intersection members and union branches', async () => {
      const { PHolder, PRec, PUnion, PChild, PSelf, PBranches, PLeaf } =
        await load('annotate-paths')
      // A member of an intersection kept at runtime (`PRec & PRec`): the prop it inherits.
      const holder = (own: string) => ({ c: { own: 'x', cs: { own, d: 1 } } })
      expect(valid(PHolder, holder('ab'))).toBe(true)
      expect(valid(PHolder, holder('a'))).toBe(false)
      expect(valid(PRec, { own: 'x', cs: { own: 'a', d: 1 } })).toBe(true)
      // Every union branch having the prop: a reference inheriting it, an inline object.
      expect(valid(PUnion, { c: { own: 'a', u: '' } })).toBe(false)
      expect(valid(PUnion, { c: { own: 'a' } })).toBe(false)
      expect(valid(PUnion, { c: { own: 'ab', u: '' } })).toBe(true)
      expect(valid(PChild, { own: 'a', u: '' })).toBe(true)
      // A branch referencing the annotated type itself: MODEL §10 D2, no self-collapse through
      // union branches: the exact path `a.|0.own` (PSelf's shell at `a`, which every deeper `a`
      // is), not PSelf's own `own` (it was: its own prop, at every depth, the root too).
      expect(valid(PSelf, { own: 'a' })).toBe(true)
      expect(valid(PSelf, { own: 'ab', a: { own: 'ab', a: { own: 'a' } } })).toBe(false)
      expect(valid(PSelf, { own: 'ab', a: { own: 'ab', a: { x: 1 } } })).toBe(true)
      // A branch whose prop is not an object: not annotated (no accessor through it).
      expect(valid(PBranches, { a: { c: { e: 'a' } } })).toBe(false)
      expect(valid(PBranches, { a: { c: { e: 'ab' } } })).toBe(true)
      expect(valid(PBranches, { a: { c: 'a' } })).toBe(true)
      expect(valid(PLeaf, { e: 'a' })).toBe(true)
      expectParity('PHolder', PHolder, 7)
      expectParity('PUnion', PUnion, 8)
    })

    it('a mutating annotate path re-entering a recursive type is its own prop', async () => {
      const { RT, RV } = await load('rec-depth')
      const nested = (depth: number, s: string) => {
        let value: Record<string, unknown> = { s }
        for (let i = 0; i < depth; i++) {
          value = { next: value }
        }
        return value
      }
      const results = (type: TAtscriptAnnotatedType, wrap: (v: unknown) => unknown) =>
        [0, 1, 2, 3, 4, 5].map(depth => valid(type, wrap(nested(depth, 'abcd'))))
      // `next.next.s` is RT's own `s`: every depth, also through RT's other references to itself.
      expect(results(RT, v => v)).toEqual(Array(6).fill(false))
      expect(results(RT, v => ({ inner: { back: v } }))).toEqual(Array(6).fill(false))
      expect(valid(RT, nested(4, 'ab'))).toBe(true)
      // Through a reference from another type: RV's override at exactly `RV.t.next.s` (3 over
      // RT's 2); `t.s` and the deeper levels are RT's own `s`.
      expect(results(RV, v => ({ t: v }))).toEqual(Array(6).fill(false))
      expect([0, 1, 2, 3].map(depth => valid(RV, { t: nested(depth, 'abc') }))).toEqual([
        false,
        true,
        false,
        false,
      ])
      expectParity('RT', RT, 9)
      expectParity('RV', RV, 10)
    })

    // `type A = T` is T: a block on a plain alias is a block on what it aliases.
    it('a mutating annotate of a plain alias annotates the type it names', async () => {
      const { AaAlias, AaUnionAlias, AaLocalAlias, AaLocal } = await load('alias-annotate')
      const { AaTarget, AaUnion } = await load('alias-annotate-b')
      const value = (more: Record<string, unknown> = {}) => ({
        x: 'abc',
        n: { y: 3 },
        u: { k: 'ab' },
        ...more,
      })
      expect(valid(AaAlias, value())).toBe(true)
      for (const more of [{ n: { y: 1 } }, { u: { k: 'abc' } }]) {
        // (the target, and a union of it, too)
        for (const type of [AaAlias, AaTarget, AaUnion]) {
          expect(valid(type, value(more))).toBe(false)
        }
      }
      expect(meta(AaAlias, 'x')).toEqual({ 'meta.label': 'X' })
      expect(meta(AaTarget, 'x')).toEqual({ 'meta.label': 'X' })
      // (`AaUnionAlias` is `AaUnion`: the path through its branch is `AaUnion`'s override)
      for (const type of [AaUnionAlias, AaUnion]) {
        expect(valid(type, value({ n: { y: 4 } }))).toBe(false)
        expect(valid(type, value({ n: { y: 5 } }))).toBe(true)
      }
      expect(valid(AaTarget, value({ n: { y: 4 } }))).toBe(true)
      expect(valid(AaLocalAlias, { n: { y: 1 } })).toBe(false)
      expect(valid(AaLocal, { n: { y: 1 } })).toBe(false)
      expect(get(AaTarget, 'n', 'y').metadata.get('expect.min')).toEqual({ minValue: 3 })
    })

    it('mutating annotate paths are live: the annotated type’s own props, local copies', async () => {
      const { PeT, PeHolder, PeA, PeB, PeX, PeY, PeI, PeDept, PePerson, PeOrg, PeD2, PeP2 } =
        await load('live-paths')
      const t = (name: string, more: Record<string, unknown> = {}) => ({ name, kids: [], ...more })
      // `next.name` and `alt.name` are PeT's own `name` (3 to 5): at every depth, the top level,
      // array items and the nullable union's branch included.
      expect(valid(PeT, t('abc'))).toBe(true)
      expect(valid(PeT, t('ab'))).toBe(false)
      expect(valid(PeT, t('abcdef'))).toBe(false)
      expect(valid(PeT, t('abc', { next: t('abc', { next: t('abcde') }) }))).toBe(true)
      expect(valid(PeT, t('abc', { next: t('abc', { next: t('ab') }) }))).toBe(false)
      expect(valid(PeT, t('abc', { kids: [t('abc', { next: t('ab') })] }))).toBe(false)
      expect(valid(PeT, t('abc', { alt: t('abc', { alt: t('abcdef') }) }))).toBe(false)
      expect(valid(PeHolder, { t: t('abc', { next: t('abc') }) })).toBe(true)
      expect(valid(PeHolder, { t: t('abc', { next: t('abc', { next: t('ab') }) }) })).toBe(false)
      // Mutual recursion: `a.s` is an override of PeA at PeB.a — at every depth of PeB (`a.b`
      // is PeB), not PeA's own `s`.
      expect(valid(PeB, { t: '', a: { s: 'a' } })).toBe(false)
      expect(valid(PeB, { t: '', a: { s: 'ab', b: { t: '', a: { s: 'a' } } } })).toBe(false)
      expect(valid(PeB, { t: '', a: { s: 'ab', b: { t: '', a: { s: 'ab' } } } })).toBe(true)
      expect(valid(PeA, { s: 'a' })).toBe(true)
      expect(valid(PeA, { s: 'a', b: { t: '', a: { s: 'a' } } })).toBe(false)
      // Three types in a cycle: `y.z.x.s` is PeX's own `s`, also through PeY and PeZ.
      const x = (s: string, inner?: unknown) => ({ s, y: { z: { x: inner } } })
      expect(valid(PeX, x('ab'))).toBe(true)
      expect(valid(PeX, x('abc'))).toBe(false)
      expect(valid(PeX, x('ab', x('ab', x('abc'))))).toBe(false)
      expect(valid(PeY, { z: { x: { s: 'abc' } } })).toBe(false)
      expect(valid(PeY, { z: { x: { s: 'ab' } } })).toBe(true)
      // A path starting inside PeI's own inline structure: `inner.back` is PeI (its own `s`).
      const code = readFileSync(path.join(rootDir, 'live-paths.as.js'), 'utf8')
      expect(code).not.toContain('$c(PeI.')
      const back = (s: string, inner?: object) => ({ inner: { back: { s, ...inner } } })
      expect(valid(PeI, { s: 'abc' })).toBe(false)
      expect(valid(PeI, back('abc'))).toBe(false)
      expect(valid(PeI, back('ab', back('ab')))).toBe(true)
      expect(valid(PeI, { again: back('abc') })).toBe(false)
      // An override (`lead`) refers to the live PeDept: `lead.dept.lead.name` is labelled too,
      // and so is it through PeOrg and PePerson; PePerson's own `name` is not.
      const lead = (name: string, more: Record<string, unknown> = {}) => ({
        title: '',
        lead: { name, ...more },
      })
      expect(valid(PeDept, lead('ab'))).toBe(true)
      expect(valid(PeDept, lead('abc'))).toBe(false)
      expect(valid(PeDept, lead('ab', { dept: lead('abc') }))).toBe(false)
      expect(valid(PeDept, lead('ab', { team: { dept: lead('abc') } }))).toBe(false)
      expect(valid(PeOrg, { dept: lead('ab', { dept: lead('abc') }) })).toBe(false)
      expect(valid(PePerson, { name: 'abc' })).toBe(true)
      expect(valid(PePerson, { name: 'abc', dept: lead('abc') })).toBe(false)
      // The documented example: `lead.dept.title` is PeD2's own `title`.
      expect(valid(PeD2, { title: 'a' })).toBe(false)
      expect(valid(PeD2, { title: 'ab', lead: { name: '', dept: { title: 'a' } } })).toBe(false)
      expect(valid(PeD2, { title: 'ab', lead: { name: '', dept: { title: 'ab' } } })).toBe(true)
      expect(valid(PeP2, { name: '', dept: { title: 'a' } })).toBe(false)
      expectParity('PeT', PeT, 21)
      expectParity('PeA', PeA, 22)
      expectParity('PeX', PeX, 23)
      expectParity('PeI', PeI, 24)
      expectParity('PeDept', PeDept, 26)
      expectParity('PeD2', PeD2, 27)
    })

    it('intersections of tuples of objects resolve to never', async () => {
      // (the merge rule matches the members' nodes slot by slot; a tuple's items have no slot to
      // match — like 0.1.110, the type is `never`, with a warning)
      const { TupleInter } = await load('tuple-intersections')
      const ab = { a: 'x', b: 1 }
      for (const key of ['same', 'pair', 'mixed', 'apart']) {
        expect(TupleInter.type.props.get(key)!.type).toMatchObject({
          kind: '',
          designType: 'never',
        })
      }
      expect(valid(TupleInter, { same: [ab] })).toBe(false)
      expect(valid(TupleInter, { same: [{ a: 'x' }] })).toBe(false)
      expectParity('TupleInter', TupleInter, 25)
      // Tuples of scalars still merge.
      const { TupleScalars } = await load('tuple-intersections')
      expect(valid(TupleScalars, { s: ['x', 1] })).toBe(true)
      expect(valid(TupleScalars, { s: ['x', 'y'] })).toBe(false)
    })

    it('a mutating annotate path cloning a type of an import cycle not evaluated yet', async () => {
      // The annotating module is evaluated first; the type it clones refers (lazily) to a type
      // of the other module, not initialized yet.
      const { LzT0 } = await load('lazy-cycle-a')
      const { LzS1, LzS0 } = await load('lazy-cycle-b')
      expect(valid(LzS1, { b: { own: 'a' } })).toBe(false)
      expect(valid(LzS1, { b: { own: 'ab', d: { t: '' } } })).toBe(true)
      expect(valid(LzS1, { b: { own: 'ab', d: { t: 1 } } })).toBe(false)
      expect(valid(LzS0, { own: 'a' })).toBe(true)
      expect(valid(LzT0, { t: '', s: { b: { own: 'a' } } })).toBe(false)
    })

    it('intersections of intersections, arrays and nullable objects', async () => {
      const m = await load('merge-shapes')
      const abe = { a: '', b: '', e: '' }
      expect(valid(m.MsNested, { p: abe, q: abe, r: abe })).toBe(true)
      expect(valid(m.MsNested, { p: { a: '', b: '' }, q: abe, r: abe })).toBe(false)
      expect(valid(m.MsNested, { p: abe, q: abe, r: { a: '', e: '' } })).toBe(false)
      expect(valid(m.MsArrays, { x: [{ a: '', b: '' }] })).toBe(true)
      expect(valid(m.MsArrays, { x: [{ a: '' }] })).toBe(false)
      expect(valid(m.MsNullable, { y: { a: '', b: '' } })).toBe(true)
      expect(valid(m.MsNullable, { y: null })).toBe(false)
      expect(valid(m.MsNullable, { y: { a: '' } })).toBe(false)
      expect(valid(m.MsBothNullable, {})).toBe(true)
      expect(valid(m.MsBothNullable, { y: null })).toBe(true)
      expect(valid(m.MsBothNullable, { y: { a: '', b: '' } })).toBe(true)
      expect(valid(m.MsBothNullable, { y: { b: '' } })).toBe(false)
      for (const name of ['MsNested', 'MsArrays', 'MsNullable', 'MsBothNullable']) {
        expectParity(name, m[name], 12)
      }
    })

    it('a mutating annotate path through a type of an import cycle not evaluated yet', async () => {
      // The annotated type's module is evaluated first, before the type its path reads through.
      const { CpT } = await load('cycle-path-a')
      const { CpS } = await load('cycle-path-b')
      expect(valid(CpS, { c: { t: 'a' } })).toBe(false)
      expect(valid(CpS, { c: { t: 'ab' } })).toBe(true)
      expect(valid(CpS, { c: { x: 1 } })).toBe(true)
      expect(valid(CpT, { t: 'a' })).toBe(true)
    })

    it('aliases and annotate paths through a type of an import cycle not evaluated yet', async () => {
      // The importing module first: the aliases' module is evaluated before their target.
      const { AcAddr, AcOwner } = await load('alias-cycle-b')
      const { AcAlias1, AcAlias2, AcOrder } = await load('alias-cycle-a')
      for (const alias of [AcAlias1, AcAlias2]) {
        expect(valid(alias, { street: 'abcd' })).toBe(true)
        expect(valid(alias, { street: 1 })).toBe(false)
      }
      expect(valid(AcOrder, { address: { street: 'abc' } })).toBe(true)
      expect(valid(AcOrder, { address: { street: 'abcd' } })).toBe(false)
      expect(valid(AcAddr, { street: 'abcd' })).toBe(true)
      expect(valid(AcOwner, { orders: [{ address: { street: 'abcd' } }] })).toBe(false)
    })

    it('a prop merged from two intersection members keeps a primitive extension', async () => {
      const { MergedPrimitives } = await load('merged-primitives')
      expect(valid(MergedPrimitives, { n: { v: 1 }, b: { v: 2 } })).toBe(true)
      expect(valid(MergedPrimitives, { n: { v: 1.5 }, b: { v: 2 } })).toBe(false)
      expect(valid(MergedPrimitives, { n: { v: 1 }, b: { v: 256 } })).toBe(false)
    })
  })
}

// A definition inlined from another module that references a type that module does not export:
// the generated import would be a link error, so the compiler reports it.
describe('inlined references to a non-exported type', () => {
  it('are diagnostic errors at the inlining site', async () => {
    const repo = await build({ rootDir, entries: ['hidden-err-a.as'] })
    // An intersection member, an `annotate … as` target, an `extends` parent: their props are
    // their own nodes, shared (nothing of them is inlined). A union member merged with each
    // branch (`HU & { … }`) too: generated code writes the operands (`HU`), merged at runtime.
    expect(await messagesOf(repo, 'hidden-err-a.as')).toEqual([])
    // An `annotate … as` alias's entry, with or without annotations: nothing inlined.
    const typing = await build({ rootDir, entries: ['hidden-err-c.as'] })
    expect(await messagesOf(typing, 'hidden-err-c.as')).toEqual([])
    // An inherited prop, a merge into `never`: nothing inlined (only the merge is reported).
    const merged = await build({ rootDir, entries: ['hidden-err-d.as'] })
    expect(await messagesOf(merged, 'hidden-err-d.as')).toEqual([
      '2 6: Intersection of values with nothing in common cannot be merged in "MHA"; the type resolves to never',
    ])
    // Exported (`hidden-b.as`), the same definitions build cleanly.
    const exported = await build({ rootDir, entries: ['hidden-a.as'] })
    expect((await messagesOf(exported, 'hidden-a.as')).filter(m => m.startsWith('1 '))).toEqual([])
  })
})

describe('mutating annotate paths', () => {
  it('resolve where codegen annotates (no unknown-property errors)', async () => {
    const repo = await build({ rootDir, entries: ['annotate-paths.as'] })
    expect(await messagesOf(repo, 'annotate-paths.as')).toEqual([])
  })
})

describe('intersections nested in a merge', () => {
  // Each type's merge inlined the merged copies of the previous ones again: exponential output
  // (50 MB at 14 types) and diagnostics (24 s at 18).
  it(
    'stay runtime intersections: generate and diagnose in bounded time and size',
    { timeout: 30_000 },
    async () => {
      // Upper bounds (bytes): each type inherits every previous one's props (its `r*` merged,
      // the intersections inside those kept); a compiled check covers every type its class
      // reaches, up to a bound (larger ones are left to the interpreted engine).
      for (const [opts, limit] of [
        [{}, 800_000],
        [{ jsonSchema: 'bundle' as const }, 1_600_000],
        [{ compileValidators: true }, 2_000_000],
      ] as const) {
        const started = Date.now()
        const repo = await build({
          rootDir: scaleDir,
          entries: ['ext-chain.as'],
          plugins: [tsPlugin(opts)],
        })
        const [js] = await repo.generate({ format: 'js' })
        expect(js.content.length).toBeLessThan(limit)
        const diagnosed = Date.now()
        expect(await messagesOf(repo, 'ext-chain.as')).toEqual([])
        expect(Date.now() - diagnosed).toBeLessThan(1000)
        expect(Date.now() - started).toBeLessThan(2000)
        await expectChainModule(js.content)
      }
    }
  )

  /** The generated module validates like the merged types (the engines agree). */
  async function expectChainModule(js: string) {
    const out = mkdtempSync(path.join(tmpdir(), 'atscript-chain-'))
    try {
      writeFileSync(path.join(out, 'ext-chain.as.js'), js)
      const { Ch18 } = await import(path.join(out, 'ext-chain.as.js'))
      const value = { v0: 1, r18: { v0: 1, a18: 'x', r17: { a17: 'y', r1: { a1: 'z' } } } }
      expect(valid(Ch18, value)).toBe(true)
      expect(valid(Ch18, { r18: { r17: { a17: 1 } } })).toBe(false)
      expect(valid(Ch18, { r18: { r17: { r16: { v0: 'x' } } } })).toBe(false)
      expectParity('Ch18', Ch18, 11, 20)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }
})

describe('a small intersection nested in a merged member', () => {
  // Kept a runtime intersection (whatever its size), it flattened to a union: atscript-db made
  // a JSON column of `address.pt` instead of the `address.pt.lat` / `.lng` columns.
  it('is merged into a structure, like at the top level', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-nested-'))
    try {
      writeFileSync(
        path.join(dir, 'nested.as'),
        [
          'export interface Geo {',
          '  pt: { lat: number } & { lng: number }',
          '  tags: { a: string } & { b?: string }',
          '}',
          'export interface Order {',
          '  address: Geo & { note?: string }',
          '}',
        ].join('\n')
      )
      const repo = await build({ rootDir: dir, entries: ['nested.as'], plugins: [tsPlugin()] })
      const [js] = await repo.generate({ format: 'js' })
      expect(js.content).not.toContain('$("intersection")')
      writeFileSync(path.join(dir, 'nested.as.js'), js.content)
      const { Order } = await import(path.join(dir, 'nested.as.js'))
      expect(get(Order, 'address', 'pt').type.kind).toBe('object')
      const flat = flattenAnnotatedType(Order)
      expect([...flat.keys()]).toEqual([
        '',
        'address',
        'address.pt',
        'address.pt.lat',
        'address.pt.lng',
        'address.tags',
        'address.tags.a',
        'address.tags.b',
        'address.note',
      ])
      expect(flat.get('address.pt')!.type.kind).toBe('object')
      expect(valid(Order, { address: { pt: { lat: 1, lng: 2 }, tags: { a: 'x' } } })).toBe(true)
      expect(valid(Order, { address: { pt: { lat: 1 }, tags: { a: 'x' } } })).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('a class referencing a large class', () => {
  // The cap on a compiled check's type defs counted the referenced class's too: a class merely
  // referencing a large one was left to the interpreted engine as well. (Round 24, PCAP: no class
  // is left to the interpreted engine for its size — the large one compiles too, as in 0.1.110;
  // the classes referencing it bind to its check.)
  it('compiles its own tree, the large one compiled too', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-large-'))
    try {
      const props = Array.from(
        { length: 260 },
        (_, i) => `  p${i}?: { x${i}: string, n${i}?: number[] }`
      )
      writeFileSync(
        path.join(dir, 'large.as'),
        [
          `export interface Big {\n${props.join('\n')}\n}`,
          'export interface Holder {\n  big: Big\n  other: string\n}',
          'export interface Holder2 {\n  bigs: Big[]\n  self?: Holder2\n}',
        ].join('\n')
      )
      const repo = await build({
        rootDir: dir,
        entries: ['large.as'],
        plugins: [tsPlugin({ compileValidators: true })],
      })
      const [js] = await repo.generate({ format: 'js' })
      writeFileSync(path.join(dir, 'large.as.js'), js.content)
      const { Big, Holder, Holder2 } = await import(path.join(dir, 'large.as.js'))
      // The registry the module registered with (modules may have been reset by other tests).
      const { boundCheck } = await import('../../test/compiled-engine')
      expect(boundCheck(Big)).not.toBeNull()
      expect(boundCheck(Holder)).not.toBeNull()
      expect(boundCheck(Holder2)).not.toBeNull()
      const big = { p3: { x3: 'a' }, p199: { x199: 'b', n199: [1] } }
      expect(valid(Holder, { big, other: 's' })).toBe(true)
      expect(valid(Holder, { big: { p3: { x3: 1 } }, other: 's' })).toBe(false)
      expect(valid(Holder, { big, other: 1 })).toBe(false)
      expect(valid(Holder2, { bigs: [big], self: { bigs: [] } })).toBe(true)
      expect(valid(Holder2, { bigs: [{ p199: { x199: 1 } }] })).toBe(false)
      expectParity('Holder', Holder, 31, 10)
      expectParity('Holder2', Holder2, 32, 10)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('classes merging one another: a large merge compiles once', () => {
  // Each class's compiled check inlined everything it reached (up to 500 type defs): the merges of
  // classes merging one another (one object wherever they are) were compiled again in every class
  // and place reaching them — 2.1 MB for this module of four classes (13.5 MB for five). A class or
  // merge reaching many type defs has its own check now, which the others call (round 24 part 3).
  it('compiles each merge once, with the same results', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merges-'))
    try {
      const source = (n: number) => {
        const cls = (i: number) =>
          `export interface T${i} {\n  v${i}?: string\n  o?: T${(i + 1) % n} & { p?: T${(i + 2) % n} & T${(i + 1) % n}, o?: T${i} }\n  s?: T${i} & { s?: T${(i + 1) % n} }\n}`
        return `${Array.from({ length: n }, (_, i) => cls(i)).join('\n')}\nexport interface Root {\n  r?: T0 & T1\n}\n`
      }
      // MODEL §6 safety net: four classes merging one another are 245 distinct merges, i.e.
      // hidden merge classes in one module (> 200): a compile error. Three are 67.
      writeFileSync(path.join(dir, 'merges.as'), source(4))
      const tooComplex = await build({
        rootDir: dir,
        entries: ['merges.as'],
        plugins: [tsPlugin({ compileValidators: true })],
      })
      expect(await messagesOf(tooComplex, 'merges.as')).toEqual([
        '1 0: merge too complex: split it with named types',
      ])
      writeFileSync(path.join(dir, 'merges.as'), source(3))
      const repo = await build({
        rootDir: dir,
        entries: ['merges.as'],
        plugins: [tsPlugin({ compileValidators: true })],
      })
      const [js] = await repo.generate({ format: 'js' })
      // was 2 117 782
      expect(js.content.length).toBeLessThan(1_000_000)
      writeFileSync(path.join(dir, 'merges.as.js'), js.content)
      const M = await import(path.join(dir, 'merges.as.js'))
      const { boundCheck } = await import('../../test/compiled-engine')
      for (const name of ['T0', 'T1', 'T2', 'Root']) {
        expect(boundCheck(M[name])).not.toBeNull()
      }
      expect(valid(M.Root, { r: { v0: 'a', v1: 'b', o: { v2: 'c', p: { v0: 'd' } } } })).toBe(true)
      expect(valid(M.Root, { r: { o: { p: { v0: 1 } } } })).toBe(false)
      expectParity('Root', M.Root, 41, 10)
      expectParity('T0', M.T0, 42, 10)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('a type with tens of thousands of props or items', () => {
  // Its builder chain (one call per prop) was nested too deep for V8 to parse the module.
  it('is emitted in segments a module can load', { timeout: 60_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-wide-'))
    try {
      const props = Array.from({ length: 12_000 }, (_, i) => `  p${i}?: string`)
      const items = Array.from({ length: 12_000 }, (_, i) => `'v${i}'`)
      writeFileSync(
        path.join(dir, 'wide.as'),
        [
          `export interface Wide {\n${props.join('\n')}\n  inner?: {\n${props.join('\n')}\n  }\n}`,
          `export type Many = ${items.join(' | ')}`,
          'export interface Small {\n  a?: string\n  b?: { c?: string }\n}',
        ].join('\n')
      )
      const repo = await build({ rootDir: dir, entries: ['wide.as'], plugins: [tsPlugin()] })
      const [js] = await repo.generate({ format: 'js' })
      // An ordinary chain is emitted as it was (P4B default format: the generated JS mirrors the
      // .as structure, one `.prop("a", …)` per prop).
      expect(js.content).toContain('$("object", Small)\n  .prop("a", ')
      writeFileSync(path.join(dir, 'wide.as.js'), js.content)
      const { Wide, Many } = await import(path.join(dir, 'wide.as.js'))
      expect(Wide.type.props.size).toBe(12_001)
      expect(Wide.type.props.get('inner').type.props.size).toBe(12_000)
      expect(Many.type.items).toHaveLength(12_000)
      expect(valid(Wide, { p11999: 'x', inner: { p0: 'y' } })).toBe(true)
      expect(valid(Wide, { inner: { p11999: 1 } })).toBe(false)
      expect(valid(Many, 'v11999')).toBe(true)
      expect(valid(Many, 'v12000')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // PCAP: a large class compiled like any (it was left to the interpreted engine above 500 type
  // nodes — 4–6× slower than 0.1.110, which compiled it).
  it('compiles whatever its size', { timeout: 60_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-wide-cv-'))
    try {
      const props = Array.from(
        { length: 400 },
        (_, i) =>
          `  @expect.maxLength 3\n  p${i}?: string\n  o${i}?: { @expect.minLength 1\n q: string }`
      )
      const items = Array.from({ length: 600 }, (_, i) => `'v${i}'`)
      writeFileSync(
        path.join(dir, 'wide.as'),
        [
          `export interface Wide {\n${props.join('\n')}\n}`,
          `export type Many = ${items.join(' | ')}`,
        ].join('\n')
      )
      const repo = await build({
        rootDir: dir,
        entries: ['wide.as'],
        plugins: [tsPlugin({ compileValidators: true })],
      })
      const [js] = await repo.generate({ format: 'js' })
      expect(js.content).toContain('$cv(Wide,')
      expect(js.content).toContain('$cv(Many,')
      writeFileSync(path.join(dir, 'wide.as.js'), js.content)
      const { Wide, Many } = await import(path.join(dir, 'wide.as.js'))
      expect(valid(Wide, { p399: 'abc', o399: { q: 'x' } })).toBe(true)
      expect(valid(Wide, { p399: 'abcd' })).toBe(false)
      expect(valid(Wide, { o200: { q: '' } })).toBe(false)
      expect(valid(Many, 'v599')).toBe(true)
      expect(valid(Many, 'v600')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('a chain of thousands of nested intersections', () => {
  // `I0 { x?: I1 & J }`, `I1 { x?: I2 & J }`, …: merging, the recursion search, flattening and
  // compiled checks used to recurse once per level (a stack overflow / out of memory).
  it(
    'builds, diagnoses and flattens without exhausting the stack',
    { timeout: 60_000 },
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'atscript-chain-'))
      const lines = ['export interface J { j?: string }']
      for (let i = 0; i < 3000; i++) {
        lines.push(`export interface I${i} { v${i}?: number; x?: I${i + 1} & J }`)
      }
      lines.push('export interface I3000 { end?: string }')
      writeFileSync(path.join(dir, 'chain.as'), lines.join('\n'))
      try {
        for (const opts of [{}, { compileValidators: true }]) {
          const started = Date.now()
          const repo = await build({
            rootDir: dir,
            entries: ['chain.as'],
            plugins: [tsPlugin(opts)],
          })
          // MODEL §6 safety net: 3000 distinct merges are 3000 hidden merge classes in one module
          // (> 200): a compile error, diagnosed (and refused by the printer) without exhausting the
          // stack.
          const tooComplex = 'merge too complex: split it with named types'
          await expect(repo.generate({ format: 'js' })).rejects.toThrow(tooComplex)
          expect(await messagesOf(repo, 'chain.as')).toEqual([`1 0: ${tooComplex}`])
          const doc = repo.getDoc(`file://${path.join(dir, 'chain.as')}`)!
          // (the module does not evaluate: no `.d.ts` `__flat`; a path's definitions are found)
          expect(dtsFlat(doc, 'I0', opts)).toBeUndefined()
          const defs = flatDefinitions(doc, doc.unwindType('I0')!.def as never)
          expect(defs('x.x.v2').map(d => d.prop.id)).toEqual(['v2'])
          expect(Date.now() - started).toBeLessThan(20_000)
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )
})

describe('a mutating annotate of an extended type', () => {
  // Folded into the extending type's props, it copied the annotated structure: a copy was a new
  // type to the intersections (their recursion search, `X & X`), so merges came out differently.
  const generate = async (text: string) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-fold-'))
    try {
      writeFileSync(path.join(dir, 'fold.as'), text)
      const repo = await build({ rootDir: dir, entries: ['fold.as'], plugins: [tsPlugin()] })
      const [js] = await repo.generate({ format: 'js' })
      return js.content
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  // The classes' chains (not the annotate block, not the module's export lines), without the
  // annotation. (P4B default format: the block is printed as data, `$blk(…)`, after the chains.)
  const chains = (js: string) =>
    js
      .slice(js.indexOf('$("object", '), js.search(/\$blk\(|\/\/ (Ad-hoc|prettier-ignore-end)/))
      .replaceAll(/\n\s*\.annotate\("meta\.label", "Z"\)/g, '')
      .replaceAll(/\nexport \{[^\n]*\}/g, '')
      .trim()

  for (const [name, source, annotate] of [
    [
      'a recursive intersection with a member inheriting the annotated prop',
      [
        'export interface FS1 {\n  e?: FS1\n}',
        'export interface FS2 {\n  d: {\n    e: FS1\n    a?: string\n  }\n}',
        'export interface FT3 extends FS2 {\n  t3: string\n}',
        'export interface FT2 {\n  d?: FT2 & FS1\n  c?: FT3 & FT2\n}',
      ].join('\n'),
      "annotate FS2 {\n  @meta.label 'Z'\n  d.a\n}",
    ],
    [
      'an intersection of the annotated type and a type extending it',
      [
        'export interface DS1 {\n  d: {\n    c?: {\n      e?: string\n      b?: DS1 & DS2\n    }\n  }\n}',
        'export interface DS2 extends DS1 {\n  s2?: string\n}',
        'export interface DH {\n  h?: DS1 & DS2\n}',
      ].join('\n'),
      "annotate DS1 {\n  @meta.label 'Z'\n  d.c\n}",
    ],
  ]) {
    it(`changes metadata only, not how intersections merge (${name})`, async () => {
      const plain = await generate(source)
      const annotated = await generate(`${source}\n${annotate}\n`)
      expect(chains(annotated)).toEqual(chains(plain))
    })
  }
})

describe('annotate alias with a path through a recursive type', () => {
  it('diagnoses without overflowing', async () => {
    for (const entry of ['rec-inline-a.as', 'rec-inline.as']) {
      const repo = await build({ rootDir, entries: [entry] })
      const diagnostics = await repo.diagnostics()
      const errors = [...diagnostics.values()].flat().filter(m => m.severity === 1)
      expect(errors).toEqual([])
    }
  })
})

describe('recursive intersections', () => {
  it('diagnose and flatten without overflowing', async () => {
    const repo = await build({ rootDir, entries: ['rec-merge.as'] })
    const diagnostics = await repo.diagnostics()
    expect([...diagnostics.values()].flat().filter(m => m.severity === 1)).toEqual([])
    const doc = repo.getDoc(`file://${path.join(rootDir, 'rec-merge.as')}`)!
    for (const name of ['Node', 'Self', 'Base', 'X3']) {
      expect(dtsFlat(doc, name)?.size).toBeGreaterThan(0)
    }
  })
})

describe('mutually recursive intersections', () => {
  // Merging used to inline every intersection reachable from another again and again:
  // exponential output (hundreds of MB for three such interfaces, no end for four).
  it('generate, diagnose and flatten in bounded time and size', async () => {
    const sizes: Record<string, number> = {}
    for (const [variant, opts] of [
      ['js', {}],
      ['bundle', { jsonSchema: 'bundle' as const }],
      ['compiled', { compileValidators: true }],
    ] as const) {
      const started = Date.now()
      const repo = await build({
        rootDir,
        entries: ['rec-mutual.as', 'rec-cross-a.as', 'rec-cross-b.as'],
        plugins: [tsPlugin(opts)],
      })
      for (const file of await repo.generate({ format: 'js' })) {
        sizes[`${variant} ${file.fileName}`] = file.content.length
      }
      const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
      expect(errors).toEqual([])
      for (const name of ['rec-mutual.as', 'rec-cross-a.as', 'rec-cross-b.as']) {
        const doc = repo.getDoc(`file://${path.join(rootDir, name)}`)!
        for (const node of doc.nodes) {
          if (node.entity === 'interface') {
            // (expanded until each intersection repeats, as the runtime flattens it: I0 is 887)
            expect(dtsFlat(doc, node.id!, opts)!.size).toBeLessThan(1000)
          }
        }
      }
      expect(Date.now() - started).toBeLessThan(2000)
    }
    // Upper bounds (bytes). Each compiled check covers the same-file types its class reaches
    // (all of them here).
    const limits: Record<string, number> = {
      'js rec-mutual.as.js': 30_000,
      'js rec-cross-a.as.js': 20_000,
      'js rec-cross-b.as.js': 10_000,
      'bundle rec-mutual.as.js': 80_000,
      'bundle rec-cross-a.as.js': 50_000,
      'bundle rec-cross-b.as.js': 20_000,
      'compiled rec-mutual.as.js': 500_000,
      'compiled rec-cross-a.as.js': 150_000,
      'compiled rec-cross-b.as.js': 50_000,
    }
    expect(Object.keys(sizes).sort()).toEqual(Object.keys(limits).sort())
    expect(Object.entries(sizes).filter(([file, size]) => size > limits[file])).toEqual([])
  })

  it('repeated members keep the recursion search finite', async () => {
    for (const entries of [['rec-dup.as'], ['rec-dup-a.as', 'rec-dup-b.as']]) {
      const started = Date.now()
      const repo = await build({
        rootDir,
        entries,
        plugins: [tsPlugin({ compileValidators: true })],
      })
      for (const file of await repo.generate({ format: 'js' })) {
        expect(file.content.length).toBeLessThan(100_000)
      }
      const byDocument = await repo.diagnostics()
      expect([...byDocument.values()].flat()).toEqual([])
      expect(Date.now() - started).toBeLessThan(2000)
    }
  })

  it('members built by merges keep the recursion guard finite', async () => {
    // Arrays of intersections, distributed unions and merged operands kept in a runtime
    // intersection are the same node every time: a new one on every merge was a new member
    // the recursion guard never saw again (a stack overflow).
    for (const opts of [{}, { compileValidators: true }]) {
      const started = Date.now()
      const repo = await build({
        rootDir: scaleDir,
        entries: ['merge-mesh-a.as', 'merge-mesh-b.as'],
        plugins: [tsPlugin(opts)],
      })
      for (const file of await repo.generate({ format: 'js' })) {
        expect(file.content.length).toBeLessThan(1_500_000)
      }
      await repo.diagnostics()
      expect(Date.now() - started).toBeLessThan(5000)
    }
  })

  // MODEL §10 D4: a named merge that is an operand of itself (`X = A & X`, `Y = Z & A`,
  // `Z = Y & A`) is a compile error (the fixture lives in its own directory: it does not build).
  it('an intersection alias that includes itself is a compile error', async () => {
    const selfDir = path.join(__dirname, 'fixtures', 'self-operand')
    const message = 'a type cannot be an operand of its own merge; recurse through a field instead'
    for (const opts of [{}, { compileValidators: true, jsonSchema: 'bundle' as const }]) {
      const repo = await build({
        rootDir: selfDir,
        entries: ['rec-alias.as'],
        plugins: [tsPlugin(opts)],
      })
      expect(await messagesOf(repo, 'rec-alias.as')).toEqual(
        [4, 5, 6].map(l => `1 ${l}: ${message}`)
      )
      await expect(repo.generate({ format: 'js' })).rejects.toThrow(message)
    }
  })

  it('bundled JSON schemas match the runtime ones', async () => {
    const repo = await build({
      rootDir,
      entries: ['rec-mutual.as', 'rec-cross-a.as', 'rec-cross-b.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
    })
    for (const file of await repo.generate({ format: 'js' })) {
      // The generated modules of the fixtures (written above).
      const module = await import(path.join(rootDir, file.fileName))
      const bundled = file.content.matchAll(
        /class (\S+) \{[\s\S]*?static toJsonSchema\(\) \{\n[^\n]*\n\s*return (.*)\n/g
      )
      let count = 0
      for (const [, name, schema] of bundled) {
        expect([name, JSON.parse(schema)]).toEqual([name, buildJsonSchema(module[name])])
        count++
      }
      expect(count).toBeGreaterThan(1)
    }
  })
})

describe('mutating annotates of an import cycle', () => {
  // Applied as each module was evaluated (or deferred until the target existed), they ran in an
  // order depending on which module was imported first: the annotated types differed with it.
  /** The metadata (validator keys and labels) of every node below `node`, to depth 6. */
  const tree = (node: any, depth = 0): unknown => {
    if (!node || depth > 6) {
      return null
    }
    const t = node.type
    return {
      kind: t.kind,
      meta: [...node.metadata].filter(([key]: [string]) => !key.startsWith('expect.type')),
      props: t.kind === 'object' ? [...t.props].map(([k, v]: any) => [k, tree(v, depth + 1)]) : [],
      items: (t.items ?? (t.of ? [t.of] : [])).map((v: any) => tree(v, depth + 1)),
    }
  }
  /** The exports of the generated `files`, the entry modules imported in `order`. */
  const loadInOrder = async (
    files: Array<{ fileName: string; content: string }>,
    order: string[]
  ) => {
    // A directory per order: a module is evaluated once per path.
    const out = mkdtempSync(path.join(tmpdir(), 'atscript-order-'))
    try {
      for (const file of files) {
        writeFileSync(path.join(out, path.basename(file.fileName)), file.content)
      }
      const types: Record<string, any> = {}
      for (const entry of order) {
        Object.assign(types, await import(path.join(out, `${entry}.as.js`)))
      }
      return types
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }
  const permutations = (list: string[]): string[][] =>
    list.length <= 1
      ? [list]
      : list.flatMap((first, i) =>
          permutations(list.filter((_, j) => j !== i)).map(rest => [first, ...rest])
        )

  for (const entries of [
    ['order-a', 'order-b'],
    ['order3-a', 'order3-b', 'order3-c'],
  ]) {
    for (const compileValidators of [false, true]) {
      it(`apply in one order, whichever module is imported first (${entries.join(', ')}${compileValidators ? ', compiled' : ''})`, async () => {
        const repo = await build({
          rootDir,
          entries: entries.map(e => `${e}.as`),
          plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators })],
        })
        const files = await repo.generate({ format: 'js' })
        const trees = new Set<string>()
        for (const order of permutations(entries)) {
          const types = await loadInOrder(files, order)
          const names = Object.keys(types).sort()
          trees.add(JSON.stringify(names.map(name => [name, tree(types[name])])))
          for (const name of names) {
            expect([name, types[name].toJsonSchema()]).toEqual([name, buildJsonSchema(types[name])])
          }
        }
        expect(trees.size).toBe(1)
      })
    }
  }
})

describe('bundled JSON schemas of mutating-annotated types', () => {
  // The schema bundled at build time used to ignore mutating annotates (the runtime one
  // includes them): it must be the one the loaded module builds.
  const compiledDir = path.join(__dirname, 'fixtures', 'compiled')
  for (const [dir, entries, checked = entries.length] of [
    [rootDir, ['annotate-order.as']],
    [rootDir, ['annotate-cycle-a.as', 'annotate-cycle-b.as']],
    [rootDir, ['cycle-a.as', 'cycle-b.as']],
    [rootDir, ['cycle-path-a.as', 'cycle-path-b.as']],
    [rootDir, ['alias-cycle-a.as', 'alias-cycle-b.as']],
    // (`rec-alias.as`, an intersection alias including itself, is a compile error now: MODEL §10 D4.)
    // (`ext.as` does not import the module annotating its type: its own schema has no reason
    // to include that annotation, the runtime one of a program loading both does.)
    [path.join(__dirname, 'fixtures', 'compiled-annotated'), ['unrelated.as', 'ext.as'], 1],
    [rootDir, ['forward.as']],
    [rootDir, ['helper-names-a.as', 'helper-names-b.as', 'helper-names-c.as']],
    [rootDir, ['rec-mutate.as', 'rec-mutate-b.as']],
    [rootDir, ['rec-depth.as']],
    [rootDir, ['annotate-paths.as']],
    [rootDir, ['live-paths.as']],
    [rootDir, ['tuple-intersections.as']],
    [rootDir, ['order-a.as', 'order-b.as']],
    [rootDir, ['order3-a.as', 'order3-b.as', 'order3-c.as']],
    [compiledDir, ['models.as', 'shared.as']],
  ] as Array<[string, string[], number?]>) {
    it(`equal the runtime ones (${entries.join(', ')})`, async () => {
      const out = mkdtempSync(path.join(tmpdir(), 'atscript-bundle-'))
      try {
        const repo = await build({
          rootDir: dir,
          entries: [...entries],
          plugins: [tsPlugin({ jsonSchema: 'bundle' })],
        })
        const files = await repo.generate({ format: 'js' })
        for (const file of files) {
          writeFileSync(path.join(out, path.basename(file.fileName)), file.content)
        }
        let count = 0
        const names = new Set(entries.slice(0, checked).map(entry => `${entry}.js`))
        for (const file of files.filter(f => names.has(path.basename(f.fileName)))) {
          const module = await import(path.join(out, path.basename(file.fileName)))
          for (const [name, cls] of Object.entries(module) as Array<[string, any]>) {
            // (`$i_…` / `$h_…`: in-place merge operands and hidden merge classes, extra module
            // exports that are not declarations)
            if (
              cls?.__is_atscript_annotated_type &&
              !name.startsWith('$i_') &&
              !name.startsWith('$h_')
            ) {
              expect([name, cls.toJsonSchema()]).toEqual([name, buildJsonSchema(cls)])
              count++
            }
          }
        }
        expect(count).toBeGreaterThan(0)
      } finally {
        rmSync(out, { recursive: true, force: true })
      }
    })
  }
})

describe('flattening a recursive union / array alias', () => {
  it('stops at the recursion', async () => {
    const dir = path.join(__dirname, '..', '..', 'test', 'fixtures')
    for (const [file, name, path_] of [
      ['extends-recursive-child.as', 'Child', 'state.context'],
      ['jsonschema-recursive-alias.as', 'Doc', 'json'],
      ['jsonschema-recursive-chain.as', 'W', 'j'],
    ]) {
      const repo = await build({ rootDir: dir, entries: [file] })
      const doc = repo.getDoc(`file://${path.join(dir, file)}`)!
      expect([file, dtsFlat(doc, name)?.has(path_)]).toEqual([file, true])
    }
  })
})

describe('arguments of annotations without a spec (unknownAnnotation: allow / warn)', () => {
  // A type name, a chain or a backtick argument used to be emitted as is: an undeclared
  // variable at module load (`B is not defined`), or an empty argument; an argument left
  // empty (`@x , 'z'`) generated `.annotate("x", ,, true)` (a syntax error).
  const sources: Record<string, { lines: string[]; meta: Record<string, unknown> }> = {
    names: {
      lines: [
        '  @x.local Local',
        '  @x.imported B',
        '  @x.chain Local.x',
        '  @x.undeclared Nope',
        "  @x.query `Local.x = 'y'`",
      ],
      meta: {
        'x.local': 'Local',
        'x.imported': 'B',
        'x.chain': 'Local.x',
        'x.undeclared': 'Nope',
        'x.query': "Local.x = 'y'",
      },
    },
    empty: {
      // two arguments: kept as a list of the first (as in 0.1.110)
      lines: ["  @x.empty , 'z'"],
      meta: { 'x.empty': [undefined] },
    },
    literals: {
      lines: ["  @x.text 'z'", '  @x.num -1.5', '  @x.flag true', '  @x.nil null', '  @x.none'],
      meta: { 'x.text': 'z', 'x.num': -1.5, 'x.flag': true, 'x.nil': null, 'x.none': true },
    },
  }
  for (const [name, { lines, meta: expected }] of Object.entries(sources)) {
    for (const unknownAnnotation of ['allow', 'warn'] as const) {
      for (const compileValidators of [false, true]) {
        it(`${name}: kept as written, the module loads (${unknownAnnotation}, compileValidators: ${compileValidators})`, async () => {
          const dir = mkdtempSync(path.join(tmpdir(), 'atscript-unknown-'))
          try {
            writeFileSync(path.join(dir, 'b.as'), 'export interface B {\n  y: number\n}\n')
            writeFileSync(
              path.join(dir, 'a.as'),
              [
                "import { B } from './b'",
                'export interface Local {',
                '  x: string',
                '}',
                'export interface T {',
                ...lines,
                '  a: string',
                '}',
              ].join('\n')
            )
            const repo = await build({
              rootDir: dir,
              entries: ['a.as', 'b.as'],
              unknownAnnotation,
              plugins: [tsPlugin({ compileValidators })],
            })
            const byDocument = await repo.diagnostics()
            const diagnostics = [...byDocument.values()].flat()
            expect(diagnostics.filter(m => m.severity === 1)).toEqual([])
            for (const file of await repo.generate({ format: 'js' })) {
              writeFileSync(path.join(dir, file.fileName), file.content)
            }
            const { T } = await import(path.join(dir, 'a.as.js'))
            expect(meta(T, 'a')).toEqual(expected)
            expect(valid(T, { a: 'v' })).toBe(true)
            const restored = deserializeAnnotatedType(serializeAnnotatedType(T))
            expect(meta(restored, 'a')).toEqual(expected)
          } finally {
            rmSync(dir, { recursive: true, force: true })
          }
        })
      }
    }
  }
})

describe('an array of a literal type', () => {
  // `'y'[]` and `1[]` were "Unexpected token" (only `('y')[]` parsed).
  it('parses like an array of a parenthesized literal, binding tighter than | and &', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-literal-array-'))
    try {
      writeFileSync(
        path.join(dir, 'lit.as'),
        [
          "export type Ys = 'y'[]",
          'export type Grid = 1[][]',
          "export type AorBs = 'a' | 'b'[]",
          'export interface I {',
          "  tags?: 'a' | 'b'[]",
          "  both: 'a'[] & string[]",
          '  neg: -1[]',
          "  pair: ['x'[], 2]",
          '}',
        ].join('\n')
      )
      const repo = await build({ rootDir: dir, entries: ['lit.as'], plugins: [tsPlugin()] })
      const byDocument = await repo.diagnostics()
      expect([...byDocument.values()].flat()).toEqual([])
      const [dts] = await repo.generate({ format: 'dts' })
      for (const line of [
        'export type Ys = "y"[]',
        'export type Grid = 1[][]',
        'export type AorBs = "a" | "b"[]',
        '  tags?: "a" | "b"[]',
        '  both: "a"[] & string[]',
        '  neg: -1[]',
        '  pair: ["x"[], 2]',
      ]) {
        expect(dts.content).toContain(`${line}\n`)
      }
      const [js] = await repo.generate({ format: 'js' })
      writeFileSync(path.join(dir, 'lit.as.js'), js.content)
      const { Ys, Grid, AorBs, I } = await import(path.join(dir, 'lit.as.js'))
      expect([valid(Ys, ['y', 'y']), valid(Ys, ['n']), valid(Ys, 'y')]).toEqual([
        true,
        false,
        false,
      ])
      expect([valid(Grid, [[1], []]), valid(Grid, [1])]).toEqual([true, false])
      expect([
        valid(AorBs, 'a'),
        valid(AorBs, ['b']),
        valid(AorBs, 'b'),
        valid(AorBs, ['a']),
      ]).toEqual([true, true, false, false])
      const value = { tags: ['b'], both: ['a'], neg: [-1], pair: [['x'], 2] }
      expect(valid(I, value)).toBe(true)
      expect(valid(I, { ...value, both: ['b'] })).toBe(false)
      expect(valid(I, { ...value, tags: 'b' })).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
