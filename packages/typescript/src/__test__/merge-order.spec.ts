import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { build as bundle } from 'rolldown'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * What a module builds does not depend on the order it is evaluated in: the order of the
 * declarations in a file (a merge member, an alias, a block written after or before the merge),
 * nor the order of the modules of an import cycle (a member, an `annotate … as` target in a module
 * evaluated later). And the merge rule applies wherever a merge's slot can be matched member by
 * member — at the top of an intersection through `X | null`, a merge alias merged again, one node
 * reached twice — while the shapes it cannot match resolve to `never`, with a warning.
 *
 * The modules are evaluated by Node (native ESM, as an application loads them), one process per
 * load order, interpreted and with compiled validators. They import the runtime bundled once for
 * this file, so each process is a plain `node` (no TypeScript loader).
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const root = path.resolve(__dirname, '../../../..')
/** the runtime (`../utils.ts`) bundled into one ES module, the generated modules' import */
let utils = ''
beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-order-utils-'))
  dirs.push(dir)
  utils = path.join(dir, 'utils.mjs')
  await bundle({
    input: path.resolve(__dirname, '../utils.ts'),
    platform: 'node',
    logLevel: 'warn',
    output: { file: utils, format: 'esm' },
  })
})

interface TBuilt {
  dir: string
  messages: string[]
  /** the build's failure (MODEL §12 Q8: a module with error diagnostics is not generated) */
  failed?: string
}

async function generate(files: Record<string, string>, compiled: boolean): Promise<TBuilt> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-order-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}')
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators: compiled })],
  })
  const messages = [...(await repo.diagnostics()).entries()].flatMap(([id, ms]) =>
    ms.map(m => `${path.basename(id)}:${m.range.start.line} ${m.severity} ${m.message}`)
  )
  let outs
  try {
    outs = await repo.generate({ format: 'js' })
  } catch (error) {
    // (MODEL §12 Q8: a module with error diagnostics is not generated)
    if (!messages.some(m => / 1 /.test(m))) {
      throw error
    }
    return { dir, messages, failed: (error as Error).message }
  }
  for (const out of outs) {
    writeFileSync(
      path.join(dir, `${path.basename(out.source)}.js`),
      out.content
        .replaceAll('"@atscript/typescript/utils"', JSON.stringify(utils))
        .replace(/from "\.\/([^"]+)\.as"/g, 'from "./$1.as.js"')
    )
  }
  return { dir, messages }
}

/**
 * The probes' results with the modules imported in `order` (a fresh Node process): each probe
 * `T:path` gives `key` there (`|` between the nodes a path reaches, `-` unset); `T=value` the
 * validator's verdict on JSON `value` (`P` / `F`).
 */
function evaluate(dir: string, order: string[], probes: string[], key: string): string[] {
  const loader = path.join(dir, `load-${order.join('-')}.mjs`)
  writeFileSync(
    loader,
    [
      "import { pathToFileURL } from 'url'",
      "for (const k of ['BLUE','BOLD','BOLD_OFF','COLOR_OFF','CYAN','DIM','DIM_OFF','GREEN','RED','RESET','UNDERSCORE','UNDERSCORE_OFF','YELLOW']) globalThis['__DYE_' + k + '__'] ??= ''",
      'const M = {}',
      `for (const f of ${JSON.stringify(order)}) Object.assign(M, await import(pathToFileURL(${JSON.stringify(dir)} + '/' + f + '.js').href))`,
      "const at = (t, p) => { let ns = [t]; for (const k of p.split('.').filter(Boolean)) ns = ns.flatMap(function into(n) { const ty = n.type; if (k === '[]') return ty.kind === 'array' ? [ty.of] : []; if (ty.kind === 'object') return ty.props.has(k) ? [ty.props.get(k)] : []; if (ty.kind === 'union' || ty.kind === 'intersection') return ty.items.filter(i => !(i.type.kind === '' && i.type.designType === 'null')).flatMap(into); return [] }); return ns }",
      `const key = ${JSON.stringify(key)}`,
      `const out = ${JSON.stringify(probes)}.map(q => {`,
      "  const eq = q.indexOf('=')",
      "  if (eq > 0) { const [t, v] = [q.slice(0, eq), JSON.parse(q.slice(eq + 1))]; return M[t].validator({ unknownProps: 'ignore' }).validate(v, true) ? 'P' : 'F' }",
      "  const [t, p = ''] = q.split(':')",
      "  return at(M[t], p).map(n => { const v = n.metadata.get(key); return v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v.length ?? v) : String(v) }).join('|') || '(none)'",
      '})',
      'console.log(JSON.stringify(out))',
    ].join('\n')
  )
  const run = spawnSync(process.execPath, [loader], { encoding: 'utf8', cwd: root })
  const last = run.stdout.trim().split('\n').at(-1) ?? ''
  if (!last.startsWith('[')) {
    return [
      `THROW ${run.stderr.split('\n').find(l => /Error/.test(l)) ?? run.stderr.slice(0, 200)}`,
    ]
  }
  return JSON.parse(last)
}

