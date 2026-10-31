import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'
import { Validator } from '../runtime/validator'

/*
 * A mutating `annotate S { … }` is part of S's definition, live everywhere: every type
 * referencing or derived from S sees it — aliases (chains of 1–3), `extends` (of S and of an
 * alias of S), intersections (merged and kept at runtime), chain references (`S.name`), union
 * members, arrays, tuples, nested props, `annotate S as X` aliases (their own entries over S's
 * annotates) and aliases of those — whatever the declaration order, the file holding the block
 * (S's file before or after S, the file of the positions first or last, a third file imported by
 * it, an import cycle loaded from either side), the load order and the modules reading the
 * positions. A path annotate copying a type (`annotate S { addr.city }`) and an annotate of that
 * type (`annotate Addr { zip }`) commute: the override reads the type's annotates, in every order and
 * placement. Checked: metadata at every path, the interpreted and compiled verdicts, the runtime
 * and bundled JSON schemas, and the serialization round trip — the same in every placement, with
 * the annotations where the live rule puts them.
 *
 * A block in a module that none of the modules using S imports (and that S's file does not
 * import) is reported (a warning): it applies only when that module is part of the build.
 *
 * `ATSCRIPT_LARGE_TESTS=1`: every source × placement × placement of the commuting pair × load
 * order (the default runs a seeded sample).
 */

const LARGE = !!process.env.ATSCRIPT_LARGE_TESTS

/** The source type `S` (file `s.as`), as an interface, a type, and an `annotate … as` alias. */
const SOURCES: Record<string, string> = {
  'interface':
    "import { Addr } from './a'\nexport interface S {\n  name: string\n  k?: string\n  addr?: Addr\n}\n",
  'type':
    "import { Addr } from './a'\nexport type S = {\n  name: string\n  k?: string\n  addr?: Addr\n}\n",
  'annotate as':
    "import { Addr } from './a'\nexport interface SB {\n  name: string\n  k?: string\n  addr?: Addr\n}\nexport annotate SB as S {}\n",
}

const ADDR = 'export interface Addr {\n  city: string\n  zip?: string\n}\n'

/** The block annotating `S`: a prop of its own and a path through `Addr` (copied). */
const MUT =
  "annotate S {\n  @meta.label 'MN'\n  @expect.maxLength 2\n  name\n  @meta.label 'MC'\n  @expect.maxLength 3\n  addr.city\n}\n"
/** The block annotating `Addr` (the type the path overrides). */
const QUAD = "annotate Addr {\n  @meta.label 'AZ'\n  @expect.maxLength 2\n  zip\n}\n"

/** The positions (file `p.as`): name → declaration, and where `S`'s props are in it. */
const POSITIONS: Record<string, { decl: string; at: string; wrap: (v: unknown) => unknown }> = {
  AL1: { decl: 'export type AL1 = S', at: '', wrap: v => v },
  AL2: { decl: 'export type AL2 = AL1', at: '', wrap: v => v },
  AL3: { decl: 'export type AL3 = AL2', at: '', wrap: v => v },
  E: { decl: 'export interface E extends S {\n  e?: string\n}', at: '', wrap: v => v },
  EA: { decl: 'export interface EA extends AL1 {\n  e?: string\n}', at: '', wrap: v => v },
  IM: { decl: 'export type IM = S & { e?: string }', at: '', wrap: v => v },
  // (an intersection merged at the top: `r` is an object; inside it, `r` is `IR`'s own `r`, the
  // merged object again — shared, recursive)
  IR: { decl: 'export interface IR {\n  r?: S & IR\n}', at: '.r', wrap: v => ({ r: v }) },
  IRR: {
    decl: 'export interface IRR {\n  r?: S & IR\n}',
    at: '.r.r',
    // (the outer `r` an `S` too: a valid name)
    wrap: v => ({ r: { name: 'ab', r: v } }),
  },
  U: { decl: 'export type U = S | null', at: '<0>', wrap: v => v },
  A: { decl: 'export type A = S[]', at: '[]', wrap: v => [v] },
  TU: { decl: 'export type TU = [S]', at: '<0>', wrap: v => [v] },
  N: { decl: 'export interface N {\n  t: S\n}', at: '.t', wrap: v => ({ t: v }) },
  X: { decl: 'export annotate S as X {}', at: '', wrap: v => v },
  XO: {
    decl: "export annotate S as XO {\n  @meta.label 'XO'\n  name\n}",
    at: '',
    wrap: v => v,
  },
  XA: { decl: 'export type XA = XO', at: '', wrap: v => v },
}

