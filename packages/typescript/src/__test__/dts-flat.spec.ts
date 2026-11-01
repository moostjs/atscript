import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'
import { flatBlock } from './dts-flat'

/*
 * The `.d.ts` `static __flat` / `__ownProps` of DB entities: the paths of the runtime flatten (of
 * the class evaluated at build time), typed by what is written at them.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** The generated `.d.ts` of `source` (one file; `@db.*` annotations allowed without a spec). */
async function dts(source: string): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-dts-flat-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'a.as'), source)
  const repo = await build({
    rootDir: dir,
    entries: ['a.as'],
    plugins: [tsPlugin()],
    unknownAnnotation: 'allow',
  })
  const [out] = await repo.generate({ format: 'dts' })
  return out.content
}

/** The `__flat` (or `__ownProps`) block of class `name` in `.d.ts` `text`, as `"path"?: type`. */
function block(text: string, name: string, which: '__flat' | '__ownProps' = '__flat') {
  const start = text.indexOf(`declare class ${name} `)
  const end = text.indexOf('\n}', start)
  const map = flatBlock(text.slice(start, end), which)
  return (
    map &&
    [...map].map(
      ([p, { optional, type }]) => `${p}${optional ? '?' : ''}: ${type.replaceAll('\n', ' ')}`
    )
  )
}

describe('.d.ts __flat / __ownProps', () => {
  it('types leaves as written, intermediate paths never, optional paths `?` and `| null`', async () => {
    const text = await dts(`
      export interface Address {
        street: string
        city?: string
      }
      @db.table 'users'
      export interface User {
        name: string
        nickname?: string
        home: Address
        office?: { floor: number }
        level1: { level2: { level3: string } }
      }
    `)
    expect(block(text, 'User')).toEqual([
      'name: string',
      'nickname?: string | null',
      'home: never',
      'home.street: string',
      'home.city?: string | null',
      'office?: never',
      'office.floor?: number | null',
      'level1: never',
      'level1.level2: never',
      'level1.level2.level3: string',
    ])
  })

  it('arrays: of scalars a leaf, of objects intermediate with the element paths', async () => {
    const text = await dts(`
      @db.table 'users'
      export interface User {
        tags: string[]
        mixed: (number | string)[]
        contacts: { name: string, email?: string }[]
        grid: { v: number }[][]
      }
    `)
    expect(block(text, 'User')).toEqual([
      'tags: string[]',
      'mixed: (number | string)[]',
      'contacts: never',
      'contacts.name: string',
      'contacts.email?: string | null',
      'grid: never',
      'grid.v: number',
    ])
  })

  it('a @db.json field is a `string` leaf', async () => {
    const text = await dts(`
      @db.table 'users'
      export interface User {
        name: string
        @db.json
        metadata: { key: string, value: string }
        @db.json
        items?: { label: string }[]
      }
    `)
    expect(block(text, 'User')).toEqual([
      'name: string',
      'metadata: string',
      'items?: string | null',
    ])
  })

  it('unions: branch paths merged, complex-only intermediate, mixed a leaf', async () => {
    const text = await dts(`
      @db.table 'data'
      export interface Data {
        field: { a: string, b: number } | { a: number, c?: boolean }
        mixed: string | { x: string }
      }
    `)
    expect(block(text, 'Data')).toEqual([
      'field: never',
      'field.a: string | number',
      'field.b: number',
      'field.c?: boolean | null',
      'mixed: string | { x: string }',
      'mixed.x: string',
    ])
  })

  it('a type path through a union types the paths below its field (MODEL §15 CHAIN-1)', async () => {
    const text = await dts(`
      interface I0 { h: string; n: number }
      interface I2 { work: I0 }
      type M0 = I2 | null
      @db.table 'ch'
      export interface CH {
        id: string
        v?: M0.work
      }
    `)
    expect(block(text, 'CH')).toEqual([
      'id: string',
      'v?: never',
      'v.h?: string | null',
      'v.n?: number | null',
    ])
  })

  it('reads `extends` and merges, skips phantom and pattern props', async () => {
    const text = await dts(`
      export interface Base { id: string }
      export interface Stamp { at: number }
      @db.table 'users'
      export interface User extends Base {
        name: string
        hint: phantom
        stamped: Base & Stamp
        [*]: string
      }
    `)
    expect(block(text, 'User')).toEqual([
      'id: string',
      'name: string',
      'stamped: never',
      'stamped.id: string',
      'stamped.at: number',
    ])
  })

  it('nav props are in __flat, not in __ownProps', async () => {
    const text = await dts(`
      export interface Author { id: string, name: string }
      @db.table 'posts'
      export interface Post {
        id: string
        @db.rel.to
        author?: Author
      }
    `)
    expect(block(text, 'Post')).toEqual([
      'id: string',
      'author?: never',
      'author.id?: string | null',
      'author.name?: string | null',
    ])
    expect(block(text, 'Post', '__ownProps')).toEqual(['id: string'])
  })

  it('a recursion is cut where the runtime flatten cuts it (intermediate)', async () => {
    const text = await dts(`
      @db.table 'nodes'
      export interface Node {
        name?: string
        next?: Node
        kids?: Node[]
      }
    `)
    expect(block(text, 'Node')).toEqual(['name?: string | null', 'next?: never', 'kids?: never'])
  })

  it('only DB entities have them; an empty one has none', async () => {
    const text = await dts(`
      export interface Plain { a: string }
      @db.table 'empty'
      export interface Empty {}
    `)
    expect(block(text, 'Plain')).toBeUndefined()
    expect(block(text, 'Empty')).toBeUndefined()
  })
})
