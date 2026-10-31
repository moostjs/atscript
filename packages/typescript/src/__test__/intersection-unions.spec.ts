import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boundCheck,
  COMPILED_ENGINE,
  compileType,
  installCompiledEngine,
} from '../../test/compiled-engine'
import { tsPlugin } from '../plugin'
import {
  defineAnnotatedType as $,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeObject,
} from '../runtime/annotated-type'
import { __setAutoCompile } from '../runtime/compiled-check/registry'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { prepareFixtures, rng, WalkValidator } from '../test-utils'

// A runtime intersection (one built at runtime: generated code merges every intersection of
// objects, see `runtimeOf`) checks each member on its own, like JSON Schema `allOf`. The walk, the
// interpreted and the compiled pre-checks agree on it, and — unknown keys ignored — it accepts /
// rejects what the merged type does (merged in place or as a merge state), a union member
// included (`A & (B | C)` merges to `(A & B) | (A & C)`).

const rootDir = path.join(__dirname, 'fixtures', 'intersection-unions')

let shapes: Record<string, TAtscriptAnnotatedType>

beforeAll(async () => {
  // Generated checks only (`compileValidators`), and runtime ones compiled explicitly.
  __setAutoCompile(null)
  await prepareFixtures({ rootDir, formats: ['js'], tsPluginOptions: { compileValidators: true } })
  shapes = await import(path.join(rootDir, 'shapes.as.js'))
})

afterAll(() => {
  if (COMPILED_ENGINE) {
    installCompiledEngine()
  }
})

const OPTION_SETS: Array<Partial<TValidatorOptions>> = [
  {},
  { unknownProps: 'strip' },
  { unknownProps: 'ignore' },
  { partial: 'deep' },
  { errorLimit: 1 },
]
const IGNORE = { unknownProps: 'ignore' } as const

function run(v: Validator, x: unknown) {
  try {
    return v.validate(x, true)
  } catch (error) {
    return `threw: ${(error as Error).message}`
  }
}

/**
 * `def` validated by the walk, by the pre-check (the compiled one when bound, else the
 * interpreted one) and by the interpreted pre-check (a copy of the root has no compiled check):
 * the same result, errors and strips. Returns the walk's result and value after it.
 */
function engines(def: TAtscriptAnnotatedType, opts: Partial<TValidatorOptions>, value: unknown) {
  const walk = new WalkValidator(def, opts)
  const expected = structuredClone(value)
  const result = run(walk, expected)
  for (const root of [def, { ...def }]) {
    const fast = new Validator(root, opts)
    const actual = structuredClone(value)
    expect(run(fast, actual)).toBe(result)
    expect(fast.errors).toEqual(walk.errors)
    expect(actual).toEqual(expected)
  }
  return { result, value: expected }
}

interface TPair {
  runtime: TAtscriptAnnotatedType
  merged: TAtscriptAnnotatedType
  label?: string
}

/**
 * The runtime intersection `runtime` and the merged `merged`, each alike in every engine, accept /
 * reject `value` alike with unknown keys ignored (`label` names the case on a mismatch). Returns
 * the runtime intersection's result.
 */
function sameAsMerged(
  { runtime, merged, label }: TPair,
  value: unknown,
  opts: Partial<TValidatorOptions>
) {
  const a = engines(runtime, opts, value).result
  const b = engines(merged, opts, value).result
  if (opts.unknownProps === 'ignore') {
    const json = JSON.stringify(value)
    expect({ label, json, opts, result: a }).toEqual({ label, json, opts, result: b })
  }
  return a === true
}

// ── random values ───────────────────────────────────────────────────────────

const POOL: unknown[] = ['', 'x', 0, 1, 2.5, true, false, null, undefined, [], {}, { a: 'x' }]

const pick = <T>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length)]

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Objects (and arrays, item by item) deep-merged (the values of the members of an intersection). */
function mergeValues(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...a.map((x, i) => (i < b.length ? mergeValues(x, b[i]) : x)), ...b.slice(a.length)]
  }
  if (!isObject(a) || !isObject(b)) {
    return b === undefined ? a : b
  }
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k] = k in out ? mergeValues(out[k], v) : v
  }
  return out
}

