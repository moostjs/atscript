import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * Type paths (`T.a.b`) in `.d.ts`: every step is `TAtscriptField<…, "a">` (MODEL §15 CHAIN-1
 * U1), the field of each object branch that has the prop, so a path through a union is the
 * union of the fields, and an optional prop's step does not index `undefined`.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const types = `
interface I0 {
  @meta.label 'H'
  h: string
  p: phantom
  o: I9
}
interface I9 {
  z: string
}
interface I5 {
  h: number
}
interface I2 {
  work: I0
}
interface I3 {
  work: I5
}
interface I4 {
  other: string
}
interface X {
  work?: I0
}
interface XN {
  work?: I0 | null
}
interface A {
  x: string
}
interface B {
  x: number
}
interface UU {
  u?: A | B
}
export type M0 = I2 | null
export type U = I2 | I3
export type V = I2 | I4
export type E = (I2 | null) & (I2 | null)
export type TA = M0.work.h
export type TO = X.work.o
export interface CH {
  a?: M0.work.h
  b?: U.work.h
  c?: V.work.h
  d?: U.work
  e?: E.work.h
  f?: X.work.o
  g?: XN.work.h
  q?: UU.u.x
  p?: M0.work.p
}
`

/** The generated `.d.ts` of `source` (one file `a.as`), its directory. */
async function dts(source: string): Promise<{ dir: string; text: string }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-dts-paths-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'a.as'), source)
  const repo = await build({ rootDir: dir, entries: ['a.as'], plugins: [tsPlugin()] })
  const diagnostics = await repo.diagnostics()
  const errors = [...diagnostics.values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  const [out] = await repo.generate({ format: 'dts' })
  // (its `/// <reference path="./a.as" />` names the source for editors; tsc does not read `.as`)
  writeFileSync(
    path.join(dir, 'a.as.d.ts'),
    out.content.replace(/^\/\/\/ <reference path=.*\n/m, '')
  )
  return { dir, text: out.content }
}

describe('.d.ts type paths', () => {
  it('renders every step as TAtscriptField; a scalar field as its type', async () => {
    const { text } = await dts(types)
    const line = (prop: string) => text.split('\n').find(l => l.startsWith(`  ${prop}?: `))
    expect(line('a')).toBe('  a?: string /* work.h */')
    expect(line('b')).toBe('  b?: TAtscriptField<TAtscriptField<U, "work">, "h">')
    expect(line('d')).toBe('  d?: TAtscriptField<U, "work">')
    expect(line('f')).toBe('  f?: TAtscriptField<TAtscriptField<X, "work">, "o">')
    // (a phantom field: a comment, as through a type without a union)
    expect(text).toContain('// p: M0.work.p')
    // (a chain alias to a scalar field is a final type)
    expect(text).toContain('const type: TAtscriptTypeFinal<TA>')
  })

  it('type-checks, each path the union of the fields of the branches that have the prop', async () => {
    const { dir } = await dts(types)
    writeFileSync(
      path.join(dir, 'use.ts'),
      [
        "import type { CH, TO } from './a.as'",
        'type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false',
        'type P<K extends keyof CH> = Exclude<CH[K], undefined>',
        "export const a: Eq<P<'a'>, string> = true",
        "export const b: Eq<P<'b'>, string | number> = true",
        "export const c: Eq<P<'c'>, string> = true",
        "export const e: Eq<P<'e'>, string> = true",
        "export const f: Eq<P<'f'>['z'], string> = true",
        "export const g: Eq<P<'g'>, string> = true",
        "export const q: Eq<P<'q'>, string | number> = true",
        "export const o: Eq<TO['z'], string> = true",
      ].join('\n')
    )
    const globals = path.resolve(__dirname, '../../test/fixtures/atscript.d.ts')
    const program = ts.createProgram([path.join(dir, 'use.ts'), globals], {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      types: [],
      paths: { '@atscript/typescript/utils': [path.resolve(__dirname, '../utils.ts')] },
    })
    const messages = ts
      .getPreEmitDiagnostics(program)
      .filter(d => d.file?.fileName.startsWith(dir))
      .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    expect(messages).toEqual([])
  }, 60_000)
})
