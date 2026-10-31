import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { AnnotationSpec, build, FLATTEN_WEB } from '@atscript/core'
import type { AtscriptDoc } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import type * as DefaultValue from '../runtime/default-value'
import type * as Flatten from '../runtime/flatten'
import type * as Serialize from '../runtime/serialize'
import { buildErrors, dtsFlat, type TDtsFlatEntry } from './dts-flat'

/*
 * Readers of a recursive type cut it where it unfolds again: the runtime flatten, the flatten of
 * its deserialized copy and the build-time flatten (the `.d.ts` `static __flat`, the db layer's
 * columns) give one layout, and default values stop at the same place. Each level of a
 * self-intersection is a merge of its own, a path override derives the defs along its path, and
 * an `extends` reads its parents with their `annotate` blocks folded in — none of them changes
 * where the recursion is cut (round-20 review, readers F1 / F2; each failed before).
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const annotations = { db: { json: new AnnotationSpec({}) } }

// The readers of the runtime the loaded modules use: `vi.resetModules` gives them a fresh one
// (its registries — merged and shared slots — are the ones the readers' cut reads).
let flattenAnnotatedType: typeof Flatten.flattenAnnotatedType
let createDataFromAnnotatedType: typeof DefaultValue.createDataFromAnnotatedType
let serializeAnnotatedType: typeof Serialize.serializeAnnotatedType
let deserializeAnnotatedType: typeof Serialize.deserializeAnnotatedType

interface TLoaded {
  modules: Record<string, any>
  /** The build-time flatten of interface `name` declared in `file`. */
  core: (file: string, name: string) => Map<string, TDtsFlatEntry>
}

/** Builds `files` in one build and loads their modules. */
async function load(files: Record<string, string>): Promise<TLoaded> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-readers-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({})],
    annotations: annotations as never,
  })
  const diagnostics = await repo.diagnostics()
  const errors = [...diagnostics.values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const out of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
  }
  vi.resetModules()
  const modules: Record<string, any> = {}
  for (const name of Object.keys(files)) {
    const module = await import(path.join(dir, `${name}.js`))
    Object.assign(modules, module)
  }
  ;({ flattenAnnotatedType } = await import('../runtime/flatten'))
  ;({ createDataFromAnnotatedType } = await import('../runtime/default-value'))
  ;({ serializeAnnotatedType, deserializeAnnotatedType } = await import('../runtime/serialize'))
  const core = (file: string, name: string) => {
    const doc = repo.getDoc(`file://${path.join(dir, file)}`) as AtscriptDoc
    return dtsFlat(doc, name, {}) ?? new Map<string, TDtsFlatEntry>()
  }
  return { modules, core }
}

/** The flattened paths of `type` (failing past `cap` fields: a recursion not cut). */
function runtimeKeys(type: TAtscriptAnnotatedType, cap = 5000): string[] {
  let fields = 0
  const flat = flattenAnnotatedType(type as never, {
    onField: () => {
      if (++fields > cap) {
        throw new Error(`more than ${cap} fields`)
      }
    },
  })
  return [...flat.keys()].filter(Boolean).sort()
}

const coreKeys = (flat: Map<string, unknown>) => [...flat.keys()].filter(Boolean).sort()

const deserialized = (type: TAtscriptAnnotatedType) =>
  deserializeAnnotatedType(JSON.parse(JSON.stringify(serializeAnnotatedType(type))))

/** Runtime, deserialized and build-time flatten of every interface `names` of `file` agree. */
function expectOneLayout(loaded: TLoaded, file: string, names: string[]) {
  const layouts: Record<string, string[]> = {}
  for (const name of names) {
    const type = loaded.modules[name] as TAtscriptAnnotatedType
    const keys = runtimeKeys(type)
    expect(runtimeKeys(deserialized(type)), `${name} deserialized`).toEqual(keys)
    expect(coreKeys(loaded.core(file, name)), `${name} build-time`).toEqual(keys)
    layouts[name] = keys
  }
  return layouts
}

const meta = `export interface Meta {
  note?: string
}
`

