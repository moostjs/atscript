import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { rng } from '../test-utils'
import { schemaDisagreements } from './json-schema-oracle'
import { placeholderReads, probedRefs } from './order-probe'

/*
 * Declaration order: a module's types do not depend on the order their declarations are written
 * in. For families of declarations covering the forms a type can be built from — an alias of a
 * primitive or of an annotated primitive alias, intersections merged into a structure / into a
 * reference / kept at runtime (recursive), unions, arrays, tuples, chain references (`A.x`),
 * `extends`, mutating `annotate` blocks and `annotate … as` aliases, in one file and across files
 * (import cycles included, loaded from either side) — every permutation of the declarations of
 * the permuted files generates modules whose types validate the same values the same way, build
 * the same JSON schemas (runtime and bundled), and declare the same `.d.ts`; and no generated
 * chain reads a class's type before its chain built it (see `order-probe.ts`).
 *
 * `ATSCRIPT_LARGE_TESTS=1`: compiled checks too, and the larger families.
 *
 * The families are split over three spec files (`describeOrder(part)`, by `PARTS`), so that three
 * workers share them: `declaration-order.spec.ts`, `declaration-order-2.spec.ts`,
 * `declaration-order-3.spec.ts`.
 */

const LARGE = !!process.env.ATSCRIPT_LARGE_TESTS
/**
 * `ATSCRIPT_ORDER_SHARD=r/n`: only the permutations whose index is `r` modulo `n` (and the first,
 * the baseline) — a large family over several runs (each run holds the modules it loads).
 */
const [SHARD, SHARDS] = (process.env.ATSCRIPT_ORDER_SHARD ?? '0/1').split('/').map(Number)

interface TFamily {
  name: string
  /** Files: their declarations (permuted when listed in `permute`), or fixed content. */
  files: Record<string, string[] | string>
  permute: string[]
  /** The orders the files are first imported in (an import cycle: from either side). */
  loadOrders?: string[][]
  large?: boolean
}

