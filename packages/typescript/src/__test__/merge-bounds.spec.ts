import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterEach, describe, expect, it } from 'vitest'

import { tsPlugin, type TTsPluginOptions } from '../plugin'
import { flattenAnnotatedType } from '../runtime/flatten'
import { buildJsonSchema } from '../runtime/json-schema'
import { serializeAnnotatedType } from '../runtime/serialize'
import { denseSchema, rng } from '../test-utils'
import { schemaDisagreements, valuesFor } from './json-schema-oracle'

// Merges of intersections (and the walks over the trees generated code emits) stay bounded in
// time and size whatever the schema, and decide the same whatever order types are declared in.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const OPTIONS: TTsPluginOptions[] = [{}, { jsonSchema: 'bundle' }, { compileValidators: true }]

/** Builds `files`, returns the generated modules (by source name), their diagnostics and dir. */
async function generate(files: Record<string, string>, opts: TTsPluginOptions = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-bounds-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({ rootDir: dir, entries: Object.keys(files), plugins: [tsPlugin(opts)] })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  const js = new Map<string, string>()
  try {
    for (const out of await repo.generate({ format: 'js' })) {
      js.set(path.basename(out.source), out.content)
    }
    await repo.generate({ format: 'dts' })
  } catch (error) {
    // (MODEL §6: a union member in a recursive merge, or more than 200 hidden merge classes in a
    // module, is a compile error — reported, and the module is not generated)
    if (errors.length === 0) {
      throw error
    }
  }
  return { dir, js, errors }
}

