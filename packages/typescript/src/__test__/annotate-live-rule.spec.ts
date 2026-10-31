import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import Ajv from 'ajv'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { flattenAnnotatedType } from '../runtime/flatten'
import { buildJsonSchema } from '../runtime/json-schema'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'
import { Validator } from '../runtime/validator'
import { fastCheckPasses } from '../runtime/validator-fast-check'

/*
 * The rule of `annotate T { … }`: its annotations are T's own, as if written in T's source from
 * the start, and live wherever T is used.
 * - A path step reaching T itself (directly, through an array, a union branch or an intersection
 *   member) is T: the annotation lands on T's own prop and holds at every depth, the top level
 *   included (`annotate Node { next.name }` is `annotate Node { name }`).
 * - A path into another type is T's override at exactly that path (`annotate User { home.city }`:
 *   not `work.city`, not `Address.city`, not `home.next.city`). The rest of the override is the
 *   live types: T's own annotations recur through it.
 *
 * Every position is checked in every form a type takes: its metadata, the validator (its walk and
 * its fast path: the compiled check when compiled), the runtime and the bundled JSON schemas, and a serialized round trip.
 */

const ANN = "  @meta.label 'x'\n  @expect.maxLength 2\n"

interface TCase {
  src: string
  /** `Type path` → labelled (and too long a value there rejected) or not. */
  at: Record<string, boolean>
}

