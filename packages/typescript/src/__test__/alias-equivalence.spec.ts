import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { schemaDisagreements, valuesFor } from './json-schema-oracle'

/*
 * An `annotate … as` alias behaves exactly like a hand-written copy of the annotated type, in
 * every position it is reused in: `extends` (directly, or of a type alias of it), an intersection
 * operand (either side, with the target too), a reference to one of its props (top-level, nested
 * in an inline object, through a reference the alias inlines), a union member, an array item, a
 * tuple item, a nested prop, a type alias, and an `annotate … as` alias of it — in the alias's file
 * and in another file, with and without a mutating `annotate` block of the target (part of the
 * target's definition: the alias is a copy of the target's final definition, its own entries
 * over the block's — like a copy written with the block's annotations). For each position, the type built from the alias and the one built from the
 * hand-written copy have the same validator verdicts (interpreted and compiled), metadata at
 * every path, JSON schema (runtime and bundled) and `.d.ts` declaration.
 */

const TARGET = (mutating: boolean) => `export interface Addr {
  @meta.label 'City'
  @expect.minLength 2
  city: string
}

@meta.description 'Base'
@meta.label 'Base label'
export interface Base {
  @meta.label 'Name'
  @expect.maxLength 10
  name: string
  @meta.label 'Pwd'
  pwd?: string
  inline: {
    @meta.label 'Inner'
    v: string
  }
  addr?: Addr
}
${mutating ? `\nannotate Base {\n  @meta.label 'MutPwd'\n  @expect.minLength 4\n  pwd\n}\n` : ''}
@meta.description 'Alias'
export annotate Base as X {
  @meta.label 'AliasName'
  @expect.minLength 2
  name
  @meta.label 'AliasInner'
  inline.v
  @meta.label 'AliasCity'
  @expect.maxLength 8
  addr.city
}
`

/**
 * The hand-written copy of alias `X` (named `X` too, in its own module) — with the mutating
 * block of the target (`pwd`) when there is one.
 */
const COPY = (mutating: boolean) => `@meta.description 'Alias'
@meta.label 'Base label'
export interface X {
  @meta.label 'AliasName'
  @expect.maxLength 10
  @expect.minLength 2
  name: string
${mutating ? "  @meta.label 'MutPwd'\n  @expect.minLength 4" : "  @meta.label 'Pwd'"}
  pwd?: string
  inline: {
    @meta.label 'AliasInner'
    v: string
  }
  addr?: {
    @meta.label 'AliasCity'
    @expect.minLength 2
    @expect.maxLength 8
    city: string
  }
}
`

/** The positions `X` is reused in (exported types; `Base` is the alias's target). */
const POSITIONS = `export interface PExtends extends X {
  e?: string
}
export type PAlias = X
export interface PExtendsAlias extends PAlias {
  e?: string
}
export type PAnd = X & { e?: string }
export type PAndRev = { e?: string } & X
export type PAndTarget = X & Base
export type PTargetAnd = Base & X
export interface PRef {
  n: X.name
  v?: X.inline.v
  c?: X.addr.city
  p?: X.pwd
}
export type PUnion = X | null
export type PArray = X[]
export type PTuple = [X, string]
export interface PNested {
  inner: X
  opt?: X
  list?: X[]
}
export type PRefUnion = X.name | number
export annotate X as PAliasOfAlias {
  @meta.label 'AA'
  pwd
}
`

