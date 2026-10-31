import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

import { build } from '@atscript/core'
import type { TAtscriptPlugin } from '@atscript/core'

import { tsPlugin, type TTsPluginOptions } from './plugin'
import { Validator } from './runtime/validator'

export interface PrepareFixturesOptions {
  /** Absolute directory containing the `.as` fixture files. */
  rootDir: string
  /** Additional plugins. `tsPlugin()` is auto-injected; do not pass it here. */
  plugins?: TAtscriptPlugin[]
  /** Glob includes; defaults to `['**\/*.as']` when `entries` is not set. */
  include?: string[]
  /** Explicit entry filenames relative to `rootDir`; takes precedence over `include`. */
  entries?: string[]
  /** Output formats to generate; defaults to `['js', 'dts']`. */
  formats?: Array<'js' | 'dts'>
  /** Options of the auto-injected `tsPlugin()` (e.g. `{ compileValidators: true }`). */
  tsPluginOptions?: TTsPluginOptions
}

/**
 * Compiles `.as` fixture files under `rootDir` and writes the generated
 * artifacts (`.as.js` and/or `.as.d.ts`) next to their sources.
 *
 * `tsPlugin()` is injected automatically — callers pass only extra plugins.
 * Files are only written when their content changed, so repeat runs
 * don't touch mtimes of up-to-date artifacts.
 */
export async function prepareFixtures(options: PrepareFixturesOptions): Promise<void> {
  const {
    rootDir,
    plugins = [],
    entries,
    include,
    formats = ['js', 'dts'],
    tsPluginOptions,
  } = options

  const repo = await build({
    rootDir,
    plugins: [tsPlugin(tsPluginOptions), ...plugins],
    ...(entries ? { entries } : { include: include ?? ['**/*.as'] }),
  })

  const results = await Promise.all(formats.map(format => repo.generate({ outDir: '.', format })))

  for (const files of results) {
    for (const file of files) {
      const target = file.target ?? path.join(rootDir, file.fileName)
      let existing: string | undefined
      try {
        existing = readFileSync(target, 'utf8')
      } catch {
        // file does not exist yet
      }
      if (existing !== file.content) {
        writeFileSync(target, file.content)
      }
    }
  }
}

/**
 * Reference validator for parity tests: a subclass never takes the allocation-free pre-check
 * (interpreted or compiled) nor the literal-union shortcut, so it always runs the full
 * error-collecting walk.
 */
export class WalkValidator extends Validator {}

/** A seeded random number generator (mulberry32) returning values in `[0, 1)`. */
export function rng(seed: number): () => number {
  // mulberry32 — the int32 / uint32 coercions are intentional
  // oxlint-disable unicorn/prefer-math-trunc
  return () => {
    seed = (seed + 0x6d_2b_79_f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  // oxlint-enable unicorn/prefer-math-trunc
}

/**
 * A random schema of two modules (`d0.as`, `d1.as`, importing each other) dense in what makes
 * merges large: unions inside intersections, intersections of types sharing prop names (so
 * their props merge too), self and mutual references, arrays of intersections, and mutating /
 * alias `annotate` blocks through them. Not every one is valid (a path may name no prop).
 */
export function denseSchema(seed: number): Record<string, string> {
  const r = rng(seed)
  const pick = <T>(list: T[]): T => list[Math.floor(r() * list.length)]
  const count = 3 + Math.floor(r() * 4)
  const names = Array.from({ length: count }, (_, i) => `S${i}`)
  const PROPS = ['d', 'e', 'f']
  const prim = () => pick(['string', 'number', 'boolean', 'string.email', 'null'])
  const wrap = (t: string) => (/[&|]/.test(t) ? `(${t})` : t)
  const many = (depth: number, op: string) =>
    Array.from({ length: 2 + Math.floor(r() * 2) }, () => wrap(expr(depth + 1))).join(` ${op} `)
  const obj = (depth: number): string => {
    const props = [...new Set(Array.from({ length: 1 + Math.floor(r() * 2) }, () => pick(PROPS)))]
    return `{ ${props.map(p => `${p}${r() < 0.3 ? '?' : ''}: ${expr(depth + 1)}`).join(', ')} }`
  }
  function expr(depth: number): string {
    const k = r()
    if (depth > 3 || k < 0.3) {
      return r() < 0.8 ? pick(names) : prim()
    }
    if (k < 0.5) {
      return obj(depth)
    }
    if (k < 0.7) {
      return many(depth, '|')
    }
    if (k < 0.92) {
      return many(depth, '&')
    }
    return `${wrap(expr(depth + 1))}[]`
  }
  const files: string[][] = [[], []]
  const declared: string[][] = []
  names.forEach((name, i) => {
    const props = [...new Set(Array.from({ length: 1 + Math.floor(r() * 3) }, () => pick(PROPS)))]
    declared.push(props)
    const body = props.map(p => `  ${p}${r() < 0.3 ? '?' : ''}: ${expr(0)}`).join('\n')
    files[i % 2].push(`export interface ${name} {\n${body}\n}`)
  })
  for (let i = 0; i < 2; i++) {
    files[i].push(`export type T${i} = ${many(1, '&')}`)
  }
  /** An `annotate` block of a random type: a prop it declares, or (sometimes) one below it. */
  const annotate = (head: string, label: string) => {
    const target = Math.floor(r() * count)
    const path = [pick(declared[target]), ...(r() < 0.4 ? [pick(PROPS)] : [])].join('.')
    return `${head.replace('%', names[target])} {\n  @meta.label "${label}"\n  ${path}\n}`
  }
  files[0].push(annotate('annotate %', 'm'))
  files[1].push(annotate('export annotate % as A1', 'a'))
  const out: Record<string, string> = {}
  for (let i = 0; i < 2; i++) {
    const imported = names.filter((_, j) => j % 2 !== i)
    out[`d${i}.as`] =
      `import { ${imported.join(', ')} } from './d${1 - i}'\n\n${files[i].join('\n\n')}\n`
  }
  return out
}
