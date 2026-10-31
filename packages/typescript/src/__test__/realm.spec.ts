import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * Bundled JSON schemas and compiled validator layouts are built by the runtime itself, from the
 * build's generated modules evaluated in a build-time realm (see `codegen/realm.ts`): they are
 * what the runtime builds when it loads the same modules.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function generate(files: Record<string, string>, opts?: Parameters<typeof tsPlugin>[0]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-realm-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin(opts ?? { jsonSchema: 'bundle' })],
  })
  const out: Record<string, string> = {}
  for (const file of await repo.generate({ format: 'js' })) {
    const name = path.basename(file.source)
    out[name] = file.content
    writeFileSync(path.join(dir, `${name}.js`), file.content)
  }
  return { dir, out }
}

/** Loads `modules` (in order) and returns, per type, its schema and where it came from. */
async function load(dir: string, modules: string[], types: Array<[string, string]>) {
  vi.resetModules()
  const loaded: Record<string, any> = {}
  for (const m of modules) {
    loaded[m] = await import(path.join(dir, `${m}.as.js`))
  }
  const { bundledSchemaSource } = await import('../runtime/bundled-schema')
  const { buildJsonSchema } = await import('../runtime/json-schema')
  const out: Record<string, string | undefined> = {}
  for (const [m, name] of types) {
    const type = loaded[m][name]
    expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
    out[name] = bundledSchemaSource(type)
  }
  return out
}