/** The chain reference `S.name` (a type of the name's own). */
const CHAIN = 'export type C = S.name'

/** Where a block is: its file, first or last in it (the file imports `S` / `Addr` as needed). */
type TPlace =
  | 's-first'
  | 's-last'
  | 'p-first'
  | 'p-last'
  | 'm-imported'
  | 'm-loaded-first'
  | 'm-loaded-last'
  | 'cycle-s'
  | 'cycle-p'
  | 'cycle-m'

const PLACES: TPlace[] = [
  's-first',
  's-last',
  'p-first',
  'p-last',
  'm-imported',
  'm-loaded-first',
  'm-loaded-last',
  'cycle-s',
  'cycle-p',
  'cycle-m',
]

/** Where the `Addr` block is. */
type TQuadPlace = 'a-last' | 'a-first' | 's-last' | 'with-mut' | 'before-mut'
const QUAD_PLACES: TQuadPlace[] = ['a-last', 'a-first', 's-last', 'with-mut', 'before-mut']

/**
 * The blocks reported as unreachable: a block is reachable when the file declaring its target
 * imports the block's file, or every file using the target does (directly or not). `S` is used
 * by `p.as`; `Addr` by `s.as` (and the file of the `Addr` block, through `QA`).
 */
function unreachable(c: Pick<TCase, 'place' | 'quad'>): string[] {
  const out: string[] = []
  if (c.place === 'm-loaded-first' || c.place === 'm-loaded-last') {
    out.push('S')
  }
  // (the `Addr` block with the `S` block in `p.as` / `m.as`: `s.as` does not import it — unless
  // `s.as` imports `p.as`, the cycle)
  if (
    (c.quad === 'with-mut' || c.quad === 'before-mut') &&
    (c.place.startsWith('p') || c.place.startsWith('m') || c.place === 'cycle-m')
  ) {
    out.push('Addr')
  }
  return out
}

interface TCase {
  source: string
  place: TPlace
  quad: TQuadPlace
  /** load the cycle from `p` first (else from `s` / `m`) */
  pFirst: boolean
}

/** The files of a case, the order they are loaded in, and the module of the positions. */
function filesOf(c: TCase) {
  const files: Record<string, string[]> = {
    'a.as': [ADDR],
    's.as': [SOURCES[c.source]],
    'p.as': ["import { S } from './s'", ...Object.values(POSITIONS).map(p => p.decl), CHAIN],
    'r.as': [
      "import { AL1, E, XO, C } from './p'",
      'export type RAL = AL1',
      'export interface RN {\n  e: E\n  x?: XO\n  c?: C\n}',
    ],
  }
  const put = (file: string, block: string, first: boolean) => {
    files[file] ??= []
    if (first) {
      // (after the imports: the first statement of a file with imports is one)
      const at = files[file][0]?.startsWith('import') ? 1 : 0
      files[file].splice(at, 0, block)
    } else {
      files[file].push(block)
    }
  }
  const mutFile = c.place.startsWith('s')
    ? 's.as'
    : c.place.startsWith('p')
      ? 'p.as'
      : c.place === 'cycle-s'
        ? 's.as'
        : c.place === 'cycle-p'
          ? 'p.as'
          : 'm.as'
  if (mutFile === 'm.as') {
    files['m.as'] = ["import { S } from './s'", 'export type MZ = string']
  }
  put(mutFile, MUT, c.place.endsWith('first'))
  if (c.place === 'm-imported' || c.place === 'cycle-m') {
    files['p.as'].splice(1, 0, "import { MZ } from './m'", 'export type PZ = MZ')
  }
  if (c.place === 'cycle-m') {
    files['m.as'].splice(1, 0, "import { AL1 } from './p'", 'export type MP = AL1')
  }
  if (c.place === 'cycle-s' || c.place === 'cycle-p') {
    files['s.as'].push("import { E } from './p'\nexport type SQ = E")
  }
  // The `Addr` block (it may need to import `Addr`).
  const quadFile =
    c.quad === 'a-last' || c.quad === 'a-first' ? 'a.as' : c.quad === 's-last' ? 's.as' : mutFile
  if (quadFile !== 'a.as' && quadFile !== 's.as') {
    files[quadFile].splice(1, 0, "import { Addr } from './a'", 'export type QA = Addr')
  }
  if (c.quad === 'before-mut') {
    // (right before the `S` block)
    files[quadFile].splice(files[quadFile].indexOf(MUT), 0, QUAD)
  } else {
    put(quadFile, QUAD, c.quad === 'a-first')
  }
  const text = Object.fromEntries(
    Object.entries(files).map(([name, parts]) => [name, `${parts.join('\n')}\n`])
  )
  const order =
    c.place === 'm-loaded-first'
      ? ['m.as', 'r.as']
      : c.place === 'm-loaded-last'
        ? ['r.as', 'm.as']
        : c.place === 'cycle-s' || c.place === 'cycle-p'
          ? c.pFirst
            ? ['p.as', 'r.as']
            : ['s.as', 'r.as']
          : c.place === 'cycle-m'
            ? c.pFirst
              ? ['p.as', 'r.as']
              : ['m.as', 'r.as']
            : ['r.as']
  return { text, order }
}