/** The blocks of a generated module (its classes, chains, compiled checks), sorted. */
const blocks = (js: string) =>
  js
    .split(/\n\s*\n|\n(?=\$cv\()/)
    .map(b => b.trim())
    .filter(Boolean)
    .sort()

describe('nested intersections distributing unions', () => {
  // `S2 & { e: … }` merges `e: S0 | boolean` with `{ d: S0 | { e: S0 } }`: the distributed
  // union nests new intersections in every merge, which nest new ones in turn (new nodes, so
  // never the same intersection twice) — the search of the merge budget ran out of memory.
  it('generate in bounded time and size', { timeout: 20_000 }, async () => {
    const source = [
      'export interface S0 {\n  d: S2 & {\n    e: {\n      d: S0 | { e: S0 }\n    }\n  }\n}',
      'export interface S2 {\n  e: S0 | boolean\n}',
    ].join('\n')
    for (const opts of OPTIONS) {
      const started = Date.now()
      const { js, errors } = await generate({ 'a.as': source }, opts)
      expect(errors).toEqual([])
      expect(js.get('a.as')!.length).toBeLessThan(200_000)
      expect(Date.now() - started).toBeLessThan(3000)
    }
  })
})

describe('an intersection merged into a runtime intersection', () => {
  // `{} & S1 & (S1 | S2)` (`S2` unknown) distributes into `S1 & S1 | S1 & S2`, and `S1 & S2`
  // stays an intersection of a new merge and `S2`: walked as the same level as the one it was
  // merged from, it merged that one again inside every one of them (a stack overflow — also of
  // the diagnostics, while the name was being typed).
  it('does not merge the intersection it was merged from again', async () => {
    const { js, errors } = await generate({
      'a.as':
        'export interface S1 {\n  d: { f: {} & S1 & (S1 | S2) }\n}\nexport type S3 = S1 & {}\n',
    })
    expect(errors.map(e => e.message)).toEqual(['Unknown identifier "S2"'])
    // (MODEL §12 Q8: a module with error diagnostics is not generated — the diagnostics above are
    // what this bounds, as they were computed in bounded time)
    expect(js.get('a.as')).toBeUndefined()
  })
})

describe('the merge budget of nested intersections', () => {
  // Decided to a depth from the first intersection asked, a nested intersection merged or not
  // depending on which type was declared (so walked) first.
  it('decides the same whatever order types are declared in', async () => {
    const levels = Array.from(
      { length: 18 },
      (_, i) => `export type L${i + 1} = { n${i + 1}: L${i + 2} & E } & E`
    )
    const forward = [
      'export interface E { e: string }',
      ...levels,
      'export interface L19 { leaf: string }',
    ]
    const reverse = [forward[0], forward.at(-1)!, ...levels.toReversed()]
    for (const opts of OPTIONS) {
      const a = (await generate({ 'a.as': forward.join('\n') }, opts)).js.get('a.as')!
      const b = (await generate({ 'a.as': reverse.join('\n') }, opts)).js.get('a.as')!
      // (P4B default format switch (MODEL intro, §1, §5): one hidden class per distinct merge,
      // numbered — and the in-place operands exported — in the order the module allocates them:
      // the same statements under other numbers, in another order)
      const unordered = (js: string) =>
        blocks(js.replaceAll(/\$M\d+\b/g, '$M'))
          .map(block => block.split('\n').sort().join('\n'))
          .sort()
      expect(unordered(a)).toEqual(unordered(b))
    }
  })
})

describe('random schemas dense in unions, intersections and self references', () => {
  /**
   * Seeds that used to overflow the stack, run out of memory or emit megabytes (36 … 140:
   * flattening recursed through the intersections it builds of shared props).
   */
  const KNOWN = [11, 36, 52, 55, 126, 140, 235, 265, 321, 477, 766, 792, 843, 878, 909, 936, 969]
  const SEEDS = [...Array.from({ length: 40 }, (_, i) => i + 1000), ...KNOWN]
  /** Flattening enumerates paths (exponential in recursive union fan-out): bounded here. */
  const FLAT_LIMIT = 50_000
  const FLAT = new Error('flat limit')

  it(
    'generate, load, flatten and validate in bounded time and size',
    { timeout: 300_000 },
    async () => {
      for (const seed of SEEDS) {
        const started = Date.now()
        const { dir, js, errors } = await generate(denseSchema(seed), OPTIONS[seed % 3])
        const size = [...js.values()].reduce((n, code) => n + code.length, 0)
        expect([seed, size < 16_000_000]).toEqual([seed, true])
        if (errors.length > 0) {
          continue
        }
        for (const [name, code] of js) {
          writeFileSync(path.join(dir, `${name}.js`), code)
        }
        for (const name of js.keys()) {
          const module = await import(path.join(dir, `${name}.js`))
          for (const type of Object.values(module) as any[]) {
            if (!type?.__is_atscript_annotated_type) {
              continue
            }
            buildJsonSchema(type)
            JSON.stringify(serializeAnnotatedType(type))
            type.validator().validate({ d: { e: 'x' } }, true)
            let fields = 0
            try {
              flattenAnnotatedType(type, {
                onField: () => {
                  if (++fields > FLAT_LIMIT) {
                    throw FLAT
                  }
                },
              })
            } catch (error) {
              if (error !== FLAT) {
                throw error
              }
            }
          }
        }
        expect([seed, Date.now() - started < 10_000]).toEqual([seed, true])
      }
    }
  )
})

describe('dense schemas whose merge states multiplied', () => {
  /**
   * Seed, the most bytes its generated modules may take (×1.5 their size when large merges were
   * merged at runtime, rounded up) and the most milliseconds its generation, then its loading and
   * reading, may take. Seed 4 emitted 18 MB in 17 s (a large merge's nested merges were merge
   * states per occurrence, not per place, and each branch of a distributed union had its own);
   * seed 282 ran out of memory (merge states keyed nodes the merges build — new ones every time —
   * so a recursion of merges never closed); seed 83 re-merged at runtime for 12 s.
   */
  const SEEDS: Array<[seed: number, bytes: number, gen: number, load: number]> = [
    [4, 2_100_000, 4000, 4000],
    [282, 60_000, 2000, 2000],
    [83, 1_900_000, 3000, 6000],
    [232, 280_000, 2000, 3000],
  ]
  const FLAT_LIMIT = 50_000
  const FLAT = new Error('flat limit')

  for (const [seed, bytes, gen, load] of SEEDS) {
    it(
      `seed ${seed}: generates, loads and reads in bounded time and size`,
      { timeout: 120_000 },
      async () => {
        let started = Date.now()
        const { dir, js, errors } = await generate(denseSchema(seed), OPTIONS[seed % 3])
        const size = [...js.values()].reduce((n, code) => n + code.length, 0)
        expect({ size: size < bytes, gen: Date.now() - started < gen }).toEqual({
          size: true,
          gen: true,
        })
        if (errors.length > 0) {
          return
        }
        for (const [name, code] of js) {
          writeFileSync(path.join(dir, `${name}.js`), code)
        }
        started = Date.now()
        for (const name of js.keys()) {
          const module = await import(path.join(dir, `${name}.js`))
          for (const type of Object.values(module) as any[]) {
            if (!type?.__is_atscript_annotated_type) {
              continue
            }
            buildJsonSchema(type)
            JSON.stringify(serializeAnnotatedType(type))
            type.validator().validate({ d: { e: 'x' } }, true)
            let fields = 0
            try {
              flattenAnnotatedType(type, {
                onField: () => {
                  if (++fields > FLAT_LIMIT) {
                    throw FLAT
                  }
                },
              })
            } catch (error) {
              if (error !== FLAT) {
                throw error
              }
            }
          }
        }
        expect(Date.now() - started).toBeLessThan(load)
      }
    )
  }
})

describe('random dense schemas: JSON schemas accept what the validator does', () => {
  // `ATSCRIPT_LARGE_TESTS=1`: 400 seeds
  const SEEDS = Array.from(
    { length: process.env.ATSCRIPT_LARGE_TESTS ? 400 : 40 },
    (_, i) => i + 2000
  )
  const FIXED = [null, 'x', 1, true, [], {}, { d: 'x' }, { d: { e: 'x' } }, { e: null, f: [] }]

  it('runtime and bundled schemas, compiled by ajv', { timeout: 1_200_000 }, async () => {
    const stats = { checks: 0 }
    let modules = 0
    for (const seed of SEEDS) {
      const { dir, js, errors } = await generate(denseSchema(seed), { jsonSchema: 'bundle' })
      if (errors.length > 0) {
        continue
      }
      for (const [name, code] of js) {
        writeFileSync(path.join(dir, `${name}.js`), code)
      }
      for (const name of js.keys()) {
        const module = await import(path.join(dir, `${name}.js`))
        modules++
        for (const [id, type] of Object.entries(module) as Array<[string, any]>) {
          // (MODEL §11: in-place merge operands are extra module exports under a reserved `$`
          // prefix, not types of the module)
          if (!type?.__is_atscript_annotated_type || id.startsWith('$')) {
            continue
          }
          const label = `seed ${seed} ${name}:${id}`
          const values = valuesFor(type, FIXED, 20, seed * 31 + id.length)
          expect(schemaDisagreements(label, type, values, true, stats).slice(0, 10)).toEqual([])
        }
      }
    }
    console.info(`[dense] JSON schemas: ${modules} modules, ${stats.checks} checks`)
  })
})

describe('mutating annotate paths re-entering many types', () => {
  // A thousand paths through twelve types reaching one another: each is T0's override of the
  // types it goes into, at that path only (a step re-entering T0 is T0's own prop).
  it('load in bounded time', { timeout: 60_000 }, async () => {
    const K = 12
    const r = rng(7)
    const lines: string[] = []
    for (let i = 0; i < K; i++) {
      const props = Array.from({ length: K }, (_, j) => `  p${j}?: T${j}`).join('\n')
      lines.push(
        `export interface T${i} {\n  name: string\n${props}\n  list?: T${(i + 1) % K}[]\n}`
      )
    }
    const paths = new Set<string>()
    while (paths.size < 1000) {
      paths.add(`${Array.from({ length: 8 }, () => `p${Math.floor(r() * K)}`).join('.')}.name`)
    }
    const entries = [...paths].map(p => `  @expect.maxLength 5\n  ${p}`)
    lines.push(`annotate T0 {\n${entries.join('\n')}\n}`)
    const { dir, js, errors } = await generate({ 'big.as': lines.join('\n') })
    expect(errors).toEqual([])
    writeFileSync(path.join(dir, 'big.as.js'), js.get('big.as')!)
    const started = Date.now()
    const { T0, T1 } = await import(path.join(dir, 'big.as.js'))
    expect(Date.now() - started).toBeLessThan(3000)
    const [first] = paths
    const node = first.split('.').reduce((n: any, key) => n.type.props.get(key), T0)
    expect(node.metadata.get('expect.maxLength')).toEqual({ length: 5 })
    // (a path ending in `p0.name` is T0's own `name`; the other types are untouched)
    expect([...paths].some(p => p.endsWith('.p0.name'))).toBe(true)
    expect(T0.type.props.get('name').metadata.get('expect.maxLength')).toEqual({ length: 5 })
    expect(T1.type.props.get('name').metadata.has('expect.maxLength')).toBe(false)
    expect(T1.type.props.get('p0').type.props.get('name').metadata.has('expect.maxLength')).toBe(
      true
    )
  })
})

describe('intersections of types sharing props that reference intersected types', () => {
  /** `A0 & B0`: `Ai` / `Bi` share `p0`…`p{k-1}`, typed `A{i+1}` / `B{i+1}` (`n` levels). */
  const chain = (n: number, k: number) => {
    const lines: string[] = []
    for (let i = 0; i < n; i++) {
      for (const [X, type] of [
        ['A', 'string'],
        ['B', 'number'],
      ]) {
        const props = Array.from(
          { length: k },
          (_, j) =>
            `  p${j}: ${i === n - 1 ? 'string' : `${X}${i + 1}`}\n  ${X.toLowerCase()}${j}_${i}: ${type}`
        )
        lines.push(`interface ${X}${i} {\n${props.join('\n')}\n}`)
      }
    }
    lines.push('export type T = A0 & B0', 'export interface U {\n  t: A0 & B0\n}')
    return lines.join('\n')
  }

  // Each merge of the shared props merged the intersections of their types again (`A1 & B1`
  // twice, `A2 & B2` four times, …): 142 MB of output in 5 s at 16 levels, a crash at 18.
  it(
    'generate, check, schema and validate in bounded time and size',
    { timeout: 60_000 },
    async () => {
      for (const [n, k] of [
        [16, 2],
        [20, 2],
        [24, 2],
        [9, 3],
        [16, 3],
      ]) {
        for (const opts of OPTIONS) {
          const started = Date.now()
          const { dir, js, errors } = await generate({ 'm.as': chain(n, k) }, opts)
          expect(errors).toEqual([])
          // Linear in the number of types per place reaching the merges (each of the `k` props
          // of `T` and of `U.t` has merge states of its own, like merges inlined there would have
          // nodes of their own; bundled schemas and compiled checks embed those of the types they
          // reference: quadratic in a chain of them, like without intersections).
          const limit = opts === OPTIONS[0] ? 2000 * n * k * k : 2500 * (n * k) ** 2
          expect([n, k, js.get('m.as')!.length < limit]).toEqual([n, k, true])
          writeFileSync(path.join(dir, 'm.as.js'), js.get('m.as')!)
          const { T } = await import(path.join(dir, 'm.as.js'))
          expect(JSON.stringify(buildJsonSchema(T)).length).toBeLessThan(1000 * n * k)
          expect(T.validator().validate({ a0_0: 'x', b0_0: 1 }, true)).toBe(false)
          expect([n, k, Date.now() - started < 5000]).toEqual([n, k, true])
        }
      }
    }
  )

  it('merge in the editor (core) in bounded time', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-bounds-'))
    dirs.push(dir)
    writeFileSync(path.join(dir, 'm.as'), chain(24, 3))
    const repo = await build({ rootDir: dir, entries: ['m.as'], plugins: [tsPlugin()] })
    const started = Date.now()
    const [doc] = [...(await repo.diagnostics()).keys()]
    expect(doc).toBeDefined()
    const generated = await repo.generate({ format: 'dts' })
    expect(generated[0].content.length).toBeLessThan(200_000)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('flatten as many fields as the types have paths, in time linear in them', async () => {
    const { dir, js } = await generate({ 'm.as': chain(12, 2) })
    writeFileSync(path.join(dir, 'm.as.js'), js.get('m.as')!)
    const { T } = await import(path.join(dir, 'm.as.js'))
    const started = Date.now()
    let fields = 0
    flattenAnnotatedType(T, { onField: () => fields++ })
    // Per level `i` (2^i objects): `p0`, `p1` and the 4 own fields each; the last `p0`, `p1`
    // are strings — the paths of the merged type.
    expect(fields).toBe(6 * (2 ** 12 - 1))
    expect(Date.now() - started).toBeLessThan(3000)
  })
})
