import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * Mutating path annotates of recursive types across modules, found by the random schema fuzzers
 * (cases kept as fixtures): building the types built from them at build time terminates, and
 * their bundled JSON schemas are what the runtime builds.
 */

const fixtures = path.join(__dirname, 'fixtures/annotate-paths-regressions')

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Builds the two fixture files `<name>-a.as` / `<name>-b.as` and loads them (b first). */
async function load(name: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-paths-regressions-'))
  dirs.push(dir)
  const files = [`${name}-a.as`, `${name}-b.as`]
  for (const file of files) {
    writeFileSync(path.join(dir, file), readFileSync(path.join(fixtures, file)))
  }
  const repo = await build({
    rootDir: dir,
    entries: files,
    plugins: [tsPlugin({ jsonSchema: 'bundle' })],
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  vi.resetModules()
  const b = await import(path.join(dir, `${name}-b.as.js`))
  const a = await import(path.join(dir, `${name}-a.as.js`))
  const { buildJsonSchema } = await import('../runtime/json-schema')
  // (MODEL §11: in-place merge operands are extra module exports under a reserved `$` prefix,
  // not annotated types of their own)
  const types = Object.fromEntries(
    Object.entries({ ...b, ...a }).filter(([name]) => !name.startsWith('$'))
  )
  return { types: types as Record<string, any>, buildJsonSchema }
}

describe('mutating path annotates of recursive types across modules', () => {
  // The definitions of re-entered types reaching each other through intersections merged
  // inside them used to build one another again and again (a stack overflow).
  it('build terminates: intersections of re-entered types merged inside each other', async () => {
    const { types, buildJsonSchema } = await load('overflow')
    for (const type of Object.values(types)) {
      expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
    }
  })

  // A path reaching, through a type extending the annotated type (`S2 extends S1`, merged in
  // `S1.c: S2 & { … }`), a prop the annotated type's own node stands for (`S1.c.c` is `S1.c`
  // itself: S2's `c` is S1's, shared): generated code read it as an intersection of its members
  // (it threw at module load). A type extending the annotated one is a type of its own (owner
  // decision, round 23): no self-collapse, the override is at `c.c.c.e.ownS1` — and wherever an
  // `S1` reached below (S2's inherited `c`) has that path below it: `c.c.c.c.e.ownS1` too.
  it('a path through a prop a type inherits from the annotated type loads', async () => {
    const { types, buildJsonSchema } = await load('inherited-live')
    const { S1, S2 } = types
    const description = (type: any, path: string) => {
      let node = type
      for (const key of path.split('.')) {
        node = node.type.props.get(key)
      }
      return node.metadata.get('meta.description')
    }
    // (`c.e` is an intersection of objects nested in a merge, merged at runtime: by prop names)
    expect(S1.type.props.get('c').type.props.get('e').type.kind).toBe('object')
    expect(description(S1, 'c.c.c.e.ownS1')).toBe('Z2')
    expect(description(S1, 'c.c.c.c.e.ownS1')).toBe('Z2')
    expect(description(S2, 'c.c.c.e.ownS1')).toBe('Z2')
    expect(description(S1, 'c.e.ownS1')).toBeUndefined()
    expect(description(S1, 'c.c.e.ownS1')).toBeUndefined()
    expect(description(S1, 'ownS1')).toBeUndefined()
    expect(description(S2, 'ownS1')).toBeUndefined()
    for (const type of Object.values(types)) {
      expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
    }
  })

  // A path going on through one union branch only (`T0.c: T2 | S2`, `c.c.c`): the branch it
  // does not go on through was copied anyway, and the annotation was missing below it. The
  // override is at `c.c.c` only, on both branches; `T2`'s own `c` (`Z2`, T2's block) stays where
  // the path does not override it, and below the path `S2.c` is S2's own.
  it('a path overrides only the branches it goes on through', async () => {
    const { types } = await load('dead-branch')
    const at = (node: any, parts: string[]): any[] =>
      parts.length === 0
        ? [node]
        : node.type.kind === 'union'
          ? node.type.items.flatMap((item: any) => at(item, parts))
          : at(node.type.props.get(parts[0]), parts.slice(1))
    const labels = (path: string) =>
      at(types.T0, path.split('.')).map(n => n.metadata.get('meta.description'))
    expect(labels('c.c')).toEqual(['Z2', undefined])
    expect(labels('c.c.c')).toEqual(['Z1', 'Z1'])
    expect(labels('c.c.c.c')).toEqual([undefined, undefined])
  })

  // A path into a prop the annotated type inherits from a type whose own path overrides it
  // (`S2 extends S1`, `annotate S1 { d.ownS2 }`): `S2.d` stands for `S1.d`, an `S2` — the
  // annotated type itself (it was reported as an unknown property).
  it('a path through a prop standing for another type’s is checked like it', async () => {
    const { types } = await load('inherited-path')
    expect(types.S2.type.props.get('bS1').metadata.get('meta.description')).toBe('Z2')
  })

  it('a reference in a path’s copy to another module’s type keeps its id', async () => {
    const { types, buildJsonSchema } = await load('lazy-id')
    for (const type of Object.values(types)) {
      expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
    }
  })
})