const VALUES: unknown[] = [
  null,
  'abc',
  [],
  ['x'],
  { name: 'ab', inline: { v: 'x' } },
  { name: 'a', inline: { v: 'x' } },
  { name: 'abcdefghijkl', inline: { v: 'x' } },
  { name: 'ab', inline: { v: 1 } },
  { name: 'ab', inline: { v: 'x' }, pwd: 'abc' },
  { name: 'ab', inline: { v: 'x' }, pwd: 'abcde' },
  { name: 'ab', inline: { v: 'x' }, addr: { city: 'c' } },
  { name: 'ab', inline: { v: 'x' }, addr: { city: 'cityname' } },
  { name: 'ab', inline: { v: 'x' }, addr: { city: 'citynames' } },
  { name: 'ab', inline: { v: 'x' }, e: 'x', more: 1 },
  { n: 'ab', v: 'x', c: 'cc', p: 'abcd' },
  { n: 'a' },
  { n: 'ab', c: 'c' },
  [{ name: 'ab', inline: { v: 'x' } }, 'x'],
  [{ name: 'a', inline: { v: 'x' } }],
  { inner: { name: 'ab', inline: { v: 'x' } } },
  { inner: { name: 'a', inline: { v: 'x' } } },
  {
    inner: { name: 'ab', inline: { v: 'x' } },
    list: [{ name: 'abcdefghijkl', inline: { v: 'x' } }],
  },
  'a',
  1,
]

const OPTIONS: Array<Partial<TValidatorOptions>> = [
  {},
  { unknownProps: 'strip' },
  { partial: 'deep' },
]

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type TModule = Record<string, any>

/** Builds `files` (generated next to them) and loads `load`; the `.d.ts` of every file. */
async function generate(
  files: Record<string, string>,
  load: string,
  compileValidators: boolean
): Promise<{ module: TModule; dts: Map<string, string> }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-alias-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators })],
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  const dts = new Map<string, string>()
  for (const file of await repo.generate({ format: 'dts' })) {
    dts.set(path.basename(file.source), file.content)
  }
  vi.resetModules()
  return { module: await import(path.join(dir, `${load}.js`)), dts }
}

/** The metadata of `type` at every path (references entered once). */
function metadataTree(type: TAtscriptAnnotatedType): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const seen = new Set<unknown>()
  const visit = (node: TAtscriptAnnotatedType, at: string) => {
    out[at || '.'] = JSON.stringify([...node.metadata].sort(([a], [b]) => (a < b ? -1 : 1)))
    const t = node.type as any
    if (seen.has(t)) {
      return
    }
    seen.add(t)
    if (t.kind === 'object') {
      for (const [key, prop] of t.props) {
        visit(prop, `${at}.${key}${prop.optional ? '?' : ''}`)
      }
    } else if (t.kind === 'array') {
      visit(t.of, `${at}[]`)
    } else if (t.items) {
      t.items.forEach((item: TAtscriptAnnotatedType, i: number) =>
        visit(item, `${at}<${t.kind}${i}>`)
      )
    }
  }
  visit(type, '')
  return out
}

/**
 * `schema` with its `$defs` references written in place (each entry once per path): an alias's
 * path override keeps the reference's id (MODEL §4: the shell is the referenced type's node,
 * `repr:as-shell-keeps-ref-id`), so its schema may hold as a named `$defs` entry what a
 * hand-written copy writes in place.
 */
function inlined(schema: any): unknown {
  const defs = (schema?.$defs ?? {}) as Record<string, unknown>
  const walk = (value: any, above: Set<string>): unknown => {
    if (Array.isArray(value)) {
      return value.map(v => walk(v, above))
    }
    if (!value || typeof value !== 'object') {
      return value
    }
    const ref =
      typeof value.$ref === 'string' ? /^#\/\$defs\/(.+)$/.exec(value.$ref)?.[1] : undefined
    if (ref !== undefined && ref in defs && !above.has(ref)) {
      return walk(defs[ref], new Set([...above, ref]))
    }
    const out: any = Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== '$defs')
        .map(([k, v]) => [k, walk(v, above)])
    )
    // (a nullable reference, `anyOf: [$ref, null]`, is `type: [t, 'null']` written in place:
    // `buildJsonSchema`'s `nullable`)
    const [first, second] = out.anyOf ?? []
    if (
      Object.keys(out).length === 1 &&
      out.anyOf?.length === 2 &&
      typeof first?.type === 'string' &&
      !('const' in first) &&
      !first.enum &&
      second?.type === 'null' &&
      Object.keys(second).length === 1
    ) {
      return { ...first, type: [first.type, 'null'] }
    }
    return out
  }
  return walk(schema, new Set())
}