/**
 * Builds `files` (interpreted and compiled) and expects `want` from `probes` in every load order
 * in `orders`.
 */
async function expectInOrders(
  files: Record<string, string>,
  orders: string[][],
  probes: string[],
  want: string[],
  key = 'meta.label'
) {
  for (const compiled of [false, true]) {
    const { dir, messages } = await generate(files, compiled)
    expect(messages.filter(m => / 1 /.test(m))).toEqual([])
    for (const order of orders) {
      expect({ compiled, order, got: evaluate(dir, order, probes, key) }).toEqual({
        compiled,
        order,
        got: want,
      })
    }
  }
}

describe('declaration order in a file', { timeout: 120_000 }, () => {
  it('a merge member declared after the merge is in its nested slots', async () => {
    await expectInOrders(
      {
        'm.as': [
          "export interface I1 {\n  @meta.label 'L4'\n  c: string\n}",
          "export interface I0 {\n  work: {\n    @meta.label 'L1'\n    c?: string\n  }\n}",
          'export type M1 = I0 & {\n  work?: P0\n}',
          'export type P0 = I1',
        ].join('\n'),
      },
      [['m.as']],
      ['M1:work.c'],
      ['L4']
    )
  })

  it('a block on a merge written above its declaration keeps its entry', async () => {
    await expectInOrders(
      {
        'm.as': [
          'export interface I0 {\n  b: string\n}',
          'annotate M0 {\n  @expect.maxLength 5\n  work.b\n}',
          'export interface I1 {\n  work: I0\n}',
          'export type M0 = I1 & {\n  work: {\n    b: string\n  }\n}',
        ].join('\n'),
      },
      [['m.as']],
      ['M0:work.b', 'M0={"work":{"b":"abcdef"}}', 'M0={"work":{"b":"abc"}}'],
      ['5', 'F', 'P'],
      'expect.maxLength'
    )
  })

  it('a member whose prop is an array alias declared later merges at the element', async () => {
    await expectInOrders(
      {
        'm.as': [
          'export interface I3 {\n  @expect.maxLength 8\n  c: string\n}',
          'export interface I4 {\n  list?: {\n    @expect.maxLength 5\n    c: string\n  }[]\n}',
          'export type M0 = I4 & {\n  list?: L0\n}',
          'export type L0 = I3[]',
        ].join('\n'),
      },
      [['m.as']],
      ['M0:list.[].c', 'M0={"list":[{"c":"abcdef"}]}'],
      ['8', 'P'],
      'expect.maxLength'
    )
  })
})

