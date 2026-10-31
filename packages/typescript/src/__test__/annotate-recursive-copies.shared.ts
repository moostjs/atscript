import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import Ajv from 'ajv'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator } from '../runtime/validator'
import { rng } from '../test-utils'
import { sampleValue } from './json-schema-oracle'

/*
 * Mutating path annotates of recursive types are the annotated type's own annotations, live
 * wherever it is used: a path step reaching the annotated type T again is T (the annotation lands
 * on T's own prop, at every depth, the top level included); a path into another type is T's
 * override at exactly that path, the rest of the tree being the live types (a step reaching a
 * type the path went through again is that type). The annotated type's tree is checked against
 * that rule (a model of the shape: every position to a depth, and the entries' own paths).
 *
 * A type built at build time from it — `extends` (also of an alias), `annotate … as` (also with
 * annotations of its own, and an alias of one), an intersection merged with it (either side) —
 * has exactly the annotated type's tree at every depth, and so do the types copying it at runtime
 * (an alias, an outer reference, a union, an array, a chain reference). Exhaustively over
 * recursive shapes (self — through a prop, a union branch, an inline object, an intersection
 * member, an outer type, a recursive intersection —, mutual, a cycle of three) × paths of 1–5
 * references (seeded samples; one or two entries) × where the types built from it and the block
 * are: the metadata at every path, the interpreted and compiled verdicts, and the runtime and
 * bundled JSON schemas' verdicts are the annotated type's.
 *
 * `ATSCRIPT_LARGE_TESTS=1`: more paths per depth, and two entries each.
 *
 * (The interpreted and the compiled runs are two spec files calling `describeCopies`, so that two
 * workers share them: `annotate-recursive-copies.spec.ts`, `annotate-recursive-copies-compiled.spec.ts`.)
 */

const LARGE = !!process.env.ATSCRIPT_LARGE_TESTS
const PATHS_PER_DEPTH = LARGE ? 6 : 2
const DEPTHS = [1, 2, 3, 4, 5]
/** The depth (props, items) the trees are compared to: two beyond the deepest path. */
const COMPARE_DEPTH = 7

/** A recursive shape: its declarations, the annotated type, its steps and leaves. */
interface TShape {
  decls: string
  target: string
  /** From a type, the path steps re-entering the shape (and the type each leads to). */
  steps: Record<string, Array<[string, string]>>
  /** A string prop of each type (where a path ends). */
  leaf: Record<string, string>
  /**
   * Steps reaching the target through an intersection member or a union branch: they do not
   * restart at the target (MODEL §8, §10 D2), and each lands on the target's own prop node
   * wherever it is taken (MODEL §5: a field only one member has is that member's node).
   */
  members?: string[]
}

