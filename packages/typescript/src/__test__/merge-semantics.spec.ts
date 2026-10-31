import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { compileType } from '../../test/compiled-engine'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { prepareFixtures, WalkValidator } from '../test-utils'

// Intersections merge like TypeScript intersects them, and like the validator checks a runtime
// intersection of the same members: a literal narrows a primitive, an extension its base, a
// union's branches that are unions take part, a type repeated is the type once, parentheses do
// not change a type, and an optional prop passes `null`.

const SOURCE = `
export type L1 = { d: 'x' } & { d: string }
export type L2 = { d: string } & { d: 'x' }
export type L3 = { d: 'x' } & { d: 'y' }
export type L4 = { d: 'x' | number } & { d: string }
export type L5 = { d: 1 } & { d: 1.0 }
export type L6 = { d: '1' } & { d: 1 }
export type L7 = { d: 1 } & { d: number.int }
export type E = 'a' | 'b'
export type L8 = { p: E } & { p: 'a' }
export type L9 = { p: 'a' } & { p: 'a' }
export type L10 = { p: E } & { p: 'c' }
export type X1 = { d: string } & { d: string.email }
export type X2 = { d: string.email } & { d: string }
export type X3 = { d: string.email } & { d: string.uuid }
export type X4 = string.email & 'x' & 'y'
export type X5 = { a: ({ a: string.email } | null | string), c: 1 } & { a?: string.email }
export type SB = string | boolean
export type U1 = { d: (string | boolean) | number } & { d: string }
export type U2 = { d: ((string | boolean) | number) | null } & { d: (string | null) | boolean }
export type U3 = { d: SB | number } & { d: boolean }
export type V = { k: string } | { j: number }
export type D1 = { p: V & V }
export type D2 = { p: V } & { p: V }
export interface Y { y?: string }
export type D3 = { f: V & Y & V }
export type P1 = ({ a: string })[] & ({ b: string })[]
export type P2 = { x: ({ a: string }) } & { x: { b: string } }
export interface S0 { g?: string }
export type P3 = { f: ({ e: number } | ({ d?: string })) & S0 }
export type O1 = { a?: { x: string } } & { a: null }
export type O2 = { a?: { x: string } } & { a: { y: string } | null }
export type O3 = { a: string | null } & { a?: string }
`