describe('evaluation order of an import cycle', { timeout: 120_000 }, () => {
  it('a merge built before a member of a later module has its binding keeps the member', async () => {
    await expectInOrders(
      {
        'm2.as': [
          "import { I3 } from './m3'",
          'export type P0 = I3',
          'export interface I0 {\n  b: string\n}',
          "annotate I0 {\n  @meta.label 'L19'\n  b\n}",
        ].join('\n'),
        'm3.as': [
          "import { I0, P0 } from './m2'",
          'export interface I3 extends I0 {\n}',
          'export type M0 = P0 & {\n  b?: string\n}',
        ].join('\n'),
      },
      [
        ['m2.as', 'm3.as'],
        ['m3.as', 'm2.as'],
      ],
      ['M0:b'],
      ['L19']
    )
  })

  it('`annotate … as` of a type of a module evaluated later applies its entries', async () => {
    await expectInOrders(
      {
        'm2.as': [
          "import { I4 } from './m3'",
          'export interface I3 {\n  a: string\n}',
          "export annotate I4 as X0 {\n  @meta.label 'X'\n  b\n}",
        ].join('\n'),
        'm3.as': [
          "import { I3 } from './m2'",
          'export interface I0 {\n  next?: I3\n}',
          'export interface I4 {\n  b: string\n}',
        ].join('\n'),
      },
      [
        ['m2.as', 'm3.as'],
        ['m3.as', 'm2.as'],
      ],
      ['X0:b', 'I4:b'],
      ['X', '-']
    )
  })

  it('an `annotate … as` entry through a chain into a module evaluated later', async () => {
    const files = {
      'a.as':
        "import { D } from './d'\nexport interface A {\n  x: string\n  n?: { k: string }\n  d?: D\n}\n",
      'b.as':
        "import { A } from './a'\nexport interface BA {\n  x: A.x\n  n?: A.n\n}\nexport type BT = BA\n",
      'c.as':
        "import { BA, BT } from './b'\nexport annotate BA as CA {\n  @meta.label 'CA'\n  n.k\n}\nexport interface C {\n  v: BT\n}\n",
      'd.as': "import { C } from './c'\nexport type D = C & { d: string }\n",
    }
    const names = Object.keys(files)
    await expectInOrders(
      files,
      names.map(first => [first, ...names.filter(n => n !== first)]),
      ['CA:n.k', 'BA:n.k', 'A:n.k'],
      ['CA', '-', '-']
    )
  })

  it("an alias's entries are below a block on the alias, in any order of the cycle", async () => {
    await expectInOrders(
      {
        'm0.as': [
          "import { X0 } from './m1'",
          'export interface I0 {\n  b: string\n}',
          'annotate X0 {\n  @expect.maxLength 8\n  b\n}',
        ].join('\n'),
        'm1.as': [
          "import { I0 } from './m0'",
          'export annotate I0 as X0 {\n  @expect.maxLength 3\n  b\n}',
        ].join('\n'),
      },
      [
        ['m0.as', 'm1.as'],
        ['m1.as', 'm0.as'],
      ],
      ['X0:b', 'I0:b', 'X0={"b":"abcdef"}'],
      ['8', '-', 'P'],
      'expect.maxLength'
    )
  })

  it('an `as` alias of a plain alias of a type of a module evaluated later', async () => {
    await expectInOrders(
      {
        'm0.as': [
          "import { I1 } from './m2'",
          'export type P0 = I1',
          "export annotate P0 as X0 {\n  @meta.label 'L3'\n  list.a\n}",
        ].join('\n'),
        'm2.as': [
          "import { P0 } from './m0'",
          'export type P1 = P0',
          'export interface I1 {\n  list: {\n    a: string\n  }[]\n}',
        ].join('\n'),
      },
      [
        ['m0.as', 'm2.as'],
        ['m2.as', 'm0.as'],
      ],
      ['X0:list.[].a', 'I1:list.[].a', 'X0={"list":[{"a":"x"}]}'],
      ['L3', '-', 'P']
    )
  })
})

