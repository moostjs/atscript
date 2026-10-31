import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { AnnotationSpec, build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * The `defType` guard of an annotation written at the top of an `annotate` block (before the
 * keyword) checks the type the block's target resolves to — through type aliases and
 * `annotate … as` aliases — like the same annotation written on the target's declaration, not
 * the block itself. Exhaustively: spec `defType` lists × target kinds (primitives, literals,
 * arrays, objects, unions — nullable ones and unions of literals —, tuples, intersections, alias
 * chains, `annotate … as` chains and aliases of them) × mutating and `annotate … as` blocks ×
 * targets declared in the module or imported. An annotation passing the guard applies at
 * runtime: to the target of a mutating block, to the alias of an `annotate … as` block (and the
 * validator checks it).
 */

/** A target: its declaration (with `$` for the module prefix), its kind and union members. */
interface TTarget {
  decl: string
  kind: string
  members?: string[]
  /** a value the target accepts, and one `@expect.minLength 2` / `@expect.min 2` rejects */
  ok?: unknown
  short?: unknown
}

const TARGETS: Record<string, TTarget> = {
  S: { decl: 'export type $S = string', kind: 'string', ok: 'ab', short: 'a' },
  N: { decl: 'export type $N = number', kind: 'number', ok: 3, short: 1 },
  B: { decl: 'export type $B = boolean', kind: 'boolean' },
  L: { decl: "export type $L = 'ab'", kind: 'const' },
  LN: { decl: 'export type $LN = 12', kind: 'const' },
  A: { decl: 'export type $A = string[]', kind: 'array', ok: ['x', 'y'], short: ['x'] },
  I: { decl: 'export interface $I {\n  a: number\n}', kind: 'object' },
  O: { decl: 'export type $O = {\n  a: number\n}', kind: 'object' },
  U: { decl: 'export type $U = string | number', kind: 'union', members: ['string', 'number'] },
  UN: {
    decl: 'export type $UN = string | null',
    kind: 'union',
    members: ['string'],
    ok: 'ab',
    short: 'a',
  },
  US: { decl: "export type $US = 'ab' | 'cd'", kind: 'union', members: ['const', 'const'] },
  UA: {
    decl: 'export type $UA = $U | string[]',
    kind: 'union',
    members: ['string', 'number', 'array'],
  },
  T: { decl: 'export type $T = [string, number]', kind: 'tuple' },
  X: { decl: 'export type $X = $I & {\n  b: number\n}', kind: 'intersection' },
  S1: { decl: 'export type $S1 = $S', kind: 'string', ok: 'ab', short: 'a' },
  S2: { decl: 'export type $S2 = $S1', kind: 'string', ok: 'ab', short: 'a' },
  A1: { decl: 'export type $A1 = $A', kind: 'array', ok: ['x', 'y'], short: ['x'] },
  O1: { decl: 'export type $O1 = $O', kind: 'object' },
  U1: { decl: 'export type $U1 = $UN', kind: 'union', members: ['string'], ok: 'ab', short: 'a' },
  SA: { decl: 'export annotate $S as $SA {}', kind: 'string', ok: 'ab', short: 'a' },
  SAA: { decl: 'export annotate $SA as $SAA {}', kind: 'string', ok: 'ab', short: 'a' },
  SAT: { decl: 'export type $SAT = $SA', kind: 'string', ok: 'ab', short: 'a' },
  S1A: { decl: 'export annotate $S1 as $S1A {}', kind: 'string', ok: 'ab', short: 'a' },
  NA: { decl: 'export annotate $N as $NA {}', kind: 'number', ok: 3, short: 1 },
  AA: { decl: 'export annotate $A as $AA {}', kind: 'array', ok: ['x', 'y'], short: ['x'] },
  IA: { decl: 'export annotate $I as $IA {\n  a\n}', kind: 'object' },
  OAA: { decl: 'export annotate $O1 as $OAA {}', kind: 'object' },
  UA1: { decl: 'export annotate $UN as $UA1 {}', kind: 'union', members: ['string'] },
}

/** The specs: annotation name → `defType` (`expect.*` are the built-in ones). */
const SPECS: Record<string, string[]> = {
  'x.s': ['string'],
  'x.n': ['number'],
  'x.b': ['boolean'],
  'x.as': ['array', 'string'],
  'x.a': ['array'],
  'x.o': ['object'],
  'x.u': ['union'],
  'x.t': ['tuple'],
  'x.i': ['intersection'],
  'x.sb': ['string', 'boolean'],
  'expect.minLength': ['array', 'string'],
  'expect.min': ['number'],
}

function accepts(defType: string[], t: TTarget): boolean {
  return (
    defType.includes(t.kind) ||
    (t.kind === 'union' && !!t.members?.length && t.members.every(m => defType.includes(m)))
  )
}

const ARGS: Record<string, string> = { 'expect.minLength': ' 2', 'expect.min': ' 2' }

const lib = (prefix: string) =>
  Object.values(TARGETS)
    .map(t => t.decl.replaceAll('$', prefix))
    .join('\n')

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const annotations = {
  x: Object.fromEntries(
    Object.entries(SPECS)
      .filter(([name]) => name.startsWith('x.'))
      .map(([name, defType]) => [
        name.slice(2),
        new AnnotationSpec({ defType: defType as any, multiple: true }),
      ])
  ),
}

interface TBlock {
  target: string
  imported: boolean
  mutating: boolean
  alias?: string
}

/** The main module: one block per target × local/imported × mutating/`as`; `only` keeps those. */
function mainModule(spec: string, only?: (b: TBlock) => boolean) {
  const names = Object.keys(TARGETS)
  const lines = [
    `import { ${names.map(n => `R${n}`).join(', ')} } from './lib'`,
    ...lib('L').split('\n'),
  ]
  const blocks = new Map<number, TBlock>()
  let n = 0
  for (const target of names) {
    for (const imported of [false, true]) {
      for (const mutating of [true, false]) {
        const block: TBlock = {
          target,
          imported,
          mutating,
          alias: mutating ? undefined : `Z${n++}`,
        }
        if (only && !only(block)) {
          continue
        }
        blocks.set(lines.length, block)
        const name = `${imported ? 'R' : 'L'}${target}`
        lines.push(`@${spec}${ARGS[spec] ?? ''}`)
        lines.push(
          mutating ? `annotate ${name} {}` : `export annotate ${name} as ${block.alias} {}`
        )
      }
    }
  }
  return { content: `${lines.join('\n')}\n`, blocks }
}

async function compile(spec: string, only?: (b: TBlock) => boolean) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-annotate-def-type-'))
  dirs.push(dir)
  const main = mainModule(spec, only)
  writeFileSync(path.join(dir, 'lib.as'), lib('R'))
  writeFileSync(path.join(dir, 'main.as'), main.content)
  const repo = await build({
    rootDir: dir,
    entries: ['main.as', 'lib.as'],
    plugins: [tsPlugin()],
    annotations,
  })
  return { dir, repo, main }
}