const FAMILIES: TFamily[] = [
  {
    name: 'primitive aliases and intersections merged into a reference',
    files: {
      'a.as': [
        '@expect.minLength 3\nexport type S3 = string',
        'export type N1 = string & S3',
        'export type A1 = N1',
        'export interface User {\n  name: N1 & string\n  a?: A1\n}',
        'export type U1 = N1 | number',
        'export type R1 = N1[]',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'repeated, triple and extension intersections',
    files: {
      'a.as': [
        '@expect.minLength 3\nexport type S3 = string',
        'export type N2 = S3 & S3',
        'export type N3 = string & S3 & string',
        'export type N4 = number.int & number',
        '@meta.label "own"\nexport type N5 = string & S3',
        'export interface H {\n  a: N2\n  b?: N3[]\n  c?: N5 | null\n  d?: N4\n  t?: [N2, N3]\n}',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'objects: merged intersections, chain references, extends, annotates',
    files: {
      'a.as': [
        'export interface O {\n  @expect.minLength 2\n  x: string\n  n?: string\n}',
        'export type OX = O & O',
        'annotate OX {\n  @expect.maxLength 5\n  x\n}',
        'export type C = OX.x',
        'export interface E extends OX {\n  y?: C\n}',
        'export type OU = OX | OX[]',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'an intersection merged into a structure, its chain and its annotate … as alias',
    files: {
      'a.as': [
        'export interface O {\n  @expect.minLength 2\n  x: string\n}',
        'export type OY = O & { z?: number }',
        'export type C = OY.x',
        'export annotate OY as AA {\n  @expect.maxLength 4\n  x\n}',
        'export type AL = AA',
        'export interface H {\n  a: AL\n  c: C\n  y: OY\n}',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'recursive types, a runtime intersection, aliases of them',
    files: {
      'a.as': [
        'export interface Node {\n  @expect.minLength 1\n  v: string\n  next?: Node & Extra\n}',
        'export interface Extra {\n  e?: number\n}',
        'export type NE = Node & Extra',
        'export type NA = NE',
        'export interface B {\n  a?: A\n  k: string\n}',
        'export type A = B',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'chain references between types, aliases of unions, tuples and arrays',
    files: {
      'a.as': [
        'export interface P {\n  q?: Q.x\n  @expect.minLength 2\n  x: string\n}',
        'export interface Q {\n  x: P.x\n  u?: UA\n}',
        'export type UA = U1 | null',
        "export type U1 = 'a' | 'b' | P",
        'export type TA = [UA, Q.x]',
        'export type LA = TA[]',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'chain references through other types and to a later prop of their own type',
    files: {
      'a.as': [
        'export interface R {\n  p: P\n  @expect.minLength 1\n  w?: string\n}',
        'export type RX = R.p.x',
        'export interface D {\n  y?: D.z\n  t?: R.p.q\n  @expect.maxLength 3\n  z: string\n}',
        'export interface P {\n  q?: RX\n  @expect.minLength 2\n  x: string\n}',
        'export type DY = D.y',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'annotate … as of aliases, extends of a merged intersection and of an alias',
    files: {
      'a.as': [
        '@expect.minLength 3\nexport type S3 = string',
        'export interface O {\n  x: S3\n  @expect.max 5\n  n?: number\n}',
        'export type OM = O & { m?: S3 }',
        'export interface E extends OM {\n  e?: EA\n}',
        'export annotate O as EA {\n  @expect.maxLength 4\n  x\n}',
        'export annotate E as EB {\n  @expect.min 1\n  n\n}',
      ],
    },
    permute: ['a.as'],
  },
  {
    name: 'seven forms together: aliases, merges, chains, extends, annotates, tuples (large)',
    files: {
      'a.as': [
        '@expect.minLength 3\nexport type S3 = string',
        'export type N1 = string & S3',
        'export interface O {\n  @expect.minLength 2\n  x: string\n  n?: N1\n}',
        'export type OY = O & { z?: N1 }',
        'export type C = OY.n',
        'export interface E extends OY {\n  y?: [C, N1]\n  r?: E\n}',
        'annotate OY {\n  @expect.maxLength 5\n  x\n}',
      ],
    },
    permute: ['a.as'],
    large: true,
  },
  {
    name: 'seven forms together: recursion, runtime intersections, mutual chains (large)',
    files: {
      'a.as': [
        'export interface Node {\n  @expect.minLength 1\n  v: string\n  next?: Node & Extra\n  w?: W.k\n}',
        'export interface Extra {\n  e?: number\n}',
        'export type NA = Node & Extra',
        'export interface W {\n  k?: Node.v\n  a?: WA\n}',
        'export type WA = W',
        'export type U = NA | WA[] | null',
        'export annotate W as WB {\n  @expect.maxLength 2\n  k\n}',
      ],
    },
    permute: ['a.as'],
    large: true,
  },
  {
    name: 'across files: intersections merged into a reference of the other file (a cycle)',
    files: {
      'a.as': [
        "import { BN, BO } from './b'",
        '@expect.minLength 3\nexport type S3 = string',
        'export interface AO {\n  @expect.minLength 2\n  x: string\n}',
        'export type X1 = BN & string',
        'export type X2 = BO & AO',
        'export interface H {\n  a: X1\n  b: X2\n  c?: BN\n}',
      ],
      'b.as':
        "import { S3, AO } from './a'\nexport type BN = string & S3\nexport type BO = AO & AO\n",
    },
    permute: ['a.as'],
    loadOrders: [
      ['a.as', 'b.as'],
      ['b.as', 'a.as'],
    ],
  },
  {
    name: 'across files: both files permuted, mutating annotates, an alias of the other file',
    files: {
      'a.as': [
        "import { BN, BO, BA } from './b'\n@expect.minLength 3\nexport type S3 = string",
        'export interface AO {\n  @expect.minLength 2\n  x: string\n}',
        'export type X1 = BN & string',
        'export type X3 = BA',
        'export interface H {\n  a: X1\n  c?: BO\n  d?: X3\n}',
      ],
      'b.as': [
        "import { S3, AO, X1 } from './a'\nexport type BN = string & S3",
        'export type BO = AO & AO',
        'export type BA = X1 & S3',
        'annotate BO {\n  @expect.maxLength 4\n  x\n}',
      ],
    },
    permute: ['a.as', 'b.as'],
    loadOrders: [
      ['a.as', 'b.as'],
      ['b.as', 'a.as'],
    ],
    large: true,
  },
  {
    name: 'across files: extends of the other file, chain references through it',
    files: {
      'a.as': [
        "import { BI } from './b'",
        'export interface AE extends BI {\n  @expect.minLength 2\n  y: string\n}',
        'export type AC = AE.x',
        'export type AX = AE & { z?: AC }',
        'annotate AE {\n  @expect.maxLength 6\n  x\n}',
        'export type AL = AX',
      ],
      'b.as': 'export interface BI {\n  @expect.minLength 3\n  x: string\n}\n',
    },
    permute: ['a.as'],
  },
]

/** Every permutation of `items`. */
function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items
    return
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) {
      yield [items[i], ...p]
    }
  }
}

/** Every combination of a permutation per permuted file (`[file, statement indexes]`). */
function* orders(family: TFamily): Generator<number[][]> {
  const lists = family.permute.map(f => (family.files[f] as string[]).map((_, i) => i))
  function* product(i: number, acc: number[][]): Generator<number[][]> {
    if (i === lists.length) {
      yield acc
      return
    }
    for (const p of permutations(lists[i])) {
      yield* product(i + 1, [...acc, p])
    }
  }
  yield* product(0, [])
}

const FIXED_VALUES: unknown[] = [
  '',
  'ab',
  'abc',
  'abcd',
  'abcdefg',
  1,
  -1,
  2.5,
  null,
  true,
  [],
  ['abc'],
  [{ x: 'abc' }],
  { x: 'ab' },
  { x: 'abc' },
  { x: 'a' },
  { x: 'abcdefg' },
  { x: 'abc', n: 'ab', y: 'abcd', z: 1 },
  { v: 'a', next: { v: 'b', e: 1 } },
  { v: '', next: { v: 'b' } },
  { k: 'x', a: { k: 'y' } },
]

/** A random value shaped like `type` (to depth 4), sometimes off. */
function sample(type: TAtscriptAnnotatedType, r: () => number, depth = 0): unknown {
  const t = type.type as any
  if (depth > 4 || r() < 0.05) {
    return r() < 0.5 ? undefined : 'x'
  }
  switch (t.kind) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [key, prop] of t.props) {
        if (!prop.optional || r() < 0.5) {
          out[key] = sample(prop, r, depth + 1)
        }
      }
      return out
    }
    case 'array': {
      return Array.from({ length: Math.floor(r() * 3) }, () => sample(t.of, r, depth + 1))
    }
    case 'tuple': {
      return t.items.map((item: TAtscriptAnnotatedType) => sample(item, r, depth + 1))
    }
    case 'union': {
      return sample(t.items[Math.floor(r() * t.items.length)], r, depth)
    }
    case 'intersection': {
      return Object.assign({}, ...t.items.map((item: any) => sample(item, r, depth)))
    }
    default: {
      return t.designType === 'number'
        ? Math.floor(r() * 3) - 1
        : 'abcdefg'.slice(0, Math.floor(r() * 8))
    }
  }
}

const OPTIONS: Array<Partial<TValidatorOptions>> = [
  {},
  { unknownProps: 'strip' },
  { partial: 'deep' },
]

const roots: string[] = []

const PROBE = path.join(__dirname, 'order-probe.ts')

/** What a permutation generates and its types do: per load order, per exported type. */
async function observe(
  family: TFamily,
  order: number[][],
  root: string,
  n: number,
  samples: Map<string, unknown[]>,
  compileValidators: boolean,
  /** also check the JSON schemas against the validator (with ajv) */
  checkSchemas = false
): Promise<Record<string, unknown>> {
  const dir = path.join(root, `p${n}`)
  mkdirSync(dir)
  for (const [file, content] of Object.entries(family.files)) {
    const i = family.permute.indexOf(file)
    const text =
      i < 0 ? (content as string) : order[i].map(k => (content as string[])[k]).join('\n')
    writeFileSync(path.join(dir, file), text)
  }
  const entries = Object.keys(family.files)
  const repo = await build({
    rootDir: dir,
    entries,
    plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators })],
  })
  const out: Record<string, unknown> = {}
  out.errors = [...(await repo.diagnostics()).entries()]
    .flatMap(([id, msgs]) =>
      msgs.filter(m => m.severity === 1).map(m => `${path.basename(id)}: ${m.message}`)
    )
    .sort()
  // `.d.ts`: the same declarations (each declaration a block of the file, in any order).
  for (const file of await repo.generate({ format: 'dts' })) {
    out[`dts ${path.basename(file.source)}`] = file.content
      // (the source positions of the declarations' doc comments follow the order)
      .replaceAll(/(\.as):\d+:\d+/g, '$1')
      .split(/\n(?=\/\*\*|(?:export )?(?:declare |type |interface |import )|\/\/ prettier)/)
      .map(block => block.trim())
      .sort()
  }
  const js = await repo.generate({ format: 'js' })
  const loadOrders = family.loadOrders ?? [entries]
  for (const [li, first] of loadOrders.entries()) {
    // A directory per load order (its own module instances).
    const ldir = path.join(dir, `l${li}`)
    mkdirSync(ldir)
    for (const file of js) {
      writeFileSync(
        path.join(ldir, `${path.basename(file.source)}.js`),
        file.content.replaceAll('"@atscript/typescript/utils"', JSON.stringify(PROBE))
      )
    }
    probedRefs.length = 0
    const modules: Record<string, Record<string, unknown>> = {}
    for (const file of first) {
      modules[file] = await import(path.join(ldir, `${file}.js`))
    }
    out[`placeholders ${first}`] = placeholderReads()
    for (const [file, module] of Object.entries(modules)) {
      for (const [name, cls] of Object.entries(module) as Array<[string, any]>) {
        // (MODEL §11: in-place merge operands are extra module exports under a reserved `$`
        // prefix, not types of the module)
        if (!cls?.__is_atscript_annotated_type || name.startsWith('$')) {
          continue
        }
        const id = `${file}:${name}`
        let values = samples.get(id)
        if (!values) {
          const r = rng(name.length * 31 + 7)
          values = [...FIXED_VALUES, ...Array.from({ length: 30 }, () => sample(cls, r))]
          samples.set(id, values)
        }
        out[`${first} ${id}`] = {
          kind: cls.type.kind,
          verdicts: values.map(value =>
            OPTIONS.map(opts => {
              const copy = structuredClone(value)
              const validator = new Validator(cls, opts)
              const ok = validator.validate(copy, true)
              return [ok, ok ? copy : validator.errors.map(e => `${e.path}: ${e.message}`)]
            })
          ),
          schema: buildJsonSchema(cls),
        }
        // The bundled schema is the runtime one.
        expect([id, cls.toJsonSchema()]).toEqual([id, buildJsonSchema(cls)])
        // and accepts what the validator does
        if (checkSchemas) {
          expect(schemaDisagreements(id, cls, values, true).slice(0, 10)).toEqual([])
        }
      }
    }
  }
  return out
}

/**
 * The spec file (part 1–3) each family runs in, balancing the parts' times (a family not listed
 * runs in part 1).
 */
const PARTS: Record<string, number> = {
  'primitive aliases and intersections merged into a reference': 1,
  'repeated, triple and extension intersections': 1,
  'chain references through other types and to a later prop of their own type': 1,
  'across files: intersections merged into a reference of the other file (a cycle)': 1,
  'seven forms together: aliases, merges, chains, extends, annotates, tuples (large)': 1,
  'recursive types, a runtime intersection, aliases of them': 2,
  'chain references between types, aliases of unions, tuples and arrays': 2,
  'across files: extends of the other file, chain references through it': 2,
  'seven forms together: recursion, runtime intersections, mutual chains (large)': 2,
  'objects: merged intersections, chain references, extends, annotates': 3,
  'an intersection merged into a structure, its chain and its annotate … as alias': 3,
  'annotate … as of aliases, extends of a merged intersection and of an alias': 3,
  'across files: both files permuted, mutating annotates, an alias of the other file': 3,
}

/** The families of spec file `part` (1–3). */
export function describeOrder(part: number): void {
  afterAll(() => {
    for (const dir of roots) {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  describe('declaration order: every permutation generates the same types', () => {
    for (const family of FAMILIES.filter(f => (PARTS[f.name] ?? 1) === part)) {
      for (const compileValidators of LARGE ? [false, true] : [false]) {
        const run = family.large && !LARGE ? it.skip : it
        run(
          `${family.name}${compileValidators ? ' (compiled)' : ''}`,
          async () => {
            const root = mkdtempSync(path.join(tmpdir(), 'atscript-order-'))
            roots.push(root)
            const samples = new Map<string, unknown[]>()
            let baseline: Record<string, unknown> | undefined
            let n = 0
            let index = -1
            for (const order of orders(family)) {
              index++
              if (index > 0 && index % SHARDS !== SHARD) {
                continue
              }
              const seen = await observe(
                family,
                order,
                root,
                n++,
                samples,
                compileValidators,
                !baseline
              )
              const where = family.permute.map((f, i) => `${f}: ${order[i].join(',')}`).join('; ')
              for (const [key, value] of Object.entries(seen)) {
                if (key.startsWith('placeholders')) {
                  expect([where, key, value]).toEqual([where, key, []])
                }
              }
              if (!baseline) {
                baseline = seen
                expect(seen.errors).toEqual([])
              } else {
                expect([where, seen]).toEqual([where, baseline])
              }
            }
            console.info(`[order] ${family.name}: ${n} permutations`)
            rmSync(root, { recursive: true, force: true })
          },
          1_200_000
        )
      }
    }
  })
}