const SHAPES: Record<string, TShape> = {
  self: {
    decls: [
      "@meta.label 'TL'",
      'export interface T {',
      '  name: string',
      '  name2?: string',
      '  next?: T',
      '  kids?: T[]',
      '  alt?: T | null',
      '  inner?: { back?: T }',
      '  mix?: { a?: string } & { b?: T }',
      '  h?: H',
      '}',
      'export interface H {',
      '  t?: T',
      '  hs?: string',
      '}',
    ].join('\n'),
    target: 'T',
    steps: {
      T: [
        ['next', 'T'],
        ['alt', 'T'],
        ['inner.back', 'T'],
        ['mix.b', 'T'],
        ['h', 'H'],
      ],
      H: [['t', 'T']],
    },
    leaf: { T: 'name', H: 'hs' },
  },
  mutual: {
    decls: [
      'export interface B {',
      '  s: string',
      '  a?: A',
      '  self?: B',
      '}',
      "@meta.label 'AL'",
      'export interface A {',
      '  t: string',
      '  b?: B',
      '  bs?: B[]',
      '}',
    ].join('\n'),
    target: 'B',
    steps: {
      B: [
        ['a', 'A'],
        ['self', 'B'],
      ],
      A: [['b', 'B']],
    },
    leaf: { B: 's', A: 't' },
  },
  intersection: {
    decls: [
      'export interface T {',
      '  name: string',
      '  next?: T & D',
      '  kids?: (T & D)[]',
      '  pick?: D | (T & D)',
      '}',
      "@meta.label 'DL'",
      'export interface D {',
      '  d?: string',
      '  back?: T',
      '}',
    ].join('\n'),
    target: 'T',
    steps: {
      T: [
        ['next', 'T'],
        ['pick', 'T'],
        ['next.back', 'T'],
      ],
    },
    leaf: { T: 'name' },
    members: ['next', 'pick'],
  },
  cycle3: {
    decls: [
      'export interface X {',
      '  s: string',
      '  y?: Y',
      '}',
      'export interface Y {',
      '  z?: Z',
      '  ys?: string',
      '}',
      'export interface Z {',
      '  x?: X',
      '  zs?: string',
      '  back?: Y',
      '}',
    ].join('\n'),
    target: 'X',
    steps: {
      X: [['y', 'Y']],
      Y: [['z', 'Z']],
      Z: [
        ['x', 'X'],
        ['back', 'Y'],
      ],
    },
    leaf: { X: 's', Y: 'ys', Z: 'zs' },
  },
}

/** Every path of `depth` steps from the shape's target to a leaf. */
function pathsOf(shape: TShape, depth: number): string[] {
  let paths: Array<[string, string]> = [['', shape.target]]
  for (let i = 0; i < depth; i++) {
    paths = paths.flatMap(([p, type]) =>
      (shape.steps[type] ?? []).map(([step, to]): [string, string] => [
        p ? `${p}.${step}` : step,
        to,
      ])
    )
  }
  return paths.map(([p, type]) => `${p}.${shape.leaf[type]}`)
}

/** The types built from the annotated type `t` (named `<n>`), and where to compare them. */
function constructs(t: string): Array<{ decl: string; name: string; at: string }> {
  return [
    { decl: `export interface CE extends ${t} {\n  e?: string\n}`, name: 'CE', at: '' },
    { decl: `export type CAL = ${t}`, name: 'CAL', at: '' },
    { decl: `export interface CEA extends CAL {\n  e?: string\n}`, name: 'CEA', at: '' },
    { decl: `export annotate ${t} as CX {}`, name: 'CX', at: '' },
    {
      decl: `@meta.label 'CXL'\nexport annotate ${t} as CXL {}`,
      name: 'CXL',
      at: '',
    },
    { decl: `export type CXA = CX`, name: 'CXA', at: '' },
    { decl: `export interface CEX extends CX {\n  e?: string\n}`, name: 'CEX', at: '' },
    { decl: `export type CIM = ${t} & { e?: string }`, name: 'CIM', at: '' },
    { decl: `export type CIN = { e?: string } & ${t}`, name: 'CIN', at: '' },
    { decl: `export interface CH {\n  o?: ${t}\n}`, name: 'CH', at: '.o' },
    { decl: `export type CU = ${t} | null`, name: 'CU', at: '<0>' },
    { decl: `export type CA = ${t}[]`, name: 'CA', at: '[]' },
  ]
}

/** Every path of 0 to `depth` steps from the shape's target to a leaf. */
function positionsOf(shape: TShape, depth: number): string[] {
  return Array.from({ length: depth + 1 }, (_, d) => pathsOf(shape, d))
    .flat()
    .map(p => p.replace(/^\./, ''))
}

/**
 * Where the rule puts path `p` (`a.b.leaf`): from its last step reaching the target (the
 * target's own prop), the rest as it is (an override is at its own path only). Two paths are the
 * same node by the rule iff these are equal.
 */
function ruleKey(shape: TShape, p: string): string {
  return ruleSteps(shape, p).key
}