const CASES: Record<string, TCase> = {
  'self: a path through T is T’s own prop, top level included': {
    src: `export interface Node {\n  name: string\n  next?: Node\n}\nannotate Node {\n${ANN}  next.name\n}\n`,
    at: {
      'Node name': true,
      'Node next.name': true,
      'Node next.next.name': true,
      'Node next.next.next.name': true,
    },
  },
  'self through an array': {
    src: `export interface Node {\n  name: string\n  kids?: Node[]\n}\nannotate Node {\n${ANN}  kids.name\n}\n`,
    at: {
      'Node name': true,
      'Node kids[].name': true,
      'Node kids[].kids[].name': true,
    },
  },
  'self through a union branch': {
    src: `export interface Node {\n  name: string\n  next?: Node | null\n}\nannotate Node {\n${ANN}  next.next.name\n}\n`,
    at: {
      'Node name': true,
      'Node next.name': true,
      'Node next.next.name': true,
      'Node next.next.next.name': true,
    },
  },
  'self through an intersection member (self-intersection)': {
    src: `export interface Node {\n  name: string\n  next?: Node & Meta\n}\nexport interface Meta {\n  note?: string\n}\nannotate Node {\n${ANN}  next.name\n}\n`,
    at: {
      // MODEL §8: no self-collapse through an intersection member: the exact path only
      'Node name': false,
      'Node next.name': true,
      'Node next.next.name': true,
      'Node next.next.next.name': true,
      'Meta note': false,
    },
  },
  'mutual recursion: b.a is A': {
    src: `export interface A {\n  x: string\n  b?: B\n}\nexport interface B {\n  y: string\n  a?: A\n}\nannotate A {\n${ANN}  b.a.x\n}\n`,
    at: {
      'A x': true,
      'A b.a.x': true,
      'A b.a.b.a.x': true,
      'A b.y': false,
      'B a.x': true,
      'B y': false,
    },
  },
  'a cycle of three: y.z.x is X': {
    src: `export interface X {\n  s: string\n  y?: Y\n}\nexport interface Y {\n  ys: string\n  z?: Z\n}\nexport interface Z {\n  zs: string\n  x?: X\n}\nannotate X {\n${ANN}  y.z.x.s\n}\n`,
    at: {
      'X s': true,
      'X y.z.x.s': true,
      'Z x.s': true,
      'Y z.x.s': true,
      'X y.ys': false,
      'Z zs': false,
    },
  },
  'a path into another type is local to that spot': {
    src: `export interface User {\n  home: Address\n  work: Address\n}\nexport interface Address {\n  city: string\n}\nexport interface Other {\n  a: Address\n}\nannotate User {\n${ANN}  home.city\n}\n`,
    at: {
      'User home.city': true,
      'User work.city': false,
      'Address city': false,
      'Other a.city': false,
    },
  },
  'local paths through a union branch and an intersection member': {
    src: `export interface User {\n  alt?: Address | null\n  both?: Address & Extra\n  plain?: Address\n}\nexport interface Address {\n  city: string\n}\nexport interface Extra {\n  e?: string\n}\nannotate User {\n${ANN}  alt.city\n${ANN}  both.city\n}\n`,
    at: {
      'User alt.city': true,
      'User both.city': true,
      'User plain.city': false,
      'Address city': false,
    },
  },
  'local copies refer to the live T: T recurs through them': {
    src: `export interface User {\n  name: string\n  home: Address\n}\nexport interface Address {\n  city: string\n  owner?: User\n}\nannotate User {\n${ANN}  home.owner.name\n}\n`,
    at: {
      'User name': true,
      'User home.owner.name': true,
      'User home.owner.home.owner.name': true,
      'Address owner.name': true,
      'Address city': false,
    },
  },
  'a local path re-entering T is T’s own': {
    src: `export interface User {\n  home: Address\n}\nexport interface Address {\n  city: string\n  owner?: User\n}\nannotate User {\n${ANN}  home.owner.home.city\n}\n`,
    at: {
      'User home.city': true,
      'User home.owner.home.city': true,
      'Address owner.home.city': true,
      'Address city': false,
    },
  },
  // (inside the override of B at `A.b.next`, a step reaching B again is B itself)
  'an override re-entering its type is that type below the path': {
    src: `export interface A {\n  b?: B\n}\nexport interface B {\n  y: string\n  next?: B\n  nx?: B & E\n  kids?: B[]\n}\nexport interface E {\n  e?: string\n}\nexport interface C {\n  b?: B\n}\nannotate A {\n${ANN}  b.next.y\n}\n`,
    at: {
      'A b.y': false,
      'A b.next.y': true,
      'A b.next.next.y': false,
      // (through an intersection, also the one `B`'s class merges, and an array)
      'A b.nx.y': false,
      'A b.nx.nx.y': false,
      'A b.next.nx.y': false,
      'A b.kids[].nx.y': false,
      'B y': false,
      'B next.y': false,
      'B nx.y': false,
      'C b.y': false,
    },
  },
  // (a path going back into a type it went through: the written path only)
  'an override re-entered through another type on the path': {
    src: `export interface X {\n  s: string\n  y?: Y\n}\nexport interface Y {\n  ys: string\n  z?: Z\n  z2?: Z\n}\nexport interface Z {\n  zs: string\n  x?: X\n  back?: Y\n}\nannotate X {\n${ANN}  y.z.back.ys\n}\n`,
    at: {
      'X y.ys': false,
      'X y.z.back.ys': true,
      'X y.z.back.z.back.ys': false,
      'X y.z.x.y.ys': false,
      'X y.z2.back.ys': false,
      'X y.z.zs': false,
      'Y ys': false,
      'Z back.ys': false,
    },
  },
}

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function load(
  src: string,
  compileValidators: boolean,
  jsonSchema: 'bundle' | false = 'bundle'
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-live-rule-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 't.as'), src)
  const repo = await build({
    rootDir: dir,
    entries: ['t.as'],
    plugins: [tsPlugin({ jsonSchema, compileValidators })],
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  const [out] = await repo.generate({ format: 'js' })
  writeFileSync(path.join(dir, 't.as.js'), out.content)
  vi.resetModules()
  return (await import(path.join(dir, 't.as.js'))) as Record<string, TAtscriptAnnotatedType>
}

/** The steps of a position: props, `[]` for an array's items. */
function stepsOf(p: string): string[] {
  return p.split('.').flatMap(s => (s.endsWith('[]') ? [s.slice(0, -2), '[]'] : [s]))
}

/** The nodes at `steps` (through union branches and intersection members having them). */
function nodesAt(node: TAtscriptAnnotatedType, steps: string[]): TAtscriptAnnotatedType[] {
  if (steps.length === 0) {
    return [node]
  }
  const t = node.type as any
  switch (t.kind) {
    case 'object': {
      const prop = steps[0] === '[]' ? undefined : t.props.get(steps[0])
      return prop ? nodesAt(prop, steps.slice(1)) : []
    }
    case 'array': {
      return steps[0] === '[]' ? nodesAt(t.of, steps.slice(1)) : []
    }
    case 'union':
    case 'intersection': {
      return t.items.flatMap((item: TAtscriptAnnotatedType) => nodesAt(item, steps))
    }
    default: {
      return []
    }
  }
}

/** A minimal valid value of `node`, with `leaf` at `steps` (when given). */
function valueOf(node: TAtscriptAnnotatedType, steps?: string[], leaf?: unknown): any {
  if (steps && steps.length === 0) {
    return leaf
  }
  const t = node.type as any
  switch (t.kind) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, v] of t.props as Map<string, TAtscriptAnnotatedType>) {
        if (steps?.[0] === k) {
          out[k] = valueOf(v, steps.slice(1), leaf)
        } else if (!v.optional) {
          out[k] = valueOf(v)
        }
      }
      return out
    }
    case 'array': {
      return steps ? [valueOf(t.of, steps.slice(1), leaf)] : []
    }
    case 'union': {
      const items: TAtscriptAnnotatedType[] = t.items
      const item = steps
        ? items.find(i => nodesAt(i, steps).length > 0)!
        : (items.find(i => (i.type as any).designType === 'null') ?? items[0])
      return valueOf(item, steps, leaf)
    }
    case 'intersection': {
      return Object.assign(
        {},
        ...t.items.map((i: TAtscriptAnnotatedType) =>
          steps && nodesAt(i, steps).length > 0 ? valueOf(i, steps, leaf) : valueOf(i)
        )
      )
    }
    default: {
      return t.designType === 'null' ? null : 'ok'
    }
  }
}

