import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'
import { schemaDisagreements, valuesFor } from './json-schema-oracle'

/*
 * JSON schemas (runtime and bundled, compiled by ajv) accept exactly what the validator accepts
 * (`unknownProps: 'ignore'`), for every validation annotation × every kind of type it can
 * annotate (primitives, literals, `decimal`, primitive extensions, arrays, tuples, unions —
 * nullable ones and unions of literals —, objects) × where it is written (a type, a prop, an
 * optional prop, a union, an array element, an alias of an annotated type). The other generators
 * (merge pairs, declaration order, alias equivalence, pattern flags, dense schemas) check their
 * types the same way.
 */

const ANNOTATIONS = [
  '',
  '@meta.required',
  '@expect.minLength 2',
  '@expect.maxLength 3',
  '@expect.minLength 2\n@expect.maxLength 3',
  "@expect.pattern '^a'",
  "@expect.pattern '^a'\n@expect.pattern 'c$', 'i'",
  '@expect.int',
  '@expect.min 1',
  '@expect.max 2',
  '@expect.exclusiveMin 1',
  '@expect.exclusiveMax 2',
  '@expect.min 0\n@expect.int',
  '@expect.array.uniqueItems',
]

const KINDS = [
  'string',
  'number',
  'boolean',
  'decimal',
  "'ab'",
  '2',
  'true',
  'string.email',
  'number.int',
  'string[]',
  'number[]',
  '{ a: string }[]',
  '[string, number]',
  'string | null',
  'number | null',
  'string | number',
  "'ab' | 'abc'",
  'string[] | null',
  '{ a?: string }',
  'never',
  'Keyed[]',
  'decimal[]',
  'string.email | null',
  '(string | number)[]',
  '{ [/^k/]: number }',
  '{ a?: string, [/^a/]: number }',
  '{ "a.b"?: string, [/^a/i]: number, [/^z/]: boolean }',
  '{ [/^k/]: number, [/k$/]: string }',
  '{ [/^k/]: number, [/^k/]: string }',
  '{ a?: string } & { [/^k/]: number }',
  '{ [/^k/]: number } & { kx?: string }',
  '{ [/^k/]: number } & { [/x$/]: string }',
]

const FIXED: unknown[] = [
  null,
  true,
  false,
  '',
  ' ',
  'a',
  'ab',
  'abc',
  'abcd',
  'A C',
  '1.5',
  'x@y.co',
  0,
  1,
  1.5,
  2,
  3,
  -1,
  [],
  ['a'],
  ['a', 'a'],
  ['a', 'b', 'c', 'd'],
  [1, 1],
  [{ a: 'x' }, { a: 'x' }],
  [
    { a: 'x', b: 1 },
    { b: 1, a: 'x' },
  ],
  ['a', 1],
  ['a', 1, 2],
  {},
  { a: 'x' },
  { a: null },
  [{ id: 'a' }, { id: 'a', v: 1 }],
  [
    { id: 'a', v: 1 },
    { v: 1, id: 'a' },
  ],
  [{ id: 'a' }, { id: 'b' }],
  ['1.5', '1.50', '-2'],
  [1, '1'],
  { k: 1 },
  { k: 'x' },
  { kk: 1 },
  { kk: 'x' },
  { kx: true },
  { a: 'x', ab: 1 },
  { a: 1 },
  { 'A': 1, 'a.b': 'x', 'zz': false },
  { 'a.b': 1, 'Ab': 'x' },
]

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('JSON schemas of annotated types, checked by ajv', () => {
  it('every annotation × kind × position', { timeout: 300_000 }, async () => {
    const lines: string[] = [
      'export interface Keyed {\n  @expect.array.key\n  id: string\n  v?: number\n}',
    ]
    const types: string[] = ['Keyed']
    KINDS.forEach((kind, k) => {
      ANNOTATIONS.forEach((annotation, a) => {
        const ann = annotation ? `${annotation}\n` : ''
        const name = `K${k}A${a}`
        lines.push(
          `${ann}export type ${name} = ${kind}`,
          `export interface ${name}P {\n${ann.replaceAll(/^/gm, '  ').trimEnd()}\n  p: ${kind}\n}`,
          `export interface ${name}O {\n${ann.replaceAll(/^/gm, '  ').trimEnd()}\n  p?: ${kind}\n}`,
          `export interface ${name}R {\n  p?: ${name}\n  q: ${name} | null\n  r: ${name}[]\n}`
        )
        types.push(name, `${name}P`, `${name}O`, `${name}R`)
      })
    })
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-json-schema-ajv-'))
    dirs.push(dir)
    // (annotations a kind does not take are reported: those declarations are left out)
    writeFileSync(path.join(dir, 'a.as'), lines.join('\n'))
    const probe = await build({
      rootDir: dir,
      entries: ['a.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
    })
    const rejected = new Set(
      [...(await probe.diagnostics()).values()]
        .flat()
        .filter(m => m.severity === 1)
        .map(m => m.range.start.line)
    )
    const kept: string[] = []
    let line = 0
    const keptNames = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
      const count = lines[i].split('\n').length
      let bad = false
      for (let l = line; l < line + count; l++) {
        bad ||= rejected.has(l)
      }
      // (`…R` uses the type declared 3 lines above it)
      const name = types[i]
      const base = name.endsWith('R') ? name.slice(0, -1) : undefined
      if (!bad && (!base || keptNames.has(base))) {
        kept.push(lines[i])
        keptNames.add(name)
      }
      line += count
    }
    writeFileSync(path.join(dir, 'a.as'), kept.join('\n'))
    const repo = await build({
      rootDir: dir,
      entries: ['a.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
    })
    const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
    expect(errors.map(m => `${m.range.start.line}: ${m.message}`)).toEqual([])
    const [js] = await repo.generate({ format: 'js' })
    writeFileSync(path.join(dir, 'a.as.js'), js.content)
    const module = await import(path.join(dir, 'a.as.js'))
    const stats: { checks: number; allowed?: Record<string, number> } = { checks: 0 }
    const disagreements: string[] = []
    const wrap = (v: unknown) => ({ p: v, q: v, r: [v] })
    for (const name of keptNames) {
      const type = module[name]
      const fixed =
        name.endsWith('P') || name.endsWith('O')
          ? FIXED.map(v => ({ p: v }))
          : name.endsWith('R')
            ? FIXED.map(wrap)
            : FIXED
      disagreements.push(
        ...schemaDisagreements(name, type, valuesFor(type, fixed, 20, name.length), true, stats)
      )
    }
    expect(disagreements.slice(0, 30)).toEqual([])
    expect(keptNames.size).toBeGreaterThan(250)
    // (each deliberate difference shows up: the allow-list holds nothing more)
    expect(Object.keys(stats.allowed ?? {}).sort()).toEqual(
      [
        'key matching several pattern props',
        'key order of object items',
        'unique by key props',
      ].sort()
    )
    console.info(`[ajv] ${keptNames.size} types, ${stats.checks} checks`, stats.allowed)
  })
})