describe('merges the rule matches member by member', { timeout: 120_000 }, () => {
  const late = (target: string, entry: string, key = "@meta.description 'late'") =>
    `annotate ${target} {\n  ${key}\n  ${entry}\n}`

  it('through `X | null` at the top of an intersection, and a nullable alias', async () => {
    await expectInOrders(
      {
        'a.as': [
          "export interface X {\n  @meta.label 'X'\n  name: string\n}",
          'export interface Z {\n  z?: string\n}',
          'export type XN = X | null',
          'export type T02 = (X | null) & Z',
          'export type T03 = X & (Z | null)',
          'export type T07 = XN & Z',
          'export interface I1 {\n  p: (X | null) & Z\n}',
          'export type T18 = { p: (X | null) & Z }',
        ].join('\n'),
        'b.as': ["import { X } from './a'", late('X', 'name')].join('\n'),
      },
      [['a.as', 'b.as']],
      ['T02:name', 'T03:name', 'T07:name', 'I1:p.name', 'T18:p.name'],
      ['late', 'late', 'late', 'late', 'late'],
      'meta.description'
    )
  })

  it('a merge alias merged again in a merge around it is its own merged node', async () => {
    await expectInOrders(
      {
        'm.as': [
          'export interface I2 {\n  c: string\n}',
          'export interface I0 {\n  @expect.maxLength 5\n  c: string\n  next?: I2\n}',
          'export interface I1 {\n  next?: I0 | null\n}',
          'export type M0 = I0 & I1',
          'export type H = M0 & {\n  z?: string\n}',
          'export interface H0 {\n  w: M0 & {\n    a?: string\n  }\n}',
        ].join('\n'),
      },
      [['m.as']],
      ['H:next.c', 'M0:next.c', 'H0:w.next.c', 'H={"next":{"c":"abcdef"}}'],
      ['5', '5', '5', 'F'],
      'expect.maxLength'
    )
  })

  it('two members reaching one node through a nullable union keep its override', async () => {
    await expectInOrders(
      {
        'm.as': [
          'export interface A {\n  b?: string\n}',
          'export interface I1 {\n  work?: A | null\n}',
          'export interface I2 extends I1 {\n  z?: string\n}',
          'export type M = I1 & I2',
          "annotate I1 {\n  @meta.label 'L11'\n  work.b\n}",
        ].join('\n'),
      },
      [['m.as']],
      ['M:work.b'],
      ['L11']
    )
  })

  it('`M1 & M1` is `M1`: its members and their blocks', async () => {
    await expectInOrders(
      {
        'a.as': [
          'export interface Address {\n  @expect.maxLength 20\n  city: string\n}',
          'export interface A {\n  home: Address\n}',
          'export interface B {\n  home?: Address | null\n}',
          'export type M1 = A & B',
          'export type M4 = M1 & M1',
        ].join('\n'),
        'b.as': [
          "import { A, B } from './a'",
          'annotate B {\n  @expect.maxLength 5\n  home.city\n}',
          'annotate A {\n  @expect.maxLength 6\n  home.city\n}',
        ].join('\n'),
      },
      [['a.as', 'b.as']],
      ['M1:home.city', 'M4:home.city'],
      ['5', '5'],
      'expect.maxLength'
    )
  })

  it('`type P = (Base)` is a plain alias: a block on it is a block on Base', async () => {
    await expectInOrders(
      {
        'a.as': [
          'export interface Base {\n  name: string\n}',
          'export type P = (Base)',
          'export interface H {\n  p: P\n}',
        ].join('\n'),
        'b.as': ["import { P } from './a'", 'annotate P {\n  @expect.maxLength 4\n  name\n}'].join(
          '\n'
        ),
      },
      [['a.as', 'b.as']],
      ['Base:name', 'P:name', 'H:p.name'],
      ['4', '4', '4'],
      'expect.maxLength'
    )
  })
})