/** `n` props of interface `name` typed `name & Meta`. */
const selfProps = (name: string, n: number) =>
  Array.from({ length: n }, (_, i) => `  p${i + 1}?: ${name} & Meta`).join('\n')

describe('readers cut a self-intersection where it unfolds again (F2)', () => {
  const source = `${meta}
export interface K5 {
  name?: string
${selfProps('K5', 5)}
}
export interface K8 {
  name?: string
${selfProps('K8', 8)}
}
export interface Tree {
  v?: number
  left?: Tree & Meta
  right?: Tree & Meta
}
export interface N3 {
  name: string
  next?: (N3 & Meta) | null
  kids?: (N3 & Meta)[]
}
export interface A {
  x?: string
  b?: B & Meta
}
export interface B {
  y?: string
  a?: A & Meta
}
`

  it('every level of it is the type it unfolds to, at runtime, deserialized and at build', async () => {
    const loaded = await load({ 'a.as': source })
    const layouts = expectOneLayout(loaded, 'a.as', ['K5', 'K8', 'Tree', 'N3', 'A', 'B'])
    // `p1.p2` merges `K8 & Meta` again: no factorial of the props
    expect(layouts.K8).toHaveLength(89)
    expect(layouts.K5).toHaveLength(41)
    expect(layouts.Tree).toEqual([
      'left',
      'left.left',
      'left.note',
      'left.right',
      'left.v',
      'right',
      'right.left',
      'right.note',
      'right.right',
      'right.v',
      'v',
    ])
    expect(layouts.N3).toEqual([
      'kids',
      'kids.kids',
      'kids.name',
      'kids.next',
      'kids.note',
      'name',
      'next',
      'next.kids',
      'next.name',
      'next.next',
      'next.note',
    ])
  })

  it('a merge of mutually recursive types is a compile error where a db table flattens it', async () => {
    // (`A.b` is `B & Meta`, which holds `a: A & Meta`, which holds `b: B & Meta`: a recursion
    // cycle through two distinct merges, a web — MODEL §14 P5-1; only validated, it builds)
    expect(
      await buildErrors({ 'a.as': `${source}@db.table 'h'\nexport interface H {\n  a?: A\n}\n` })
    ).toEqual([FLATTEN_WEB])
    expect(await buildErrors({ 'a.as': source })).toEqual([])
  })

  it('default values stop where flattening does', async () => {
    const { modules } = await load({ 'a.as': source })
    expect(createDataFromAnnotatedType(modules.Tree, { mode: 'example' })).toEqual({
      v: 0,
      left: { v: 0, note: '' },
      right: { v: 0, note: '' },
    })
    const example = JSON.stringify(createDataFromAnnotatedType(modules.K8, { mode: 'example' }))
    expect(example.length).toBeLessThan(300)
    expect(createDataFromAnnotatedType(deserialized(modules.Tree), { mode: 'example' })).toEqual(
      createDataFromAnnotatedType(modules.Tree, { mode: 'example' })
    )
  })

  it('a path override does not change the layout', async () => {
    const types = `${meta}
export interface Address {
  city?: string
  next?: Address & Meta
}
export interface User {
  work?: Address
  home?: Address
}
`
    const plain = await load({ 'a.as': types })
    const expected = expectOneLayout(plain, 'a.as', ['Address', 'User'])
    expect(expected.User).toEqual([
      'home',
      'home.city',
      'home.next',
      'home.next.city',
      'home.next.next',
      'home.next.note',
      'work',
      'work.city',
      'work.next',
      'work.next.city',
      'work.next.next',
      'work.next.note',
    ])
    const plainExample = createDataFromAnnotatedType(plain.modules.User, { mode: 'example' })
    for (const entry of ['work.next.city', 'work.next.next.city', 'work.next.next.next.city']) {
      const overridden = await load({
        'a.as': types,
        'b.as': `import { User } from './a'\nannotate User {\n  @meta.label 'x'\n  ${entry}\n}\n`,
      })
      expect(expectOneLayout(overridden, 'a.as', ['Address', 'User']), entry).toEqual(expected)
      expect(createDataFromAnnotatedType(overridden.modules.User, { mode: 'example' })).toEqual(
        plainExample
      )
    }
  })
})

