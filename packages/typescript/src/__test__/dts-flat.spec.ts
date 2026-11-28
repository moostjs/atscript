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

/** The `__flat` (or `__ownProps`, `__navProps`) block of class `name` in `.d.ts` `text`, as `"path"?: type`. */
function block(
  text: string,
  name: string,
  which: '__flat' | '__ownProps' | '__navProps' = '__flat'
) {
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

  it('a nav prop is listed in __flat, nothing below it (TO, FROM, `| null`); not in __ownProps', async () => {
    const text = await dts(`
      @db.table 'authors'
      export interface Author {
        id: string
        name: string
        @db.rel.from
        posts: Post[]
      }
      @db.table 'posts'
      export interface Post {
        id: string
        @db.rel.to
        author?: Author
        @db.rel.to
        editor: Author | null
        @db.rel.from
        comments: Comment[]
      }
      @db.table 'comments'
      export interface Comment {
        id: string
        @db.rel.to
        post?: Post
      }
    `)
    expect(block(text, 'Post')).toEqual([
      'id: string',
      'author?: never',
      'editor: Author | null',
      'comments: never',
    ])
    expect(block(text, 'Post', '__ownProps')).toEqual(['id: string'])
    expect(block(text, 'Author')).toEqual(['id: string', 'name: string', 'posts: never'])
    expect(block(text, 'Comment')).toEqual(['id: string', 'post?: never'])
  })

  it('a nav prop in a union branch: the flatten stops there too', async () => {
    const text = await dts(`
      @db.table 'authors'
      export interface Author { id: string, name: string }
      @db.table 'posts'
      export interface Post {
        id: string
        by: {
          @db.rel.to
          author: Author
        } | { name: string }
      }
    `)
    expect(block(text, 'Post')).toEqual([
      'id: string',
      'by: never',
      'by.author: never',
      'by.name: string',
    ])
    expect(block(text, 'Post', '__ownProps')).toEqual([
      'id: string',
      'by: never',
      'by.name: string',
    ])
  })

  it('a mesh of tables linked by nav props: each __flat is its own paths and nav keys', async () => {
    // (0.2.23 and before: the paths of every table reachable through nav props, transitively —
    // exponential in the nav graph, a crash of the writer from about 40 such tables)
    const n = 16
    let source = ''
    for (let i = 0; i < n; i++) {
      source += `@db.table 't${i}'
        export interface T${i} {
          id: string
          name?: string
          info: { note: string }
          @db.rel.to
          next?: T${(i + 1) % n}
          @db.rel.from
          kids: T${(i + 3) % n}[]
          @db.rel.via
          peers?: T${(i + 5) % n}[]
        }
      `
    }
    const text = await dts(source)
    const own = ['id: string', 'name?: string | null', 'info: never', 'info.note: string']
    for (let i = 0; i < n; i++) {
      expect(block(text, `T${i}`)).toEqual([...own, 'next?: never', 'kids: never', 'peers?: never'])
      expect(block(text, `T${i}`, '__ownProps')).toEqual(own)
    }
  })

  it('a @db.rel.store field is a nav prop: in __navProps and __flat, not in __ownProps', async () => {
    const text = await dts(`
      @db.table 'authors'
      export interface Author { id: string, name: string }
      @db.table 'posts'
      export interface Post {
        id: string
        @db.rel.store
        author?: Author
        @db.rel.store
        reviewers: Author[]
      }
    `)
    expect(block(text, 'Post')).toEqual(['id: string', 'author?: never', 'reviewers: never'])
    expect(block(text, 'Post', '__ownProps')).toEqual(['id: string'])
    expect(block(text, 'Post', '__navProps')).toEqual(['author?: Author', 'reviewers: Author[]'])
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