/** The `.d.ts` declaration of `name` (its block, the copy's name normalized). */
function declaration(dts: string, name: string): string {
  const start = dts.search(
    new RegExp(`(export )?(declare )?(class|type|interface|namespace) ${name}\\b`)
  )
  if (start < 0) {
    return '(none)'
  }
  const rest = dts.slice(start)
  const end = rest.search(/\n(?=\/\*\*|export |declare |\/\/ prettier)/)
  return (end < 0 ? rest : rest.slice(0, end)).replaceAll(/\.as:\d+:\d+/g, '.as')
}

describe('an annotate … as alias behaves like a hand-written copy of its target', () => {
  for (const mutating of [false, true]) {
    for (const crossFile of [false, true]) {
      for (const compileValidators of [false, true]) {
        it(`${crossFile ? 'in another file' : 'in the same file'}, ${mutating ? 'with' : 'without'} a mutating annotate of the target${compileValidators ? ' (compiled)' : ''}`, async () => {
          // The alias and the copy, each with the positions in its file or another one.
          const imports = "import { X, Base } from './x'\n"
          const variants: Record<
            'alias' | 'copy',
            { files: Record<string, string>; load: string; dts: string }
          > = {
            alias: crossFile
              ? {
                  files: { 'x.as': TARGET(mutating), 'p.as': imports + POSITIONS },
                  load: 'p.as',
                  dts: 'p.as',
                }
              : { files: { 'x.as': TARGET(mutating) + POSITIONS }, load: 'x.as', dts: 'x.as' },
            copy: crossFile
              ? {
                  files: {
                    'x.as':
                      TARGET(mutating).replace(/@meta\.description 'Alias'[\s\S]*$/, '') +
                      COPY(mutating),
                    'p.as': imports + POSITIONS,
                  },
                  load: 'p.as',
                  dts: 'p.as',
                }
              : {
                  files: {
                    'x.as':
                      TARGET(mutating).replace(/@meta\.description 'Alias'[\s\S]*$/, '') +
                      COPY(mutating) +
                      POSITIONS,
                  },
                  load: 'x.as',
                  dts: 'x.as',
                },
          }
          const built = {
            alias: await generate(variants.alias.files, variants.alias.load, compileValidators),
            copy: await generate(variants.copy.files, variants.copy.load, compileValidators),
          }
          const names = Object.keys(built.copy.module).filter(n => n.startsWith('P'))
          expect(names.length).toBe(14)
          for (const name of names) {
            const observe = (side: 'alias' | 'copy') => {
              const type = built[side].module[name] as TAtscriptAnnotatedType & {
                toJsonSchema(): unknown
              }
              return {
                metadata: metadataTree(type),
                verdicts: VALUES.map(value =>
                  OPTIONS.map(opts => {
                    const copy = structuredClone(value)
                    const validator = new Validator(type, opts)
                    const ok = validator.validate(copy, true)
                    return [ok, ok ? copy : validator.errors.map(e => `${e.path}: ${e.message}`)]
                  })
                ),
                schema: inlined(buildJsonSchema(type)),
                bundled: inlined(type.toJsonSchema()),
                dts: declaration(built[side].dts.get(variants[side].dts)!, name),
              }
            }
            const alias = observe('alias')
            expect([name, alias.bundled]).toEqual([name, alias.schema])
            // (and accept what the validator does)
            for (const side of ['alias', 'copy'] as const) {
              const type = built[side].module[name]
              expect(
                schemaDisagreements(
                  `${side} ${name}`,
                  type,
                  valuesFor(type, VALUES, 30, name.length),
                  true
                ).slice(0, 10)
              ).toEqual([])
            }
            expect([name, alias]).toEqual([name, observe('copy')])
          }
        }, 120_000)
      }
    }
  }
})