/**
 * {@link ruleKey}. With `entries` (the entries' keys), the key of a position: a `members` step
 * off the entries' paths is the target's own prop node again, and a leaf off them the target's
 * own leaf (MODEL §4: shells only along a written path, everything off it a reference; §5).
 */
function ruleSteps(shape: TShape, p: string, entries?: string[]): { key: string } {
  // (the steps of `p` and the types they reach: steps may be dotted, `inner.back`)
  let type = shape.target
  let rest = p
  let seq: Array<[string, string]> = []
  for (;;) {
    // (the longest step: `next.back` over `next`)
    const left = rest
    const step = (shape.steps[type] ?? [])
      .filter(([s]) => left.startsWith(`${s}.`))
      .sort((x, y) => y[0].length - x[0].length)[0]
    if (!step) {
      break
    }
    seq.push(step)
    type = step[1]
    rest = rest.slice(step[0].length + 1)
  }
  // (MODEL §8: only a step reaching the target directly restarts at it, not a member step)
  const last = seq.findLastIndex(([s, to]) => to === shape.target && !shape.members?.includes(s))
  seq = seq.slice(last + 1)
  if (entries && shape.members) {
    // (the shells along the entries' paths: a step off them is the step from the node the shell
    // is over — the shells of shorter paths included —, down to the target's own prop node)
    const onPath = (at: string[]) => entries.some(e => e.startsWith(`${at.join('.')}.`))
    const over = (at: string[]): string[] =>
      at.length <= 1 ? [] : step(over(at.slice(0, -1)), at[at.length - 1])
    const step = (at: string[], x: string): string[] =>
      onPath([...at, x]) || at.length === 0 ? [...at, x] : step(over(at), x)
    const leafOf = (at: string[]): string => {
      const key = [...at, rest].join('.')
      return entries.includes(key) || at.length === 0 ? key : leafOf(over(at))
    }
    return { key: leafOf(seq.reduce<string[]>((at, [x]) => step(at, x), [])) }
  }
  return { key: [...seq.map(([s]) => s), rest].join('.') }
}

/** The rule's differences of the annotated type's tree (to `depth` steps, and the paths'). */
function ruleDiffs(
  shape: TShape,
  target: TAtscriptAnnotatedType,
  paths: string[],
  depth = 3
): string[] {
  const keys = paths.map(p => ruleKey(shape, p))
  const out: string[] = []
  for (const pos of new Set([...positionsOf(shape, depth), ...paths])) {
    const { key } = ruleSteps(shape, pos, keys)
    // (two entries at one node: the later one's description)
    const i = keys.lastIndexOf(key)
    const want = i >= 0 ? `P${i}` : undefined
    const nodes = nodesAt(target, pos.split('.'))
    const got = nodes.map(n => n.metadata.get('meta.description') as string | undefined)
    if (nodes.length === 0 || got.some(g => g !== want)) {
      out.push(`${shape.target}.${pos}: ${got.join(',') || '(none)'} (want ${want ?? '-'})`)
    }
  }
  return out
}

/**
 * Where the types built from it and the block are: in the annotated type's file; the types in
 * another file; the block in a file the types' file imports; the block in a file importing the
 * annotated type's file and imported by it (an import cycle); the block in a file the annotated
 * type's file (declaring types built from it) does not import — reported, the runtime alias
 * built before the block's file loads does not have it (a block applies when its file loads).
 */
const PLACES = [
  'same file',
  'types elsewhere',
  'cycle',
  'unreachable',
  'unreachable, types in its file',
] as const

interface TCase {
  shape: string
  paths: string[]
  place: (typeof PLACES)[number]
}

