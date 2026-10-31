import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import { defineAnnotatedType, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { WalkValidator } from '../test-utils'
import { schemaDisagreements, valuesFor } from './json-schema-oracle'

/*
 * Merge semantics, exhaustively over operand pairs: for every pair of operand kinds — a plain
 * primitive, a literal, a primitive extension, `decimal`, an annotated alias, a chain reference,
 * a union, an array, an object, a nullable type — in both orders, written as a type
 * (`type M = L & R`), a prop (`p: L & R`) and an optional prop (`p?: L & R`, which also passes
 * `undefined` and `null`), the intersection the compiler merges validates every value alike
 * in the three engines (the walk, the interpreted pre-check and compiled checks) and, ignoring
 * unknown keys, like the runtime intersection of the two operands and like "L accepts it and R
 * accepts it". (A runtime intersection checks each operand on its own, unknown keys included:
 * with `unknownProps: 'error'` / `'strip'` only its walk and pre-check are compared.)
 */

const OPERANDS = [
  'string',
  'number',
  "'a'",
  "'abc'",
  '1',
  'string.email',
  'number.int',
  'decimal',
  'S3',
  'Q.x',
  "'a' | 'abc'",
  'string | number',
  'string[]',
  'S3[]',
  '{ a: string }',
  '{ a?: S3 }',
  '{ a: number }',
  '{ b?: string }',
  'string | null',
  'S3 | null',
  '{ a?: string | null }',
  // `ATSCRIPT_LARGE_TESTS=1`: more kinds
  ...(process.env.ATSCRIPT_LARGE_TESTS
    ? [
        'boolean',
        '-2',
        'string.uuid',
        'number.int | null',
        '[string]',
        '[S3, number]',
        '{ a: S3 }[]',
        'Q',
        '{ a: { b?: S3 } }',
        '{ a: { c?: number } }',
        "('a' | 'abc')[]",
        'Q.x | number',
      ]
    : []),
]

const HELPERS = `@expect.minLength 3
export type S3 = string
export interface Q {
  @expect.maxLength 4
  x: string
}
`

const VALUES: unknown[] = [
  '',
  'a',
  'ab',
  'abc',
  'abcde',
  'x@y.co',
  'abc@d.io',
  '1.50',
  '12',
  0,
  1,
  1.5,
  -2,
  null,
  undefined,
  true,
  [],
  ['abc'],
  ['a'],
  ['abc', 'ab'],
  [1],
  {},
  { a: 'abc' },
  { a: 'a' },
  { a: 1 },
  { a: null },
  { a: 'abc', b: 'x' },
  { b: 'x' },
  { b: 1 },
  { a: 'abc', c: 1 },
  ...(process.env.ATSCRIPT_LARGE_TESTS
    ? [
        false,
        '123e4567-e89b-12d3-a456-426614174000',
        ['abc', 1],
        ['abc'],
        [{ a: 'abc' }, { a: 'a' }],
        ['a', 'abc'],
        { a: { b: 'abc', c: 1 } },
        { a: { b: 'a' } },
        { x: 'abcd' },
        { x: 'abcde' },
      ]
    : []),
]

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type TModule = Record<string, TAtscriptAnnotatedType>

async function generate(compileValidators: boolean): Promise<TModule> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-pairs-'))
  roots.push(dir)
  mkdirSync(dir, { recursive: true })
  const lines = [HELPERS]
  OPERANDS.forEach((operand, i) => {
    lines.push(`export type O${i} = ${operand}`)
    OPERANDS.forEach((other, j) => {
      lines.push(
        `export type M${i}_${j} = (${operand}) & (${other})`,
        `export interface P${i}_${j} {\n  p: (${operand}) & (${other})\n}`,
        `export interface Q${i}_${j} {\n  p?: (${operand}) & (${other})\n}`
      )
    })
  })
  writeFileSync(path.join(dir, 'pairs.as'), lines.join('\n'))
  const repo = await build({
    rootDir: dir,
    entries: ['pairs.as'],
    plugins: [tsPlugin({ compileValidators, jsonSchema: 'bundle' })],
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => `${m.range.start.line}: ${m.message}`)).toEqual([])
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, 'pairs.as.js'), file.content)
  }
  vi.resetModules()
  return import(path.join(dir, 'pairs.as.js'))
}

/** The runtime intersection of two types (a prop `p` of it, optional or not). */
function runtimeIntersection(l: TAtscriptAnnotatedType, r: TAtscriptAnnotatedType) {
  return defineAnnotatedType('intersection').item(l).item(r).$type
}