describe('annotate: annotations live everywhere the annotated type is used', () => {
  for (const compileValidators of [false, true]) {
    for (const [name, c] of Object.entries(CASES)) {
      it(`${name}${compileValidators ? ' (compiled)' : ''}`, async () => {
        const mods = await load(c.src, compileValidators)
        const ajv = new Ajv({ strict: false, validateFormats: false })
        const got: Record<string, unknown> = {}
        const want: Record<string, unknown> = {}
        for (const [where, labelled] of Object.entries(c.at)) {
          const [typeName, p] = where.split(' ')
          const type = mods[typeName]
          const steps = stepsOf(p)
          const nodes = nodesAt(type, steps)
          const long = valueOf(type, steps, 'long')
          const short = valueOf(type, steps, 'ok')
          const restored = deserializeAnnotatedType(
            JSON.parse(JSON.stringify(serializeAnnotatedType(type)))
          )
          const runtime = ajv.compile(buildJsonSchema(type))
          const bundled = ajv.compile((type as any).toJsonSchema())
          const opts = (new Validator(type) as any).opts
          const forms = {
            fastPath: !fastCheckPasses(type, long, opts),
            metadata: nodes.length > 0 && nodes.every(n => n.metadata.get('meta.label') === 'x'),
            validator: !new Validator(type).validate(long, true),
            restored:
              nodesAt(restored, steps).every(n => n.metadata.get('meta.label') === 'x') &&
              !new Validator(restored).validate(long, true),
            runtimeSchema: !runtime(long),
            bundledSchema: !bundled(long),
          }
          // (the value is otherwise valid: only the string at the position decides)
          const valid = [
            fastCheckPasses(type, short, opts),
            new Validator(type).validate(short, true),
            runtime(short),
            bundled(short),
          ].every(Boolean)
          got[where] = { ...forms, valid, nodes: nodes.length > 0 }
          want[where] = {
            fastPath: labelled,
            metadata: labelled,
            validator: labelled,
            restored: labelled,
            runtimeSchema: labelled,
            bundledSchema: labelled,
            valid: true,
            nodes: true,
          }
        }
        expect(got).toEqual(want)
      })
    }
  }
})

// A prop of a type referencing that prop from inside it (`T.d` in `T.d`, also the reference a
// type built from an annotated one makes to its prop holding an override): the reference has no
// id of its own, so serializing and flattening it used to recurse forever.
describe('a reference reaching itself through the prop it names', () => {
  it('serializes, flattens and builds a JSON schema', async () => {
    const { T } = await load(
      'export interface T {\n  d?: { x?: T.d, s?: string.email }\n}\n',
      false,
      // (a bundled schema of such a reference is not built: generation overflows, as in 0.1.110)
      false
    )
    const restored = deserializeAnnotatedType(JSON.parse(JSON.stringify(serializeAnnotatedType(T))))
    const value = (s: string) => ({ d: { x: { x: { s } } } })
    for (const type of [T, restored]) {
      expect(new Validator(type).validate(value('a@b.co'), true)).toBe(true)
      expect(new Validator(type).validate(value('nope'), true)).toBe(false)
    }
    // (cut where the prop reaches itself again: `d.x` is `d` — the same depth as a deserialized
    // copy, and as the build-time flattening)
    expect([...flattenAnnotatedType(T as any).keys()]).toEqual(['', 'd', 'd.x', 'd.s'])
    expect([...flattenAnnotatedType(restored as any).keys()]).toEqual(['', 'd', 'd.x', 'd.s'])
    const ajv = new Ajv({ strict: false, validateFormats: false })
    const schema = ajv.compile(buildJsonSchema(T))
    expect([schema(value('a@b.co')), schema(value('nope'))]).toEqual([true, false])
  })
})