describe('the defType guard of an annotate block checks its target', () => {
  for (const [spec, defType] of Object.entries(SPECS)) {
    it(`${spec} (${defType.join(' | ')})`, async () => {
      // 1. Diagnostics: an error exactly on the blocks whose target's kind the spec rejects.
      const { repo, main } = await compile(spec)
      const diags = [...(await repo.diagnostics()).entries()]
      const errors = diags.flatMap(([id, msgs]) =>
        msgs.filter(m => m.severity === 1).map(m => ({ id: path.basename(id), m }))
      )
      const rejected = new Set<number>()
      const other: string[] = []
      for (const { id, m } of errors) {
        const block = main.blocks.get(m.range.start.line)
        if (id === 'main.as' && block && m.message.startsWith('Expected type is')) {
          rejected.add(m.range.start.line)
          // (the message names the target's kind)
          const kind = TARGETS[block.target].kind
          expect(m.message).toContain(kind === 'union' ? 'got union (' : `got "${kind}"`)
        } else {
          other.push(`${id}:${m.range.start.line} ${m.message}`)
        }
      }
      expect(other).toEqual([])
      const got = [...main.blocks].map(
        ([line, b]) =>
          `${b.mutating ? 'annotate' : 'as'} ${b.imported ? 'R' : 'L'}${b.target}: ${rejected.has(line) ? 'error' : 'ok'}`
      )
      const want = [...main.blocks].map(
        ([, b]) =>
          `${b.mutating ? 'annotate' : 'as'} ${b.imported ? 'R' : 'L'}${b.target}: ${accepts(defType, TARGETS[b.target]) ? 'ok' : 'error'}`
      )
      expect(got).toEqual(want)
      // (one message per rejected block)
      expect(errors.length).toBe(want.filter(w => w.endsWith('error')).length)

      // 2. Runtime: the accepted blocks apply their annotation.
      const accepted = await compile(spec, b => accepts(defType, TARGETS[b.target]))
      const errs = [...(await accepted.repo.diagnostics()).values()]
        .flat()
        .filter(m => m.severity === 1)
      expect(errs.map(m => m.message)).toEqual([])
      for (const file of await accepted.repo.generate({ format: 'js' })) {
        writeFileSync(path.join(accepted.dir, `${path.basename(file.source)}.js`), file.content)
      }
      vi.resetModules()
      const mainMod = await import(path.join(accepted.dir, 'main.as.js'))
      const libMod = await import(path.join(accepted.dir, 'lib.as.js'))
      const missing: string[] = []
      for (const b of accepted.main.blocks.values()) {
        const name = `${b.imported ? 'R' : 'L'}${b.target}`
        const type = b.mutating ? (b.imported ? libMod : mainMod)[name] : mainMod[b.alias!]
        const label = `${b.mutating ? 'annotate' : 'as'} ${name}`
        if (!type?.metadata?.has(spec)) {
          missing.push(`${label}: no metadata`)
          continue
        }
        const t = TARGETS[b.target]
        if (spec.startsWith('expect.') && t.ok !== undefined) {
          const v = type.validator()
          if (!v.validate(t.ok, true) || v.validate(t.short, true)) {
            missing.push(`${label}: validator ignores it`)
          }
        }
      }
      expect(missing).toEqual([])
    })
  }
})