describe('build-time flatten cuts named recursion where the runtime does (F1)', () => {
  it('at the root, and through the parents an `extends` reads with their blocks', async () => {
    const loaded = await load({
      'a.as': `export interface Address {
  city: string
  next?: Address
}
export interface User {
  home: Address
}
export interface Admin extends User {
  lvl: number
}
export interface Plain extends User {
  lvl?: number
}
export interface Node {
  name?: string
  next?: Node
  kids?: Node[]
  alt?: Node | Address
}
`,
      'b.as': `import { User } from './a'
annotate User {
  @meta.label 'home city'
  home.city
}
`,
    })
    const layouts = expectOneLayout(loaded, 'a.as', ['Address', 'User', 'Admin', 'Plain', 'Node'])
    expect(layouts.Address).toEqual(['city', 'next'])
    expect(layouts.Admin).toEqual(['home', 'home.city', 'home.next', 'lvl'])
    expect(layouts.Plain).toEqual(layouts.Admin)
    expect(layouts.Node).toEqual(['alt', 'alt.city', 'alt.next', 'kids', 'name', 'next'])
  })

  it('blocks folded through aliases, unions, chains and parents change no layout', async () => {
    const types = `export interface Address {
  city: string
  next?: Address
}
export interface Other {
  city: string
}
export type AddrA = Address
export interface A {
  name: string
  b?: B
}
export interface B extends A {
  x?: string
}
export interface User {
  home: Address
  ali: AddrA
  uni: Address | Other
  nul?: Address | null
  arr: Address[]
  mer: Address & { zip?: string }
  b: B
}
export interface X {
  hh: User.home
}
`
    const names = ['Address', 'A', 'B', 'User', 'X']
    const plain = expectOneLayout(await load({ 'a.as': types }), 'a.as', names)
    const blocks = `import { User, A } from './a'
annotate User {
  @meta.label 'x'
  home.city
  @meta.label 'x'
  ali.city
  @meta.label 'x'
  uni.city
  @meta.label 'x'
  nul.city
  @meta.label 'x'
  arr.city
  @meta.label 'x'
  mer.city
  @meta.label 'x'
  b.name
}
annotate A {
  @meta.label 'a'
  name
}
`
    const annotated = await load({ 'a.as': types, 'b.as': blocks })
    expect(expectOneLayout(annotated, 'a.as', names)).toEqual(plain)
    // a bare alias is its target (MODEL §10 D3: `AddrA` is `Address` in the generated JS):
    // `ali` is Address, its `next` the recursion (0.1.110 gave the alias an id of its own)
    expect(plain.User).not.toContain('ali.next.next')
    expect(plain.User).not.toContain('home.next.city')
  })

  it('a block setting `@db.json` makes a json leaf of the type, its children and referrers', async () => {
    const loaded = await load({
      'a.as': `export interface P {
  obj: {
    a?: string
    b?: string
  }
  other: {
    c?: string
  }
}
export interface C extends P {
  x?: string
}
export interface R {
  p: P
  c: C
}
`,
      'b.as': `import { P } from './a'
annotate P {
  @db.json
  obj
}
`,
    })
    const { core, modules } = loaded
    for (const [name, at] of [
      ['P', 'obj'],
      ['C', 'obj'],
      ['R', 'p.obj'],
      ['R', 'c.obj'],
    ]) {
      const flat = core('a.as', name)
      expect(flat.get(at)?.dbJson, `${name} ${at}`).toBe(true)
      expect(flat.has(`${at}.a`), `${name} ${at}.a`).toBe(false)
      // (the runtime sees the block on the type and through its referrers alike)
      expect(
        flattenAnnotatedType(modules[name])
          .get(at)
          ?.metadata.get('db.json' as never)
      ).toBe(true)
    }
    expect(coreKeys(core('a.as', 'C'))).toEqual(['obj', 'other', 'other.c', 'x'])
  })
})