/**
 * The metadata of `type` at every path (a type entered twice at most per path: a merge is one
 * object wherever its members are merged — `IRR.r` is `IR.r`'s type, and `IRR.r.r` is `IR.r`).
 */
function metaTree(type: TAtscriptAnnotatedType): Record<string, string> {
  const out: Record<string, string> = {}
  const visit = (node: any, at: string, stack: unknown[]) => {
    out[at || '.'] = JSON.stringify(
      [...node.metadata].sort(([a]: [string], [b]: [string]) => (a < b ? -1 : 1))
    )
    const t = node.type
    if (stack.filter(x => x === t).length > 1 || stack.length > 6) {
      return
    }
    const s = [...stack, t]
    if (t.kind === 'object') {
      for (const [k, p] of t.props) {
        visit(p, `${at}.${k}`, s)
      }
    } else if (t.kind === 'array') {
      visit(t.of, `${at}[]`, s)
    } else if (t.items) {
      t.items.forEach((item: unknown, i: number) => visit(item, `${at}<${i}>`, s))
    }
  }
  visit(type, '', [])
  return out
}

const LABEL_MN = '[["expect.maxLength",{"length":2}],["meta.label","MN"]]'
const LABEL_XO = '[["expect.maxLength",{"length":2}],["meta.label","XO"]]'
const LABEL_MC = '[["expect.maxLength",{"length":3}],["meta.label","MC"]]'
const LABEL_AZ = '[["expect.maxLength",{"length":2}],["meta.label","AZ"]]'