describe('build-time realm', () => {
  it('bundles what the runtime builds, blocks of other modules included', async () => {
    const { dir, out } = await generate({
      't.as': 'export interface T {\n  name: string\n  next?: T\n}\n',
      'b.as': "import { T } from './t'\nannotate T {\n  @expect.minLength 3\n  name\n}\n",
      'u.as': "import { T } from './t'\nexport interface U {\n  t: T\n}\n",
    })
    // (phase 2 replaced every placeholder)
    expect(Object.values(out).join('\n')).not.toContain('@@atscript-')
    expect(out['u.as']).toContain('"minLength":3')
    expect(
      await load(
        dir,
        ['b', 't', 'u'],
        [
          ['t', 'T'],
          ['u', 'U'],
        ]
      )
    ).toEqual({
      T: 'bundled',
      U: 'bundled',
    })
  })

  it('evaluates an import cycle as ESM does', async () => {
    const { dir } = await generate({
      'a.as': "import { B } from './b'\nexport interface A {\n  b?: B\n  x: string\n}\n",
      'b.as': [
        "import { A } from './a'",
        'export interface B {\n  a?: A\n}',
        'annotate A {\n  @expect.maxLength 2\n  x\n}',
      ].join('\n'),
    })
    expect(
      await load(
        dir,
        ['a', 'b'],
        [
          ['a', 'A'],
          ['b', 'B'],
        ]
      )
    ).toEqual({
      A: 'bundled',
      B: 'bundled',
    })
  })

  // (MODEL §12 Q8: a module with error diagnostics — here an unknown primitive extension — is not
  // generated: the build fails, never `any` in its place. It was generated, threw when loaded,
  // and left its schemas to the runtime.)
  it('a module with error diagnostics is not generated: the build fails', async () => {
    await expect(
      generate({
        'ok.as': 'export interface Ok {\n  a: string\n}\n',
        'bad.as':
          "import { Ok } from './ok'\nexport interface Bad {\n  ok: Ok\n  p: ui.paragraph\n}\n",
      })
    ).rejects.toThrow(/bad\.as: Unknown identifier "ui"/)
    // (the module without errors generates on its own, its schema bundled)
    const { out } = await generate({ 'ok.as': 'export interface Ok {\n  a: string\n}\n' })
    expect(out['ok.as']).toContain('"properties":{"a":{"type":"string"}}')
  })

  it('lays out compiled checks on what the runtime builds, blocks of other modules included', async () => {
    const { dir, out } = await generate(
      {
        'a.as': 'export interface A {\n  x: string\n}\n',
        'b.as': [
          "import { A } from './a'",
          'export interface B {\n  a?: A\n}',
          'annotate A {\n  @expect.maxLength 2\n  x\n}',
        ].join('\n'),
      },
      { compileValidators: true }
    )
    expect(out['a.as']).toContain('$cv(A, ')
    vi.resetModules()
    const { A } = await import(path.join(dir, 'a.as.js'))
    await import(path.join(dir, 'b.as.js'))
    const { compiledCheckFor } = await import('../runtime/compiled-check/registry')
    const { Validator } = await import('../runtime/validator')
    const { COMPILED_ENV } = await import('../runtime/validator-fast-check')
    // (b's block is in A's layout: the check binds to the live type)
    expect(compiledCheckFor(A, COMPILED_ENV)).not.toBeNull()
    expect(new Validator(A).validate({ x: 'abc' }, true)).toBe(false)
    expect(new Validator(A).validate({ x: 'ab' }, true)).toBe(true)
  })

  // (MODEL §12 Q8: not generated — it was generated without compiled checks)
  it('a module with error diagnostics is not generated with compiled checks either', async () => {
    await expect(
      generate(
        { 'bad.as': 'export interface Bad {\n  a: string\n  p: ui.paragraph\n}\n' },
        { compileValidators: true }
      )
    ).rejects.toThrow(/bad\.as: Unknown identifier "ui"/)
  })

  // MODEL §6 + §9 U5: this dense seed has union members in recursive merges (S1.d's union
  // operands in a merge on the S2 / S4 recursion; the oracle's `mergeGraph().uniRec` agrees): a
  // compile error now, the modules are not printed. (It was: registers no check below an alias
  // of a type an import cycle has not built yet.)
  it('a union member in a recursive merge of an import cycle is a compile error', async () => {
    const generated = generate(
      {
        'd0.as': [
          "import { S1, S3 } from './d1'",
          '',
          'export interface S0 {',
          '  e: { e: S3 }',
          '  f?: { f: S1 }',
          '}',
          '',
          'export interface S2 {',
          '  d: { d: S4 }',
          '}',
          '',
          'export interface S4 {',
          '  f?: (((S4 & S4) | null[]) | ((S1 | S1) & S4 & S3[]) | ((string.email | string) | S0 | S0)) | (((S4 | S4 | S2) & (S2 & S1 & S2)) & (S3 | { d: string.email, e: S2 }))',
          '  e: S2',
          '}',
          '',
          'export type T0 = (S4[] & { d: S0, f?: S3 } & S2[]) & ((S1 & S0 & S0) | (S3 | S1))',
          '',
          'annotate S4 {',
          '  @meta.label "m"',
          '  f.e',
          '}',
        ].join('\n'),
        'd1.as': [
          "import { S0, S2, S4 } from './d0'",
          '',
          'export interface S1 {',
          '  e: ((S1 | S2) | ({ d: S1 & S0 & S2 })) & boolean',
          '  d?: (((S2 | S1) & (S4 | S0)) & ((S3 & S4 & S0) | { d?: S2 } | S3) & (S3 | (S4 & S4) | (S0 | S4))) & ({ e: S3[] & S0[] & (boolean | S3) })',
          '}',
          '',
          'export interface S3 {',
          '  e: { e: S2 } & (({ d: S3, e: S4 } | S0 | S4[]) & { d?: { f: S0, d?: S0 }, f: S2 })',
          '}',
          '',
          'export type T1 = ((string.email & S0 & S3) & { e?: S3 } & S4) & S0[]',
          '',
          'export annotate S4 as A1 {',
          '  @meta.label "a"',
          '  f.f',
          '}',
        ].join('\n'),
      },
      { compileValidators: true }
    )
    await expect(generated).rejects.toThrow(
      'union members are not supported in recursive merges; split with named types'
    )
  })
})