describe('merges the rule cannot match member by member', { timeout: 120_000 }, () => {
  const files = {
    'a.as': [
      'export interface X {\n  name: string\n}',
      'export interface Y {\n  name: string\n  y?: string\n}',
      'export interface Z {\n  z?: string\n}',
      'export interface A {\n  u: X | Y\n  t: [X]\n}',
      'export interface B {\n  u: X | Z\n  t: [Z]\n}',
      'export type M = A & B',
      'export type T09 = { p: X | Y } & { p: Z }',
      'export type T11 = { p: X[][] } & { p: Z[][] }',
      'export type T12 = { p: (X | Y)[] } & { p: Z[] }',
      'export type T8 = { p: X } & { p: string }',
      // (still merged: scalar unions, a nullable member, a union with scalars only on one side)
      "export type K1 = { p: 'a' | 'b' } & { p: 'b' | 'c' }",
      'export type K2 = { p: X | null } & { p: Z | null }',
      'export type K3 = { p: X | string } & { p: string }',
    ].join('\n'),
  }

  it('resolve to `never` with a warning, in every view', async () => {
    const { buildJsonSchema } = await import('../runtime/json-schema')
    const { flattenAnnotatedType } = await import('../runtime/flatten')
    const { serializeAnnotatedType, deserializeAnnotatedType } =
      await import('../runtime/serialize')
    for (const compiled of [false, true]) {
      const { dir, messages } = await generate(files, compiled)
      expect(messages.filter(m => / 2 /.test(m)).sort()).toEqual(
        [
          'a.as:18 2 Intersection of unions of objects cannot be merged at "M.u"; the type resolves to never',
          'a.as:18 2 Intersection of tuples of objects cannot be merged at "M.t"; the type resolves to never',
          'a.as:19 2 Intersection of unions of objects cannot be merged at "T09.p"; the type resolves to never',
          'a.as:20 2 Intersection of arrays of arrays of objects cannot be merged at "T11.p"; the type resolves to never',
          'a.as:21 2 Intersection of arrays of unions of objects cannot be merged at "T12.p"; the type resolves to never',
          'a.as:22 2 Intersection of values with nothing in common cannot be merged at "T8.p"; the type resolves to never',
        ].sort()
      )
      const m = await import(path.join(dir, 'a.as.js'))
      const never = { kind: '', designType: 'never' }
      for (const [t, p] of [
        ['M', 'u'],
        ['M', 't'],
        ['T09', 'p'],
        ['T11', 'p'],
        ['T12', 'p'],
        ['T8', 'p'],
      ]) {
        const type = m[t]
        expect((type.type as any).props.get(p).type).toMatchObject(never)
        // (the validator, the JSON schemas, the deserialized copy and the flattened fields agree)
        expect(type.validator({ unknownProps: 'ignore' }).validate({ [p]: {} }, true)).toBe(false)
        expect(buildJsonSchema(type).properties[p]).toEqual({ not: {} })
        expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
        const copy = deserializeAnnotatedType(serializeAnnotatedType(type))
        expect(copy.type.props.get(p).type).toMatchObject(never)
        expect(flattenAnnotatedType(type).get(p)?.type).toMatchObject(never)
      }
      for (const t of ['K1', 'K2', 'K3']) {
        expect([t, m[t].type.props.get('p').type.designType]).not.toEqual([t, 'never'])
      }
    }
  })
})

describe('diagnostics', { timeout: 120_000 }, () => {
  it('an entry through an array alias checks its leaf, not the array', async () => {
    const { messages, failed } = await generate(
      {
        'm.as': [
          'export type L0 = I0[]',
          'export interface I0 {\n  a: string\n}',
          'export interface H0 {\n  v: L0\n}',
          "annotate H0 {\n  @expect.pattern '^[^z]*$'\n  v.a\n  @expect.pattern '^[^z]*$'\n  v\n}",
        ].join('\n'),
      },
      false
    )
    expect(messages).toEqual([
      expect.stringMatching(/^m\.as:10 1 Expected type is \(string\), got "?array/),
    ])
    // (MODEL §12 Q8: the module is not generated; it was)
    expect(failed).toMatch(/m\.as: Expected type is \(string\)/)
  })

  it('aliases reaching themselves are reported, not a stack overflow', async () => {
    const { messages, failed } = await generate(
      {
        'm.as': [
          'export type A1 = A2',
          'export type A2 = A1',
          'export type S = S',
          'export interface U {\n  name: string\n  x?: A1\n}',
        ].join('\n'),
      },
      false
    )
    expect(messages).toEqual([
      'm.as:0 1 Circular type alias "A2": it resolves to itself',
      'm.as:1 1 Circular type alias "A1": it resolves to itself',
      'm.as:2 1 Circular type alias "S": it resolves to itself',
      'm.as:5 1 Circular type alias "A1": it resolves to itself',
    ])
    // (MODEL §12 Q8: the module is not generated; it was)
    expect(failed).toMatch(/m\.as: Circular type alias/)
  })
})