const VALID = { name: 'ab', addr: { city: 'abc', zip: 'ab' } }
const INVALID = [
  { name: 'abc', addr: { city: 'abc', zip: 'ab' } },
  { name: 'ab', addr: { city: 'abcd', zip: 'ab' } },
  { name: 'ab', addr: { city: 'abc', zip: 'abc' } },
]

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Builds and loads a case; what its positions do (and the live rule's violations). */
async function observe(c: TCase, compileValidators: boolean) {
  const { text, order } = filesOf(c)
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-live-'))
  dirs.push(dir)
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(text)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(text),
    plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators })],
  })
  const diags = [...(await repo.diagnostics()).entries()].flatMap(([id, msgs]) =>
    msgs.map(m => ({ file: path.basename(id), m }))
  )
  const errors = diags.filter(d => d.m.severity === 1).map(d => `${d.file}: ${d.m.message}`)
  const warnings = diags
    .filter(d => d.m.severity === 2 && d.m.message.includes('without importing'))
    .map(d => (d.m.message.includes('"Addr"') ? 'Addr' : 'S'))
    .sort()
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  vi.resetModules()
  for (const file of order) {
    await import(path.join(dir, `${file}.js`))
  }
  const p = await import(path.join(dir, 'p.as.js'))
  const s = await import(path.join(dir, 's.as.js'))
  const a = await import(path.join(dir, 'a.as.js'))
  const r = await import(path.join(dir, 'r.as.js'))
  const violations: string[] = []
  const types: Record<string, TAtscriptAnnotatedType> = {
    'S': s.S,
    ...Object.fromEntries(Object.keys(POSITIONS).map(n => [n, p[n]])),
    'RAL': r.RAL,
    'RN.e': r.RN,
  }
  const out: Record<string, unknown> = {}
  for (const [name, type] of Object.entries(types)) {
    const pos = POSITIONS[name] ?? { at: name === 'RN.e' ? '.e' : '', wrap: (v: unknown) => v }
    const wrap = name === 'RN.e' ? (v: unknown) => ({ e: v }) : pos.wrap
    const meta = metaTree(type)
    const expect = (at: string, want: string) => {
      if (meta[at] !== want) {
        violations.push(`${name} ${at}: ${meta[at]} (want ${want})`)
      }
    }
    expect(`${pos.at}.name`, name === 'XO' || name === 'XA' ? LABEL_XO : LABEL_MN)
    expect(`${pos.at}.addr.city`, LABEL_MC)
    expect(`${pos.at}.addr.zip`, LABEL_AZ)
    const validator = new Validator(type)
    const verdicts = [VALID, ...INVALID].map(v =>
      validator.validate(structuredClone(wrap(v)), true)
    )
    if (JSON.stringify(verdicts) !== '[true,false,false,false]') {
      violations.push(`${name} verdicts ${JSON.stringify(verdicts)}`)
    }
    const schema = buildJsonSchema(type)
    if (JSON.stringify((type as any).toJsonSchema()) !== JSON.stringify(schema)) {
      violations.push(`${name}: the bundled JSON schema is not the runtime one`)
    }
    const copy = deserializeAnnotatedType(JSON.parse(JSON.stringify(serializeAnnotatedType(type))))
    const copyVerdicts = [VALID, ...INVALID].map(v =>
      new Validator(copy).validate(structuredClone(wrap(v)), true)
    )
    if (
      JSON.stringify(metaTree(copy)) !== JSON.stringify(meta) ||
      JSON.stringify(copyVerdicts) !== JSON.stringify(verdicts)
    ) {
      violations.push(`${name}: the serialized copy differs`)
    }
    out[name] = { meta, verdicts, schema }
  }
  // The chain reference: the name's annotations.
  const chain = metaTree(p.C)['.']
  if (chain !== LABEL_MN) {
    violations.push(`C: ${chain} (want ${LABEL_MN})`)
  }
  out.C = chain
  // `Addr` itself: its own block only (not the path's).
  const addr = metaTree(a.Addr)
  if (addr['.city'] !== '[]' || addr['.zip'] !== LABEL_AZ) {
    violations.push(`Addr: city ${addr['.city']}, zip ${addr['.zip']}`)
  }
  out.Addr = addr
  return { errors, warnings, violations, out }
}

function cases(): TCase[] {
  const all: TCase[] = []
  for (const source of Object.keys(SOURCES)) {
    for (const place of PLACES) {
      for (const quad of QUAD_PLACES) {
        for (const pFirst of place.startsWith('cycle') ? [false, true] : [false]) {
          all.push({ source, place, quad, pFirst })
        }
      }
    }
  }
  if (LARGE) {
    return all
  }
  // (a seeded sample: every source × place, a quad placement each, and every quad placement)
  return all.filter((c, i) => i % 3 === 0 || (c.source === 'interface' && c.place === 'p-last'))
}

