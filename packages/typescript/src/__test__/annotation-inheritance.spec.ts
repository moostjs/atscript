import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * The metadata of an inherited prop does not depend on which file declares the type inheriting
 * it: an `extends` chain, an intersection and an `annotate … as` alias, in the base's file or in
 * other files, give every prop the same metadata — for annotations without a spec (`unknownAnnotation: 'allow'`)
 * of every arity (0–3 arguments, of every kind: string, number, `true`, a name, a backtick
 * query, an empty argument) and multiplicity (written 1–3 times), and annotations with a spec,
 * single and multiple.
 */

const KINDS = ["'s'", '2', 'true', 'User.email', '`a = 1`', '']

/** The props of the base interface: one per annotation form. */
function baseProps(): string[] {
  const props: string[] = []
  for (let arity = 0; arity <= 3; arity++) {
    for (let times = 1; times <= 3; times++) {
      for (let kind = 0; kind < (arity === 0 ? 1 : KINDS.length); kind++) {
        const lines: string[] = []
        for (let t = 0; t < times; t++) {
          const args = Array.from({ length: arity }, (_, k) => {
            const value = KINDS[(kind + k + t) % KINDS.length]
            // (an empty argument only between others: `@x , 'y'`)
            return value === '' && k === arity - 1 ? `'t${t}'` : value
          })
          lines.push(
            `  @x.a${arity}m${times}k${kind}${args.length > 0 ? ` ${args.join(', ')}` : ''}`
          )
        }
        props.push(`${lines.join('\n')}\n  p${arity}m${times}k${kind}: string`)
      }
    }
  }
  props.push(
    `  @meta.label 'one'\n  @expect.pattern "^a", "i"\n  @expect.pattern "b$"\n  q: string`
  )
  return props
}

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function load(files: Record<string, string>, entries: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-inherit-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'user.as'), 'export interface User {\n  email: string\n}\n')
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({
    rootDir: dir,
    entries: [...entries, 'user.as'],
    unknownAnnotation: 'allow',
    plugins: [tsPlugin()],
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  vi.resetModules()
  const modules: Record<string, Record<string, any>> = {}
  for (const entry of entries) {
    modules[entry] = await import(path.join(dir, `${entry}.js`))
  }
  return modules
}

/** The metadata of every prop of `type` (values as JSON). */
const metadataOf = (type: any) =>
  Object.fromEntries(
    [...type.type.props].map(([key, prop]: [string, any]) => [
      key,
      JSON.stringify([...prop.metadata].sort(([a], [b]) => (a < b ? -1 : 1))),
    ])
  )

describe('inherited props have the same metadata whichever file inherits them', () => {
  it('an extends chain in one file and across files, every annotation arity and multiplicity', async () => {
    const base = `import { User } from './user'\nexport interface B {\n${baseProps().join('\n')}\n}\n`
    const same = await load(
      {
        'same.as': `${base}export interface A extends B {}\nexport interface A2 extends A {\n  own?: string\n}\nexport type I = B & { own?: string }\nexport annotate B as AB {}\n`,
      },
      ['same.as']
    )
    const across = await load(
      {
        'base.as': base,
        'mid.as': "import { B } from './base'\nexport interface A extends B {}\n",
        'top.as': "import { A } from './mid'\nexport interface A2 extends A {\n  own?: string\n}\n",
        'other.as':
          "import { B } from './base'\nexport type I = B & { own?: string }\nexport annotate B as AB {}\n",
      },
      ['base.as', 'mid.as', 'top.as', 'other.as']
    )
    const expected = metadataOf(same['same.as'].B)
    expect(Object.keys(expected).length).toBe(58)
    for (const [where, type] of [
      ['same file: A', same['same.as'].A],
      ['same file: A2', same['same.as'].A2],
      ['across files: B', across['base.as'].B],
      ['across files: A', across['mid.as'].A],
      ['across files: A2', across['top.as'].A2],
      ['same file: an intersection', same['same.as'].I],
      ['same file: an annotate … as alias', same['same.as'].AB],
      ['across files: an intersection', across['other.as'].I],
      ['across files: an annotate … as alias', across['other.as'].AB],
    ] as const) {
      const actual = metadataOf(type)
      delete actual.own
      expect([where, actual]).toEqual([where, expected])
    }
    // (a repeated annotation is a list, a single one its first argument)
    expect(JSON.parse(expected.p1m2k0)).toEqual([['x.a1m2k0', ['s', 2]]])
    expect(JSON.parse(expected.p1m1k0)).toEqual([['x.a1m1k0', 's']])
  })
})

/*
 * An `annotate … as` entry overriding a prop's annotation without a spec gives the prop the
 * entry's occurrences, shaped by them alone (written once: a single value; more than once: a
 * list), whatever the target wrote — like a hand-written copy declaring them, a mutating
 * `annotate` entry, and everything built from the alias (`extends`, an intersection, an alias
 * of it). Every arity (0–3 arguments of every kind) × target multiplicity (1–3) × entry
 * multiplicity (1–3), in one file and across files.
 */
function overrideLines(arity: number, times: number, kind: number, shift: number): string[] {
  const lines: string[] = []
  for (let t = 0; t < times; t++) {
    const args = Array.from({ length: arity }, (_, k) => {
      const value = KINDS[(kind + k + t + shift) % KINDS.length]
      return value === '' && k === arity - 1 ? `'s${shift}t${t}'` : value
    })
    lines.push(`@x.a${arity}k${kind}${args.length > 0 ? ` ${args.join(', ')}` : ''}`)
  }
  return lines
}

function overrideProps() {
  const base: string[] = []
  const entries: string[] = []
  const copy: string[] = []
  for (let arity = 0; arity <= 3; arity++) {
    for (let mb = 1; mb <= 3; mb++) {
      for (let mo = 1; mo <= 3; mo++) {
        for (let kind = 0; kind < (arity === 0 ? 1 : KINDS.length); kind++) {
          const name = `p${arity}b${mb}o${mo}k${kind}`
          base.push(...overrideLines(arity, mb, kind, 0).map(l => `  ${l}`), `  ${name}: string`)
          const over = overrideLines(arity, mo, kind, 1).map(l => `  ${l}`)
          entries.push(...over, `  ${name}`)
          copy.push(...over, `  ${name}: string`)
        }
      }
    }
  }
  // a prop no entry names keeps the target's
  base.push("  @x.keep 'a'\n  @x.keep 'b'\n  q: string")
  copy.push("  @x.keep 'a'\n  @x.keep 'b'\n  q: string")
  return { base: base.join('\n'), entries: entries.join('\n'), copy: copy.join('\n') }
}

describe('annotate … as entries override annotations without a spec by their own shape', () => {
  it('every arity × target multiplicity × entry multiplicity, in one file and across files', async () => {
    const { base, entries, copy } = overrideProps()
    const head = "import { User } from './user'\n"
    const target = `export interface B {\n${base}\n}\nexport interface B2 {\n${base}\n}\n`
    const alias = `export annotate B as AB {\n${entries}\n}\nexport annotate AB as AB2 {}\nexport type T = AB\nexport interface E extends AB {}\nexport type I = AB & { own?: string }\nannotate B2 {\n${entries}\n}\n`
    const hand = `export interface H {\n${copy}\n}\n`
    const same = await load({ 'same.as': head + target + alias + hand }, ['same.as'])
    const across = await load(
      {
        'base.as': head + target,
        'other.as': `${head}import { B, B2 } from './base'\n${alias}${hand}`,
      },
      ['base.as', 'other.as']
    )
    const expected = metadataOf(same['same.as'].H)
    expect(Object.keys(expected).length).toBe(1 + (1 + 3 * KINDS.length) * 9)
    const cases: Array<[string, any]> = []
    for (const [where, mod] of [
      ['same file', same['same.as']],
      ['across files', across['other.as']],
    ] as const) {
      for (const name of ['AB', 'AB2', 'T', 'E', 'I']) {
        cases.push([`${where}: ${name}`, mod[name]])
      }
    }
    cases.push(['same file: mutating annotate', same['same.as'].B2])
    cases.push(['across files: mutating annotate', across['base.as'].B2])
    for (const [where, type] of cases) {
      const actual = metadataOf(type)
      delete actual.own
      expect([where, actual]).toEqual([where, expected])
    }
    // (written once over a list: a single value; twice over a single one: a list)
    expect(JSON.parse(expected.p1b3o1k0)).toEqual([['x.a1k0', 2]])
    expect(JSON.parse(expected.p1b1o2k0)).toEqual([['x.a1k0', [2, true]]])
  })
})