let dir: string
let m: Record<string, TAtscriptAnnotatedType>

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-semantics-'))
  writeFileSync(path.join(dir, 'm.as'), SOURCE)
  await prepareFixtures({ rootDir: dir, formats: ['js'] })
  m = await import(path.join(dir, 'm.as.js'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** A type's tree, compact (`{d: "x"}`, `(a | b)`, `<a & b>` for a runtime intersection). */
function show(t: TAtscriptAnnotatedType, depth = 0): string {
  const ty = t.type as any
  const opt = t.optional ? '?' : ''
  if (t.id && depth > 0) {
    return t.id + opt
  }
  switch (ty.kind) {
    case '': {
      if (ty.value !== undefined) {
        return JSON.stringify(ty.value) + opt
      }
      const tags = [...(ty.tags ?? [])].filter((x: string) => x !== ty.designType)
      return [ty.designType, ...tags].join('.') + opt
    }
    case 'object': {
      const props = [...ty.props].map(
        ([k, v]: [string, TAtscriptAnnotatedType]) =>
          `${k}${v.optional ? '?' : ''}: ${show({ ...v, optional: false }, depth + 1)}`
      )
      return `{${props.join(', ')}}${opt}`
    }
    case 'array': {
      return `${show(ty.of, depth + 1)}[]${opt}`
    }
    case 'union': {
      return `(${ty.items.map((i: TAtscriptAnnotatedType) => show(i, depth + 1)).join(' | ')})${opt}`
    }
    case 'intersection': {
      return `<${ty.items.map((i: TAtscriptAnnotatedType) => show(i, depth + 1)).join(' & ')}>${opt}`
    }
    default: {
      return '?'
    }
  }
}

/** The walk, the interpreted and the compiled pre-check agree; returns the walk's result. */
function validate(
  t: TAtscriptAnnotatedType,
  value: unknown,
  opts: Partial<TValidatorOptions> = {}
) {
  const result = new WalkValidator(t, opts).validate(structuredClone(value), true)
  expect(new Validator({ ...t }, opts).validate(structuredClone(value), true)).toBe(result)
  compileType(t)
  expect(new Validator(t, opts).validate(structuredClone(value), true)).toBe(result)
  return result
}

function object(props: Record<string, TAtscriptAnnotatedType>) {
  const h = $('object')
  for (const [k, v] of Object.entries(props)) {
    h.prop(k, v)
  }
  return h.$type
}

describe('merged intersections', () => {
  it('a literal narrows a primitive of its type; other literals are never', () => {
    expect(show(m.L1)).toBe('{d: "x"}')
    expect(show(m.L2)).toBe('{d: "x"}')
    expect(show(m.L3)).toBe('{d: never}')
    expect(show(m.L4)).toBe('{d: "x"}')
    expect(show(m.L5)).toBe('{d: 1}')
    expect(show(m.L6)).toBe('{d: never}')
    // A literal and an extension: both checked.
    expect(show(m.L7)).toBe('{d: <1 & number.int>}')
    expect(show(m.L8)).toBe('{p: "a"}')
    expect(show(m.L9)).toBe('{p: "a"}')
    expect(show(m.L10)).toBe('{p: never}')
    expect(validate(m.L1, { d: 'x' })).toBe(true)
    expect(validate(m.L1, { d: 'y' })).toBe(false)
    expect(validate(m.L8, { p: 'a' })).toBe(true)
    expect(validate(m.L8, { p: 'b' })).toBe(false)
  })

  it('an extension narrows its base, in any order; two extensions are both checked', () => {
    expect(show(m.X1)).toBe('{d: string.email}')
    expect(show(m.X2)).toBe('{d: string.email}')
    for (const t of [m.X1, m.X2]) {
      expect(validate(t, { d: 'a@b.co' })).toBe(true)
      expect(validate(t, { d: 'x' })).toBe(false)
    }
    expect(show(m.X3)).toBe('{d: <string.email & string.uuid>}')
    expect(validate(m.X3, { d: 'a@b.co' })).toBe(false)
    expect(show(m.X4)).toBe('never')
    // A union branch merged into an extension keeps its constraints.
    expect(show(m.X5)).toBe('{a: (null | string.email), c: 1}')
    expect(validate(m.X5, { a: 'x', c: 1 })).toBe(false)
    expect(validate(m.X5, { a: 'a@b.co', c: 1 })).toBe(true)
    expect(validate(m.X5, { a: null, c: 1 })).toBe(true)
  })

  it('union branches that are unions take part', () => {
    expect(show(m.U1)).toBe('{d: string}')
    expect(show(m.U2)).toBe('{d: (string | boolean | null)}')
    expect(show(m.U3)).toBe('{d: boolean}')
    expect(validate(m.U2, { d: true })).toBe(true)
    expect(validate(m.U2, { d: 1 })).toBe(false)
  })

  it('a type repeated is the type once', () => {
    expect(show(m.D1)).toBe('{p: V}')
    expect(show(m.D2)).toBe('{p: V}')
    // `V & V` is `V`: no branch knows both `k` and `j`.
    for (const t of [m.D1, m.D2]) {
      expect(validate(t, { p: { k: 'x' } })).toBe(true)
      expect(validate(t, { p: { k: 'x', j: 1 } })).toBe(false)
    }
    const f = (m.D3.type as any).props.get('f') as TAtscriptAnnotatedType
    // (placed where it last occurs, like its priority: `V & Y & V` is `Y & V`)
    expect(show(f)).toBe('({y?: string, k: string} | {y?: string, j: number})')
  })

  it('parentheses do not change a type', () => {
    expect(show(m.P1)).toBe('{a: string, b: string}[]')
    expect(show(m.P2)).toBe('{x: {a: string, b: string}}')
    const f = (m.P3.type as any).props.get('f') as TAtscriptAnnotatedType
    expect(show(f)).toBe('({e: number, g?: string} | {d?: string, g?: string})')
    expect(validate(m.P3, { f: { d: 'x' } })).toBe(true)
  })

  it('an optional prop passes `null`: with a required one that may be `null`', () => {
    expect(show(m.O1)).toBe('{a: null}')
    expect(show(m.O2)).toBe('{a: ({x: string, y: string} | null)}')
    expect(show(m.O3)).toBe('{a: (string | null)}')
    const x = { ...object({ x: $().designType('string').$type }), optional: true }
    const runtime = $('intersection')
      .item(object({ a: x }))
      .item(object({ a: $().designType('null').$type })).$type
    for (const value of [{ a: null }, { a: { x: 's' } }, {}]) {
      expect(validate(m.O1, value)).toBe(validate(runtime, value))
    }
  })
})

// Every pair of scalar operands, in both orders, merged at build time (as a prop and as a type)
// validates like the runtime intersection of the same operands: a merge never drops a constraint
// — of an annotated alias, a prop reached by a chain reference, an extension, `decimal`'s format
// — and does not depend on the operand order.
describe('merged scalars validate like their runtime intersection', () => {
  const OPERANDS = [
    'string',
    'S3',
    'L4',
    'S3b',
    'A.x',
    'A.y',
    'A.e',
    "'x'",
    "'abcd'",
    'LX',
    'string.email',
    'string.uuid',
    'decimal',
    'number',
    'N5',
    'number.int',
    '1',
    '6',
    'boolean',
    'null',
  ]
  const PRELUDE = [
    '@expect.minLength 3',
    'export type S3 = string',
    '@expect.minLength 3',
    'export type S3b = string',
    '@expect.maxLength 4',
    'export type L4 = string',
    '@expect.min 5',
    'export type N5 = number',
    "@meta.label 'x'",
    "export type LX = 'x'",
    'export interface A {',
    '  @expect.minLength 3',
    '  x: string',
    '  @expect.maxLength 4',
    '  y: string',
    '  @expect.maxLength 8',
    '  e: string.email',
    '}',
  ]
  const VALUES: unknown[] = [
    '',
    'x',
    'ab',
    'abc',
    'abcd',
    'abcde',
    'a@b.co',
    'ab@cd.efgh',
    '1.5',
    '123e4567-e89b-12d3-a456-426614174000',
    1,
    2.5,
    5,
    6,
    true,
    null,
  ]
  let pairs: Record<string, TAtscriptAnnotatedType>
  let pdir: string

  beforeAll(async () => {
    pdir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-pairs-'))
    const lines = [...PRELUDE]
    OPERANDS.forEach((a, i) => {
      lines.push(`export type V${i} = ${a}`, `export interface P${i} { p: ${a} }`)
      OPERANDS.forEach((b, j) => {
        lines.push(
          `export type T${i}_${j} = ${a} & ${b}`,
          `export type M${i}_${j} = { p: ${a} } & { p: ${b} }`
        )
      })
    })
    writeFileSync(path.join(pdir, 'pairs.as'), lines.join('\n'))
    await prepareFixtures({ rootDir: pdir, formats: ['js'] })
    pairs = await import(path.join(pdir, 'pairs.as.js'))
  })

  afterAll(() => {
    rmSync(pdir, { recursive: true, force: true })
  })

  it('every pair, in both orders, as a type and as a prop', () => {
    const mismatches: string[] = []
    let checked = 0
    OPERANDS.forEach((a, i) => {
      OPERANDS.forEach((b, j) => {
        const types = $('intersection').item(pairs[`V${i}`]).item(pairs[`V${j}`]).$type
        const props = $('intersection').item(pairs[`P${i}`]).item(pairs[`P${j}`]).$type
        for (const value of VALUES) {
          for (const [merged, runtime, v] of [
            [pairs[`T${i}_${j}`], types, value],
            [pairs[`M${i}_${j}`], props, { p: value }],
          ] as const) {
            checked++
            const expected = validate(runtime, v)
            if (validate(merged, v) !== expected) {
              mismatches.push(`${a} & ${b} ${JSON.stringify(v)}: runtime ${expected}`)
            }
          }
        }
      })
    })
    expect(mismatches).toEqual([])
    expect(checked).toBe(OPERANDS.length ** 2 * VALUES.length * 2)
  })

  it('an annotated operand is kept, whichever side it is on', () => {
    const i = (o: string) => OPERANDS.indexOf(o)
    expect(show(pairs[`M${i('S3')}_${i('string')}`])).toBe('{p: S3}')
    expect(show(pairs[`M${i('string')}_${i('S3')}`])).toBe('{p: S3}')
    expect(show(pairs[`M${i("'x'")}_${i('S3')}`])).toBe('{p: <"x" & S3>}')
    expect(show(pairs[`M${i('S3')}_${i('L4')}`])).toBe('{p: <S3 & L4>}')
    expect(show(pairs[`M${i('S3')}_${i('S3')}`])).toBe('{p: S3}')
    expect(show(pairs[`M${i("'x'")}_${i('decimal')}`])).toBe('{p: <"x" & decimal>}')
    expect(show(pairs[`M${i('string')}_${i('string.email')}`])).toBe('{p: string.email}')
    expect(show(pairs[`M${i('string.email')}_${i('string')}`])).toBe('{p: string.email}')
  })
})

// An inline intersection merged into an extension (`number.int & number` is `number.int`) keeps
// the extension's built-in checks wherever it is written (it was emitted as the bare type).
describe('an intersection merged into an extension keeps its checks', () => {
  let x: Record<string, TAtscriptAnnotatedType>
  let xdir: string

  beforeAll(async () => {
    xdir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-ext-'))
    writeFileSync(
      path.join(xdir, 'x.as'),
      [
        'export interface N1 { p: number & number.int }',
        'export interface N2 { p: number.int & number }',
        'export type N4 = number.int & number',
        'export interface W { p: string & string.email }',
        'export interface W2 { p: string.email & string }',
        'export type EM = string & string.email',
        'export type EM2 = EM',
        'export interface Uses { n: EM | null; a: EM[]; t: [EM]; s: EM; s2: EM2 }',
        'export interface Inline { n: (string.email & string) | null; a: (number.int & number)[]; t: [number.int & number] }',
      ].join('\n')
    )
    await prepareFixtures({ rootDir: xdir, formats: ['js'] })
    x = await import(path.join(xdir, 'x.as.js'))
  })

  afterAll(() => {
    rmSync(xdir, { recursive: true, force: true })
  })

  it('as a prop, a type, an alias of it, and through references', () => {
    for (const t of [x.N1, x.N2]) {
      expect([validate(t, { p: 1 }), validate(t, { p: 1.5 })]).toEqual([true, false])
    }
    expect([validate(x.N4, 2), validate(x.N4, 1.5)]).toEqual([true, false])
    for (const t of [x.W, x.W2]) {
      expect([validate(t, { p: 'a@b.co' }), validate(t, { p: 'bad' })]).toEqual([true, false])
    }
    for (const t of [x.EM, x.EM2]) {
      expect([validate(t, 'a@b.co'), validate(t, 'bad')]).toEqual([true, false])
    }
    const ok = { n: null, a: ['a@b.co'], t: ['a@b.co'], s: 'a@b.co', s2: 'a@b.co' }
    expect(validate(x.Uses, ok)).toBe(true)
    for (const [k, v] of [
      ['n', 'bad'],
      ['a', ['bad']],
      ['t', ['bad']],
      ['s', 'bad'],
      ['s2', 'bad'],
    ]) {
      expect([k, validate(x.Uses, { ...ok, [k as string]: v })]).toEqual([k, false])
    }
    const inline = { n: 'a@b.co', a: [1], t: [2] }
    expect(validate(x.Inline, inline)).toBe(true)
    for (const [k, v] of [
      ['n', 'bad'],
      ['a', [1.5]],
      ['t', [1.5]],
    ]) {
      expect([k, validate(x.Inline, { ...inline, [k as string]: v })]).toEqual([k, false])
    }
  })
})