function cases(): TCase[] {
  const out: TCase[] = []
  const r = rng(20_261_021)
  for (const [shapeName, shape] of Object.entries(SHAPES)) {
    for (const depth of DEPTHS) {
      const all = pathsOf(shape, depth)
      const picked = [...all].sort(() => r() - 0.5).slice(0, PATHS_PER_DEPTH)
      for (const [i, p] of picked.entries()) {
        // (two entries: another path of a depth up to this one)
        const second = LARGE || i === 0 ? pathsOf(shape, 1 + Math.floor(r() * depth)) : []
        const paths = second.length > 0 ? [p, second[Math.floor(r() * second.length)]] : [p]
        for (const place of PLACES) {
          out.push({ shape: shapeName, paths: [...new Set(paths)], place })
        }
      }
    }
  }
  return out
}

/** The files of a case. */
function filesOf(c: TCase): Record<string, string> {
  const shape = SHAPES[c.shape]
  const t = shape.target
  const exported = Object.keys(shape.leaf).join(', ')
  const block = [
    `annotate ${t} {`,
    ...c.paths.flatMap((p, i) => [
      `  @expect.minLength ${3 + i}`,
      `  @meta.description 'P${i}'`,
      `  ${p}`,
    ]),
    '}',
  ].join('\n')
  const types = constructs(t)
    .map(x => x.decl)
    .join('\n')
  const imp = `import { ${exported} } from './t'\n`
  const mark = 'export interface BMark {\n  m?: string\n}\n'
  // (a file importing the block's file reads a type of it: the import is kept)
  const useB = "import { BMark } from './b'\nexport type PB = BMark\n"
  const files: Record<string, string> = {}
  switch (c.place) {
    case 'same file': {
      files['t.as'] = [shape.decls, block, types].join('\n')
      break
    }
    case 'types elsewhere': {
      files['t.as'] = [shape.decls, block].join('\n')
      files['p.as'] = `${imp}${types}\n`
      break
    }
    case 'unreachable': {
      files['t.as'] = shape.decls
      files['b.as'] = `${imp}${block}\n${mark}`
      files['p.as'] = `${imp}${useB}${types}\n`
      break
    }
    case 'cycle': {
      files['t.as'] = [useB, shape.decls, types].join('\n')
      files['b.as'] = `${imp}${block}\n${mark}`
      break
    }
    case 'unreachable, types in its file': {
      files['t.as'] = [shape.decls, types].join('\n')
      files['b.as'] = `${imp}${block}\n${mark}`
      files['p.as'] = `${imp}${useB}export type PU = ${t}\n`
      break
    }
  }
  return files
}

/**
 * The metadata of `node`'s tree by path (to `COMPARE_DEPTH`): an intersection's members share its
 * path (a merged intersection and a runtime one of the same members compare equal), a union's
 * branches and a tuple's items get their index, an array's items `[]`.
 */
function metaTree(
  node: TAtscriptAnnotatedType,
  maxDepth = COMPARE_DEPTH
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (at: string, n: TAtscriptAnnotatedType) => {
    let set = out.get(at)
    if (!set) {
      set = new Set()
      out.set(at, set)
    }
    for (const [k, v] of n.metadata) {
      set.add(`${k}=${JSON.stringify(v)}`)
    }
    if (n.optional) {
      set.add('?')
    }
  }
  const visit = (n: TAtscriptAnnotatedType, at: string, depth: number, self: boolean) => {
    if (depth > maxDepth) {
      return
    }
    if (!self) {
      add(at, n)
    }
    const t = n.type as any
    switch (t.kind) {
      case 'object': {
        for (const [k, v] of t.props) {
          visit(v, `${at}.${k}`, depth + 1, false)
        }
        break
      }
      case 'array': {
        visit(t.of, `${at}[]`, depth + 1, false)
        break
      }
      case 'intersection': {
        for (const item of t.items) {
          visit(item, at, depth, true)
        }
        break
      }
      case 'union':
      case 'tuple': {
        t.items.forEach((item: TAtscriptAnnotatedType, i: number) =>
          visit(item, `${at}<${i}>`, depth + 1, false)
        )
        break
      }
      default: {
        out.get(at)?.add(`#${t.designType}`)
      }
    }
  }
  visit(node, '', 0, true)
  return out
}