function propOf(type: TAtscriptAnnotatedType, optional: boolean) {
  const prop = defineAnnotatedType().ref(type)
  if (optional) {
    prop.optional()
  }
  return defineAnnotatedType('object').prop('p', prop.$type).$type
}

const verdict = (
  engine: 'walk' | 'check',
  type: TAtscriptAnnotatedType,
  value: unknown,
  opts: Partial<TValidatorOptions>
) => {
  const copy = structuredClone(value)
  const validator = engine === 'walk' ? new WalkValidator(type, opts) : new Validator(type, opts)
  const ok = validator.validate(copy, true)
  return opts.unknownProps === 'strip' ? [ok, ok ? copy : undefined] : ok
}

describe('merged intersections of every operand pair', () => {
  let interpreted: TModule
  let compiled: TModule
  beforeAll(async () => {
    interpreted = await generate(false)
    compiled = await generate(true)
  }, 120_000)

  it('validate like the runtime intersection and like both operands, in the three engines', () => {
    const disagreements: string[] = []
    let checks = 0
    for (let i = 0; i < OPERANDS.length; i++) {
      for (let j = 0; j < OPERANDS.length; j++) {
        const where = `(${OPERANDS[i]}) & (${OPERANDS[j]})`
        const left = interpreted[`O${i}`]
        const right = interpreted[`O${j}`]
        const forms = [
          ['type', `M${i}_${j}`, runtimeIntersection(left, right), (v: unknown) => v],
          [
            'prop',
            `P${i}_${j}`,
            propOf(runtimeIntersection(left, right), false),
            (v: unknown) => ({ p: v }),
          ],
          [
            'optional prop',
            `Q${i}_${j}`,
            propOf(runtimeIntersection(left, right), true),
            (v: unknown) => ({ p: v }),
          ],
        ] as const
        for (const [form, name, runtime, wrap] of forms) {
          for (const raw of VALUES) {
            const value = wrap(raw)
            // The oracle: both operands accept the value (unknown keys ignored).
            const ignore = { unknownProps: 'ignore' } as const
            // (an optional prop passes `undefined` and `null`)
            const both =
              form === 'optional prop' && (raw === undefined || raw === null)
                ? true
                : form === 'prop' && raw === undefined
                  ? false
                  : verdict('walk', left, raw, ignore) && verdict('walk', right, raw, ignore)
            for (const opts of [ignore, {}, { unknownProps: 'strip' } as const]) {
              const expected = verdict('walk', interpreted[name], value, opts)
              const runtimeWalk = verdict('walk', runtime, value, opts)
              const observed: Array<[string, unknown, unknown]> = [
                ['merged pre-check', verdict('check', interpreted[name], value, opts), expected],
                ['merged compiled', verdict('check', compiled[name], value, opts), expected],
                ['runtime pre-check', verdict('check', runtime, value, opts), runtimeWalk],
                ['runtime walk', runtimeWalk, opts === ignore ? expected : runtimeWalk],
              ]
              for (const [engine, got, want] of observed) {
                checks++
                if (JSON.stringify(got) !== JSON.stringify(want)) {
                  disagreements.push(
                    `${form} ${where} ${JSON.stringify(opts)} on ${JSON.stringify(value)}: ${engine} ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`
                  )
                }
              }
              if (opts === ignore && expected !== both) {
                disagreements.push(
                  `${form} ${where} on ${JSON.stringify(value)}: merged ${expected}, both operands ${both}`
                )
              }
            }
          }
        }
      }
    }
    expect(disagreements.slice(0, 30)).toEqual([])
    console.info(`[merge] ${OPERANDS.length ** 2} ordered pairs × 3 forms: ${checks} checks`)
  })

  it('JSON schemas (runtime and bundled) accept exactly what the validator does', () => {
    const disagreements: string[] = []
    const stats = { checks: 0 }
    const wrapped = VALUES.map(v => ({ p: v }))
    for (const [name, type] of Object.entries(interpreted)) {
      // (MODEL §11: in-place merge operands are extra module exports under a reserved `$`
      // prefix, not types of the module)
      if (!(type as any)?.__is_atscript_annotated_type || name.startsWith('$')) {
        continue
      }
      const fixed = name.startsWith('P') || name.startsWith('Q') ? [...wrapped, ...VALUES] : VALUES
      disagreements.push(
        ...schemaDisagreements(name, type, valuesFor(type, fixed, 10, name.length), true, stats)
      )
    }
    expect(disagreements.slice(0, 30)).toEqual([])
    console.info(`[merge] JSON schemas: ${stats.checks} checks`)
  })
})