describe('a mutating annotate is live everywhere', () => {
  for (const compileValidators of [false, true]) {
    it(
      `every position × placement${compileValidators ? ' (compiled)' : ''}`,
      { timeout: 900_000 },
      async () => {
        const problems: string[] = []
        /** The observations of the reachable placements, by source (they must be the same). */
        const baseline = new Map<string, string>()
        for (const c of cases()) {
          const where = `${c.source} / ${c.place}${c.pFirst ? ' (p first)' : ''} / Addr block ${c.quad}`
          const seen = await observe(c, compileValidators)
          if (seen.errors.length > 0) {
            problems.push(`${where}: errors ${seen.errors.join('; ')}`)
            continue
          }
          // The unreachable blocks are reported, and only those.
          const expected = unreachable(c).sort()
          if (JSON.stringify(seen.warnings) !== JSON.stringify(expected)) {
            problems.push(`${where}: warnings ${seen.warnings}, unreachable ${expected}`)
          }
          if (expected.length > 0) {
            continue
          }
          problems.push(...seen.violations.map(v => `${where}: ${v}`))
          const observed = JSON.stringify(seen.out)
          const first = baseline.get(c.source)
          if (first === undefined) {
            baseline.set(c.source, observed)
          } else if (first !== observed) {
            problems.push(`${where}: differs from the first placement of the source`)
          }
        }
        if (process.env.ATSCRIPT_LIVE_DEBUG) {
          console.info(problems.join('\n'))
        }
        expect(problems.slice(0, 40)).toEqual([])
      }
    )
  }
})

/*
 * A recursive type's path annotate (`annotate T { next.name2 }`, re-entering `T`: `T`'s own
 * `name2`) and an annotate of its own props (`annotate T { name }`) commute: both are `T`'s own
 * props' annotations, at every depth, whatever the order of the blocks in a file, the files
 * holding them and the order they load in. An alias of `T` in another file sees both.
 */
describe('a path override of a recursive type and its own blocks commute', () => {
  const T = 'export interface T {\n  name: string\n  name2?: string\n  next?: T\n}\n'
  const D = "annotate T {\n  @meta.label 'D'\n  name\n}\n"
  const P = "annotate T {\n  @meta.label 'P'\n  next.name2\n}\n"
  const imp = "import { T } from './t'\n"
  const placements: Array<[string, Record<string, string>, string[]]> = [
    ['one file, own first', { 't.as': T + D + P }, ['t.as']],
    ['one file, path first', { 't.as': T + P + D }, ['t.as']],
    [
      'two files, own loaded first',
      { 't.as': T, 'd.as': imp + D, 'p.as': imp + P },
      ['d.as', 'p.as'],
    ],
    [
      'two files, path loaded first',
      { 't.as': T, 'd.as': imp + D, 'p.as': imp + P },
      ['p.as', 'd.as'],
    ],
    [
      'own in the type file, path loaded last',
      { 't.as': T + D, 'p.as': imp + P },
      ['t.as', 'p.as'],
    ],
    [
      'path in the type file, own loaded last',
      { 't.as': T + P, 'd.as': imp + D },
      ['t.as', 'd.as'],
    ],
  ]
  /** `name/name2` labels at `T`, `T.next`, `T.next.next`. */
  const labels = (type: any) => {
    const out: string[] = []
    let node = type
    for (let i = 0; i < 3 && node; i++) {
      const props = node.type.props
      out.push(
        `${props.get('name')?.metadata.get('meta.label') ?? '-'}/${props.get('name2')?.metadata.get('meta.label') ?? '-'}`
      )
      node = props.get('next')
    }
    return out.join(' ')
  }
  for (const [where, files, order] of placements) {
    it(where, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'atscript-live-rec-'))
      dirs.push(dir)
      // (and an alias of `T` in a file loaded after the blocks)
      const all = { ...files, 'al.as': `${imp}export type AL = T\n` }
      for (const [name, content] of Object.entries(all)) {
        writeFileSync(path.join(dir, name), content)
      }
      const repo = await build({ rootDir: dir, entries: Object.keys(all), plugins: [tsPlugin()] })
      const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
      expect(errors.map(m => m.message)).toEqual([])
      for (const file of await repo.generate({ format: 'js' })) {
        writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
      }
      vi.resetModules()
      for (const file of order) {
        await import(path.join(dir, `${file}.js`))
      }
      const { AL } = await import(path.join(dir, 'al.as.js'))
      const { T: t } = await import(path.join(dir, 't.as.js'))
      expect([where, labels(t), labels(AL)]).toEqual([where, 'D/P D/P D/P', 'D/P D/P D/P'])
    })
  }
})