function gen(def: TAtscriptAnnotatedType, r: () => number, depth = 0): unknown {
  if (r() < 0.05 || depth > 8) {
    return structuredClone(pick(r, POOL))
  }
  if (def.optional && r() < 0.25) {
    return r() < 0.7 ? undefined : null
  }
  const t = def.type as any
  switch (t.kind) {
    case '': {
      if (t.value !== undefined) {
        return t.value
      }
      if (t.tags?.has('email')) {
        return pick(r, ['a@b.co', 'x'])
      }
      switch (t.designType) {
        case 'string': {
          return pick(r, ['x', 'abc'])
        }
        case 'number': {
          return pick(r, [1, 2.5])
        }
        case 'boolean': {
          return r() < 0.5
        }
        default: {
          return structuredClone(pick(r, POOL))
        }
      }
    }
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, p] of t.props as Map<string, TAtscriptAnnotatedType>) {
        if (p.optional && (depth > 3 || r() < 0.3)) {
          continue
        }
        out[k] = gen(p, r, depth + 1)
      }
      return out
    }
    case 'array': {
      return depth > 3
        ? []
        : Array.from({ length: Math.floor(r() * 3) }, () => gen(t.of, r, depth + 1))
    }
    case 'tuple': {
      return t.items.map((i: TAtscriptAnnotatedType) => gen(i, r, depth + 1))
    }
    case 'union': {
      return gen(pick(r, t.items), r, depth + 0.5)
    }
    case 'intersection': {
      return (t.items as TAtscriptAnnotatedType[])
        .map(i => gen(i, r, depth + 0.5))
        .reduce((a, b) => mergeValues(a, b))
    }
    default: {
      return undefined
    }
  }
}

/** Replaces / deletes / adds a random node of a value. */
function mutate(value: any, r: () => number): any {
  if (!isObject(value) || r() < 0.15) {
    return structuredClone(pick(r, POOL))
  }
  const keys = Object.keys(value)
  if (keys.length === 0 || r() < 0.15) {
    value[pick(r, ['a', 'b', 'c', 'zz'])] = structuredClone(pick(r, POOL))
    return value
  }
  const k = pick(r, keys)
  if (r() < 0.2) {
    delete value[k]
  } else {
    value[k] = mutate(value[k], r)
  }
  return value
}

/** Generated (from either type), and mutated, values. */
function values(defs: TAtscriptAnnotatedType[], seed: number, n: number) {
  const r = rng(seed)
  const out: unknown[] = []
  for (let i = 0; i < n; i++) {
    let v = gen(pick(r, defs), r)
    for (let j = r() < 0.5 ? 0 : 1 + Math.floor(r() * 2); j > 0; j--) {
      v = mutate(v, r)
    }
    out.push(v)
  }
  return out
}

// ── regressions ─────────────────────────────────────────────────────────────

const fOf = (def: TAtscriptAnnotatedType) =>
  (def.type as TAtscriptTypeObject).props.get('f') as TAtscriptAnnotatedType

const wrap = (f: unknown) => ({ w: 'x', f })

const string = (optional = false) => ({ ...$().designType('string').$type, optional })