/** The nodes prop path `parts` leads to from `node` (through union branches, intersections). */
function nodesAt(node: TAtscriptAnnotatedType, parts: string[]): TAtscriptAnnotatedType[] {
  if (parts.length === 0) {
    return [node]
  }
  const t = node.type as any
  if (t.kind === 'object') {
    const prop = t.props.get(parts[0])
    return prop ? nodesAt(prop, parts.slice(1)) : []
  }
  if (t.kind === 'union' || t.kind === 'intersection' || t.kind === 'tuple') {
    return t.items.flatMap((item: TAtscriptAnnotatedType) => nodesAt(item, parts))
  }
  return []
}

/**
 * The metadata trees (to depth 3) of the nodes at every prefix of the entries' paths (and the
 * entry's own): where a deeper path's copies are, beyond the whole tree's compared depth.
 */
function pathNeighborhoods(node: TAtscriptAnnotatedType, paths: string[]): string[] {
  const out: string[] = []
  for (const p of paths) {
    const parts = p.split('.')
    for (let i = 1; i <= parts.length; i++) {
      for (const n of nodesAt(node, parts.slice(0, i))) {
        const tree = [...metaTree(n, 3)].map(([at, set]) => `${at}:${[...set].sort().join(' ')}`)
        out.push(`${parts.slice(0, i).join('.')} ${tree.sort().join(' | ')}`)
      }
    }
  }
  return out.sort()
}

/** The node at accessor `at` (`.p`, `<i>`, `[]`) of `type`. */
function nodeAt(type: TAtscriptAnnotatedType, at: string): TAtscriptAnnotatedType | undefined {
  let cur: any = type
  for (const m of at.matchAll(/\.(\w+)|<(\d+)>|(\[\])/g)) {
    cur = m[1] ? cur?.type?.props?.get(m[1]) : m[2] ? cur?.type?.items?.[+m[2]] : cur?.type?.of
  }
  return cur
}

const dirs: string[] = []