describe('runtime intersections with union members', () => {
  const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i + 1}`, 's']))

  /** The members of `T<name>.f`, as types of their own (see `shapes.as`). */
  const MEMBERS: Record<string, string[]> = {
    '': ['Big', 'GN'],
    '59': ['Wide', 'E59a', 'E59b'],
    '250': ['E250a', 'E250b', 'E250c'],
  }

  /** `{ w: string, f: <the members of T<name>.f, a runtime intersection> }`. */
  function runtimeOf(name: string) {
    const f = $('intersection')
    for (const member of MEMBERS[name]) {
      f.item($().ref(shapes[member]).$type)
    }
    return $('object').prop('w', string()).prop('f', f.$type).$type
  }

  /**
   * `t`: a runtime intersection with a union member; `u`: the same type merged (`U<name>.f`, in
   * place of `f`). `T<name>.f`, merged as a merge state, agrees with both.
   */
  function pair(name: string) {
    const t = runtimeOf(name)
    const state = shapes[`T${name}`]
    const merged = fOf(shapes[`U${name}`])
    expect(fOf(state).type.kind).not.toBe('intersection')
    expect(merged.type.kind).not.toBe('intersection')
    expect(boundCheck(state)).not.toBeNull()
    const u = $('object').prop('w', $().designType('string').$type).prop('f', merged).$type
    return { t, u, state }
  }

  /**
   * `f` values: `T<name>` (and its `f` alone) and the merged type agree, in every engine, on
   * these (`expected`: their results) and generated ones.
   */
  function check(name: string, fs: unknown[], expected: boolean[]) {
    const { t, u, state } = pair(name)
    const whole = { runtime: t, merged: u }
    const alone = { runtime: fOf(t), merged: fOf(u) }
    expect(fs.map(f => sameAsMerged(whole, wrap(f), IGNORE))).toEqual(expected)
    const all = [...fs, ...values([fOf(u), fOf(t)], name.length + 1, 150)]
    for (const compiled of [false, true]) {
      if (compiled) {
        compileType(fOf(t))
        compileType(u)
        expect(boundCheck(fOf(t))).not.toBeNull()
      }
      for (const opts of OPTION_SETS) {
        for (const f of all) {
          sameAsMerged(whole, wrap(f), opts)
          sameAsMerged(alone, f, opts)
          sameAsMerged({ runtime: state, merged: u }, wrap(f), opts)
        }
      }
    }
  }

  it('a union member: the intersections of its branches with the other members', () => {
    check(
      '',
      [big, { ...big, g: true }, { ...big, g: 1 }, { ...big, h: true }, 1, { g: true }],
      [true, true, false, true, false, false]
    )
    const value = { w: 'x', f: { ...big, g: true, h: 1 } }
    const v = new Validator(shapes.T, { unknownProps: 'strip' })
    expect(v.validate(value, true)).toBe(true)
    expect(value.f).toEqual({ ...big, g: true })
  })

  it('branches and siblings declaring the same props, with union types', () => {
    // (merged, `d` — a union of objects in a member, an object in another — has no slot the
    // merge rule matches: `never` there, reported; the runtime intersection validates as it did)
    const { t, u, state } = pair('59')
    expect(hasNode(fOf(u), d => d.kind === '' && d.designType === 'never')).toBe(true)
    expect(hasNode(fOf(state), d => d.kind === '' && d.designType === 'never')).toBe(true)
    const fs = [
      { e: {}, d: {} },
      { e: {}, d: { a: 'x', b: 'y' } },
      { e: {}, d: 'x' },
      { e: 'x', d: {} },
    ]
    for (const opts of OPTION_SETS) {
      for (const f of fs) {
        engines(t, opts, wrap(f))
        engines(u, opts, wrap(f))
        sameAsMerged({ runtime: state, merged: u }, wrap(f), opts)
      }
    }
    // (each member on its own: a key only another member declares is unknown to it)
    expect(fs.map(f => engines(t, {}, wrap(f)).result)).toEqual([false, false, false, false])
    expect(fs.map(f => engines(u, {}, wrap(f)).result)).toEqual([false, false, false, false])
  })

  it('union branches that are intersections or arrays', () => {
    check(
      '250',
      [
        { e: {}, g: 'x' },
        { e: {}, g: 'x', h: 1 },
        { g: 'x', p1: 'y' },
        { e: {}, g: 'x', q: 1 },
        { e: {} },
        [{ a: 'x' }],
      ],
      [true, true, true, true, false, false]
    )
  })

  it('a prop several members declare, one with a union type', () => {
    // (an intersection of objects a merge does not inline is a merge state, merged by the rule of
    // every merge: `d`, a union of objects and an object, is `never` there as in the merged type)
    const t = fOf(shapes.TShared)
    const u = fOf(shapes.UShared)
    expect(t.type.kind).toBe('object')
    for (const f of [t, u]) {
      expect((f.type as any).props.get('d').type).toMatchObject({ designType: 'never' })
    }
    for (const f of [{ d: {} }, { d: { a: 'x', b: 'y' } }, { d: { b: 'y', c: 1 } }, {}]) {
      for (const opts of OPTION_SETS) {
        sameAsMerged({ runtime: t, merged: u }, f, opts)
      }
    }
  })
})

// ── merged vs runtime intersections, generated ─────────────────────────────

/**
 * A random type over a few prop names (so members share props), with unions (see `richSource`
 * for literals, unions of unions, arrays, tuples and repeated members).
 */
function typeSource(r: () => number, depth: number, branch = false): string {
  const x = r()
  if (depth > 1 || x < 0.35) {
    return pick(r, ['string', 'number', 'boolean'])
  }
  if (x < 0.75 || branch) {
    return objectSource(r, depth + 1)
  }
  const n = 2 + Math.floor(r() * 2)
  return `(${Array.from({ length: n }, () => typeSource(r, depth + 1, true)).join(' | ')})`
}

function objectSource(r: () => number, depth: number): string {
  const keys = ['a', 'b', 'c', 'd'].filter(() => r() < 0.5)
  if (keys.length === 0) {
    keys.push(pick(r, ['a', 'b']))
  }
  return `{ ${keys.map(k => `${k}${r() < 0.4 ? '?' : ''}: ${typeSource(r, depth)}`).join(', ')} }`
}

function memberSource(r: () => number): string {
  if (r() < 0.55) {
    return objectSource(r, 0)
  }
  const n = 2 + Math.floor(r() * 2)
  const branch = () => (r() < 0.8 ? objectSource(r, 0) : pick(r, ['string', 'number']))
  return `(${Array.from({ length: n }, branch).join(' | ')})`
}

/** Whether a node of `def`'s tree passes `test`. */
function hasNode(
  def: TAtscriptAnnotatedType,
  test: (type: any) => boolean,
  seen = new Set<object>()
): boolean {
  const t = def.type as any
  if (seen.has(t)) {
    return false
  }
  seen.add(t)
  if (test(t)) {
    return true
  }
  switch (t.kind) {
    case 'object': {
      return [...(t.props as Map<string, TAtscriptAnnotatedType>).values()].some(p =>
        hasNode(p, test, seen)
      )
    }
    case 'array': {
      return hasNode(t.of, test, seen)
    }
    case 'union':
    case 'intersection':
    case 'tuple': {
      return t.items.some((i: TAtscriptAnnotatedType) => hasNode(i, test, seen))
    }
    default: {
      return false
    }
  }
}

/**
 * The generated cases written to several modules of at most `size` cases each (each with
 * `header`), built and loaded: their exports, and their `unmergeable` declarations. (MODEL §6:
 * more than 200 hidden merge classes in one module is a compile error — split with named types,
 * here with modules.)
 */
async function loadCases(
  dir: string,
  header: string[],
  perCase: string[][],
  size = 30
): Promise<{ cases: Record<string, TAtscriptAnnotatedType>; never: Set<string> }> {
  const files: string[] = []
  for (let k = 0; k * size < perCase.length; k++) {
    const file = `cases${k}.as`
    files.push(file)
    writeFileSync(
      path.join(dir, file),
      [...header, ...perCase.slice(k * size, (k + 1) * size).flat()].join('\n')
    )
  }
  await prepareFixtures({ rootDir: dir, formats: ['js'] })
  const cases: Record<string, TAtscriptAnnotatedType> = {}
  const never = new Set<string>()
  for (const file of files) {
    Object.assign(cases, await import(path.join(dir, `${file}.js`)))
    for (const name of await unmergeable(dir, file)) {
      never.add(name)
    }
  }
  return { cases, never }
}

/**
 * The declarations of `dir`/`file` whose merges the merge rule cannot match member by member
 * (union props of objects, tuples, arrays of arrays: reported, they resolve to `never` — not the
 * runtime intersection of the members).
 */
async function unmergeable(dir: string, file: string): Promise<Set<string>> {
  const repo = await build({ rootDir: dir, entries: [file], plugins: [tsPlugin()] })
  const out = new Set<string>()
  for (const m of [...(await repo.diagnostics()).values()].flat()) {
    const found = /of (unions|tuples|arrays)[^"]* cannot be merged (?:at|in) "(\w+)/.exec(m.message)
    if (found) {
      out.add(found[2])
    }
  }
  return out
}

describe('runtime intersections accept what the merged type does', () => {
  const CASES = 90
  let dir: string
  let cases: Record<string, TAtscriptAnnotatedType>

  beforeAll(async () => {
    const r = rng(2026)
    const perCase: string[][] = []
    for (let i = 0; i < CASES; i++) {
      const lines: string[] = []
      const members = Array.from({ length: 2 + (i % 3 === 2 ? 1 : 0) }, () => memberSource(r))
      members.forEach((m, j) => lines.push(`export type M${i}_${j} = ${m}`))
      lines.push(`export interface R${i} {\n  f: ${members.join(' & ')}\n}`)
      perCase.push(lines)
    }
    dir = mkdtempSync(path.join(tmpdir(), 'atscript-intersections-'))
    ;({ cases, never } = await loadCases(dir, [], perCase))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  let never: Set<string>

  it('on generated and mutated values, in every engine', { timeout: 30_000 }, () => {
    let checked = 0
    let distributed = 0
    let compared = 0
    let accepted = 0
    for (let i = 0; i < CASES; i++) {
      const merged = cases[`R${i}`]
      const members: TAtscriptAnnotatedType[] = []
      for (let j = 0; cases[`M${i}_${j}`]; j++) {
        members.push(cases[`M${i}_${j}`])
      }
      if (never.has(`R${i}`)) {
        // (a merge the rule cannot match: `never` there, see `unmergeable`)
        expect(hasNode(merged, t => t.kind === '' && t.designType === 'never')).toBe(true)
        continue
      }
      if (hasNode(merged, t => t.kind === 'intersection')) {
        // No reference.
        continue
      }
      checked++
      distributed += members.some(m => m.type.kind === 'union') ? 1 : 0
      const h = $('intersection')
      for (const member of members) {
        h.item($().ref(member).$type)
      }
      const runtime = $('object').prop('f', h.$type).$type
      const pair = { runtime, merged, label: `R${i}` }
      const vals = values([merged, runtime], i, 60)
      for (const compiled of [false, true]) {
        if (compiled) {
          compileType(runtime)
          compileType(merged)
          expect(boundCheck(runtime)).not.toBeNull()
        }
        for (const value of vals) {
          for (const opts of OPTION_SETS) {
            // (counted with unknown keys ignored: compared with the merged type there)
            const counted = opts.unknownProps === 'ignore' ? 1 : 0
            compared += counted
            accepted += sameAsMerged(pair, value, opts) ? counted : 0
          }
        }
      }
    }
    // Enough cases merged, with union members, and values both accepted and rejected.
    expect(checked).toBeGreaterThan(CASES / 2)
    expect(distributed).toBeGreaterThan(CASES / 3)
    expect(accepted).toBeGreaterThan(compared / 10)
    expect(accepted).toBeLessThan(compared * 0.9)
  })
})

// ── merged vs runtime intersections: literals, unions of unions, arrays, repeats ──

/**
 * Leaves: primitives, literals (`'x' & string` is `'x'`), primitive extensions (`string &
 * string.email` is `string.email`, `string.email & 'x'` checks both).
 */
const RICH_LEAVES = [
  'string',
  'number',
  'boolean',
  'null',
  "'x'",
  "'y'",
  '1',
  '2',
  'string.email',
  'number.int',
]
const NAMED = ['N0', 'N1', 'N2']

/** A literal as an array element or a union branch: parenthesized (`('x')[]`). */
const wrapSource = (t: string) =>
  (/[&|]/.test(t) && !t.startsWith('(')) || /^['0-9]/.test(t) ? `(${t})` : t

/**
 * A random type: leaves, references to named types (`N0`…), objects, unions (whose branches
 * may be unions), arrays, tuples, intersections of named types.
 */
function richSource(r: () => number, depth: number, branch = false): string {
  const x = r()
  if (depth > 2 || x < 0.3) {
    return r() < 0.15 && depth > 0 ? pick(r, NAMED) : pick(r, RICH_LEAVES)
  }
  if (x < 0.62 || (branch && x < 0.75)) {
    return richObject(r, depth + 1)
  }
  if (x < 0.82) {
    const n = 2 + Math.floor(r() * 2)
    return `(${Array.from({ length: n }, () => richSource(r, depth + 1, true)).join(' | ')})`
  }
  if (x < 0.87) {
    return `${wrapSource(richSource(r, depth + 1))}[]`
  }
  if (x < 0.9) {
    return `[${richSource(r, depth + 1)}, ${richSource(r, depth + 1)}]`
  }
  return `(${pick(r, NAMED)} & ${pick(r, NAMED)})`
}

function richObject(r: () => number, depth: number): string {
  const keys = ['a', 'b', 'c', 'd'].filter(() => r() < 0.45)
  if (keys.length === 0) {
    keys.push(pick(r, ['a', 'b']))
  }
  return `{ ${keys.map(k => `${k}${r() < 0.4 ? '?' : ''}: ${richSource(r, depth)}`).join(', ')} }`
}

function richMember(r: () => number): string {
  const x = r()
  if (x < 0.5) {
    return richObject(r, 0)
  }
  if (x < 0.85) {
    const n = 2 + Math.floor(r() * 2)
    const branch = () => (r() < 0.75 ? richObject(r, 0) : richSource(r, 1, true))
    return `(${Array.from({ length: n }, branch).join(' | ')})`
  }
  return r() < 0.7
    ? `${wrapSource(richObject(r, 1))}[]`
    : `[${richObject(r, 1)}, ${richSource(r, 1)}]`
}

describe('merged intersections of literals, unions of unions, arrays and repeated members', () => {
  const CASES = 80
  let dir: string
  let cases: Record<string, TAtscriptAnnotatedType>
  const operands: number[][] = []

  beforeAll(async () => {
    const r = rng(1397)
    const lines = NAMED.map(n => `export interface ${n} ${richObject(r, 1)}`)
    for (let i = 0; i < CASES; i++) {
      const count = 2 + (r() < 0.35 ? 1 : 0)
      Array.from({ length: count }, () => richMember(r)).forEach((m, j) =>
        lines.push(`export type M${i}_${j} = ${m}`)
      )
      // Sometimes a member repeated (`M0 & M1 & M0` is `M0 & M1`).
      const idx = Array.from({ length: count }, (_, j) => j)
      if (r() < 0.3) {
        idx.push(Math.floor(r() * count))
      }
      operands.push(idx)
      lines.push(`export interface R${i} {\n  f: ${idx.map(j => `M${i}_${j}`).join(' & ')}\n}`)
    }
    dir = mkdtempSync(path.join(tmpdir(), 'atscript-intersections-rich-'))
    const header = lines.slice(0, NAMED.length)
    const perCase: string[][] = []
    for (const line of lines.slice(NAMED.length)) {
      if (/^export type M\d+_0 /.test(line)) {
        perCase.push([])
      }
      perCase.at(-1)!.push(line)
    }
    ;({ cases, never } = await loadCases(dir, header, perCase))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  let never: Set<string>

  it('accept / reject what a runtime intersection of the members does', { timeout: 60_000 }, () => {
    let compared = 0
    let accepted = 0
    for (let i = 0; i < CASES; i++) {
      const merged = cases[`R${i}`]
      if (never.has(`R${i}`)) {
        // (a merge the rule cannot match: `never` there, see `unmergeable`)
        expect(hasNode(merged, t => t.kind === '' && t.designType === 'never')).toBe(true)
        continue
      }
      const h = $('intersection')
      for (const j of operands[i]) {
        h.item($().ref(cases[`M${i}_${j}`]).$type)
      }
      const runtime = $('object').prop('f', h.$type).$type
      const pair = { runtime, merged, label: `R${i}` }
      const vals = values([merged, runtime], i, 50)
      for (const compiled of [false, true]) {
        if (compiled) {
          compileType(runtime)
          compileType(merged)
        }
        for (const value of vals) {
          for (const opts of OPTION_SETS) {
            // (counted with unknown keys ignored: compared with the merged type there)
            const counted = opts.unknownProps === 'ignore' ? 1 : 0
            compared += counted
            accepted += sameAsMerged(pair, value, opts) ? counted : 0
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(compared / 20)
    expect(accepted).toBeLessThan(compared * 0.9)
  })
})

// ── runtime intersections of arrays ──────────────────────────────────────────

const s = () => $().designType('string').$type

function obj(props: Record<string, TAtscriptAnnotatedType>) {
  const h = $('object')
  for (const [k, v] of Object.entries(props)) {
    h.prop(k, v)
  }
  return h.$type
}

const arr = (of: TAtscriptAnnotatedType) => $('array').of(of).$type

/** A runtime type of `kind` with `items`. */
function itemsOf(kind: 'union' | 'intersection' | 'tuple', items: TAtscriptAnnotatedType[]) {
  const h = $(kind)
  for (const item of items) {
    h.item(item)
  }
  return h.$type
}

const and = (...items: TAtscriptAnnotatedType[]) => itemsOf('intersection', items)
const or = (...items: TAtscriptAnnotatedType[]) => itemsOf('union', items)
const tuple = (...items: TAtscriptAnnotatedType[]) => itemsOf('tuple', items)

describe('runtime intersections of arrays', () => {
  const A = obj({ a: s() })
  const B = obj({ b: s() })
  const AB = obj({ a: s(), b: s() })

  /** `runtime` and `merged` agree with each other in every engine, compiled or not. */
  function agree(runtime: TAtscriptAnnotatedType, merged: TAtscriptAnnotatedType, vals: unknown[]) {
    const out: boolean[] = []
    for (const compiled of [false, true]) {
      if (compiled) {
        compileType(runtime)
        compileType(merged)
      }
      for (const value of vals) {
        for (const opts of OPTION_SETS) {
          const ok = sameAsMerged({ runtime, merged }, value, opts)
          if (!compiled && opts.unknownProps === 'ignore') {
            out.push(ok)
          }
        }
      }
    }
    return out
  }

  it('`A[] & B[]` accepts what `(A & B)[]` does', () => {
    const items = [[{ a: 'x', b: 'y' }], [{ a: 'x' }], [{ a: 'x', b: 'y', c: 1 }], [], {}, [1]]
    const expected = [true, false, true, true, false, false]
    expect(agree(and(arr(A), arr(B)), arr(AB), items)).toEqual(expected)
    expect(
      agree(
        obj({ x: and(arr(A), arr(B)) }),
        obj({ x: arr(AB) }),
        items.map(x => ({ x }))
      )
    ).toEqual(expected)
    // A prop several members declare with array types.
    expect(
      agree(
        and(obj({ x: arr(A) }), obj({ x: arr(B) })),
        obj({ x: arr(AB) }),
        items.map(x => ({ x }))
      )
    ).toEqual(expected)
  })

  it('with a union member, and tuples', () => {
    const nullable = { ...or(arr(B), $().designType('null').$type) }
    expect(
      agree(obj({ x: and(arr(A), nullable) }), obj({ x: arr(AB) }), [
        { x: [{ a: 'x', b: 'y' }] },
        { x: [{ a: 'x' }] },
        { x: null },
        { x: [{ a: 'x', b: 'y', c: 1 }] },
      ])
    ).toEqual([true, false, false, true])
    expect(
      agree(and(tuple(A, s()), arr(B)), tuple(AB, and(s(), B)), [
        [{ a: 'x', b: 'y' }, 'z'],
        [{ a: 'x', b: 'y' }],
        [{ a: 'x' }, 'z'],
      ])
    ).toEqual([false, false, false])
    expect(
      agree(and(tuple(A, s()), tuple(B, s())), tuple(AB, s()), [
        [{ a: 'x', b: 'y' }, 'z'],
        [{ a: 'x', b: 'y' }],
        [{ a: 'x', c: 1 }, 'z'],
      ])
    ).toEqual([true, false, false])
  })
})