/** The differences of the case's types from the annotated type (the oracle). */
async function check(c: TCase, compileValidators: boolean): Promise<string[]> {
  const files = filesOf(c)
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-recursive-copies-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators })],
  })
  const diags = [...(await repo.diagnostics()).entries()].flatMap(([id, msgs]) =>
    msgs.map(m => ({ file: path.basename(id), m }))
  )
  const errors = diags.filter(d => d.m.severity === 1).map(d => `${d.file}: ${d.m.message}`)
  if (errors.length > 0) {
    return [`errors: ${errors.join('; ')}`]
  }
  const unreachable = diags.some(
    d => d.m.severity === 2 && d.m.message.includes('without importing')
  )
  if (unreachable !== c.place.startsWith('unreachable')) {
    return [`the unreachable block ${unreachable ? 'is' : 'is not'} reported`]
  }
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  vi.resetModules()
  const mods: Record<string, any> = {}
  for (const name of ['t.as', 'b.as', 'p.as']) {
    if (files[name]) {
      Object.assign(mods, await import(path.join(dir, `${name}.js`)))
    }
  }
  const shape = SHAPES[c.shape]
  const target: TAtscriptAnnotatedType = mods[shape.target]
  const want = metaTree(target)
  // (the oracle has the entries' annotations where the rule puts them)
  const out: string[] = ruleDiffs(shape, target, c.paths).slice(0, 3)
  const r = rng(c.paths.join('').length * 7919)
  const values = Array.from({ length: 60 }, () => sampleValue(target, r)).map(v =>
    v === undefined ? null : JSON.parse(JSON.stringify(v))
  )
  // (one ajv per case: it keeps every schema it compiled)
  const ajv = new Ajv({ strict: false, validateFormats: false })
  /** The validator's, the runtime schema's and the bundled schema's verdicts on `values`. */
  const verdicts = (type: TAtscriptAnnotatedType, wrap = (v: unknown) => v) => {
    const validator = new Validator(type, { unknownProps: 'ignore' })
    const runtime = ajv.compile(buildJsonSchema(type))
    const bundled = ajv.compile((type as any).toJsonSchema())
    return values.map(v => {
      const w = JSON.parse(JSON.stringify(wrap(v))) as unknown
      return [
        validator.validate(structuredClone(w), true),
        runtime(structuredClone(w)),
        bundled(structuredClone(w)),
      ].join('')
    })
  }
  const wantVerdicts = verdicts(target)
  for (const x of constructs(shape.target)) {
    if (c.place === 'unreachable, types in its file' && x.name === 'CAL') {
      continue
    }

    const type: TAtscriptAnnotatedType | undefined = mods[x.name]
    const node = type && nodeAt(type, x.at)
    if (!node) {
      out.push(`${x.name}: missing`)
      continue
    }
    const got = metaTree(node)
    const diffs: string[] = []
    for (const [at, set] of want) {
      const g = got.get(at)
      const a = [...set].sort().join(' ')
      const b = g ? [...g].sort().join(' ') : '(none)'
      if (at !== '' && a !== b) {
        diffs.push(`${at}: ${b} (want ${a})`)
      }
    }
    for (const at of got.keys()) {
      if (!want.has(at) && !at.startsWith('.e')) {
        diffs.push(`${at}: extra`)
      }
    }
    // (beyond the compared depth: around the entries' paths)
    const wantAround = pathNeighborhoods(target, c.paths)
    const gotAround = pathNeighborhoods(node, c.paths)
    const around = wantAround.findIndex((w, i) => w !== gotAround[i])
    if (around >= 0 || wantAround.length !== gotAround.length) {
      diffs.push(`around ${gotAround[around] ?? '(none)'} (want ${wantAround[around]})`)
    }
    if (diffs.length > 0) {
      out.push(`${x.name}: ${diffs.slice(0, 3).join(' | ')}`)
    }
    // Verdicts (the validator, the runtime and bundled schemas) of the built type itself
    // (`null` in an optional prop or a nullable union is valid: not the annotated type's).
    const wrap = (v: unknown) => (x.at === '.o' ? { o: v } : x.at === '[]' ? [v] : v)
    const got2 = verdicts(type, wrap).map((v, i) =>
      values[i] === null && x.at !== '' && x.at !== '[]' ? wantVerdicts[i] : v
    )
    const bad = got2.findIndex((v, i) => v !== wantVerdicts[i])
    if (bad >= 0) {
      out.push(
        `${x.name}: verdicts ${got2[bad]} (want ${wantVerdicts[bad]}) on ${JSON.stringify(values[bad])}`
      )
    }
  }
  return out
}

/** The cases, interpreted and/or with compiled validators (`modes`), in the calling spec file. */
export function describeCopies(modes: boolean[]): void {
  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  describe('path annotates of recursive types are live, and the types built from them agree', () => {
    for (const compileValidators of modes) {
      it(
        `every shape × path depth × construct × placement${compileValidators ? ' (compiled)' : ''}`,
        { timeout: 900_000 },
        async () => {
          const problems: string[] = []
          const only = process.env.ATSCRIPT_COPIES_ONLY
          const all = cases().filter(c => !only || c.shape === only)
          for (const c of all) {
            if (process.env.ATSCRIPT_COPIES_DEBUG) {
              console.info(`[copies] ${c.shape} [${c.paths.join(', ')}] ${c.place}`)
            }
            for (const p of await check(c, compileValidators)) {
              problems.push(`${c.shape} [${c.paths.join(', ')}] ${c.place}: ${p}`)
            }
          }
          if (process.env.ATSCRIPT_COPIES_DEBUG) {
            console.info(`[copies] ${all.length} cases\n${problems.join('\n')}`)
          }
          expect(problems.slice(0, 30)).toEqual([])
        }
      )
    }
  })
}
