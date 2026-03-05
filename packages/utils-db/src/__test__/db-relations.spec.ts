import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { FilterExpr } from '@uniqu/core'
import { defineAnnotatedType as $ } from '@atscript/typescript/utils'

import { AtscriptDbTable } from '../db-table'
import { DbSpace } from '../db-space'
import { BaseDbAdapter } from '../base-adapter'
import type {
  DbQuery,
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
} from '../types'

// ── Build types programmatically ─────────────────────────────────────────

let Author: any
let Post: any
let Comment: any

function buildTypes() {
  // Forward-declare classes so refTo can use them
  class AuthorClass {
    static __is_atscript_annotated_type = true
    static type = {}
    static metadata = new Map()
    static id = 'Author'
  }
  class PostClass {
    static __is_atscript_annotated_type = true
    static type = {}
    static metadata = new Map()
    static id = 'Post'
  }
  class CommentClass {
    static __is_atscript_annotated_type = true
    static type = {}
    static metadata = new Map()
    static id = 'Comment'
  }

  // Author: id, name, createdAt, posts (rel.from)
  $('object', AuthorClass)
    .prop('id', $().designType('number').tags('number').annotate('meta.id', true).annotate('db.default.fn', 'increment').$type)
    .prop('name', $().designType('string').tags('string').$type)
    .prop('createdAt', $().designType('number').tags('created', 'timestamp', 'number').annotate('db.default.fn', 'now').optional().$type)
    .prop('posts', $('array').of($().refTo(() => PostClass).$type).annotate('db.rel.from', true).optional().$type)
    .annotate('db.table', 'authors')

  // Post: id, title, status, createdAt, authorId (FK), author (rel.to), comments (rel.from)
  $('object', PostClass)
    .prop('id', $().designType('number').tags('number').annotate('meta.id', true).annotate('db.default.fn', 'increment').$type)
    .prop('title', $().designType('string').tags('string').$type)
    .prop('status', $().designType('string').tags('string').annotate('db.default.value', 'draft').$type)
    .prop('createdAt', $().designType('number').tags('created', 'timestamp', 'number').annotate('db.default.fn', 'now').optional().$type)
    .prop('authorId', $().refTo(() => AuthorClass, ['id']).annotate('db.rel.FK', true).annotate('db.rel.onDelete', 'cascade').$type)
    .prop('author', $().refTo(() => AuthorClass).annotate('db.rel.to', true).optional().$type)
    .prop('comments', $('array').of($().refTo(() => CommentClass).$type).annotate('db.rel.from', true).optional().$type)
    .annotate('db.table', 'posts')

  // Comment: id, body, createdAt, postId (FK), post (rel.to)
  $('object', CommentClass)
    .prop('id', $().designType('number').tags('number').annotate('meta.id', true).annotate('db.default.fn', 'increment').$type)
    .prop('body', $().designType('string').tags('string').$type)
    .prop('createdAt', $().designType('number').tags('created', 'timestamp', 'number').annotate('db.default.fn', 'now').optional().$type)
    .prop('postId', $().refTo(() => PostClass, ['id']).annotate('db.rel.FK', true).annotate('db.rel.onDelete', 'cascade').$type)
    .prop('post', $().refTo(() => PostClass).annotate('db.rel.to', true).optional().$type)
    .annotate('db.table', 'comments')

  return { Author: AuthorClass, Post: PostClass, Comment: CommentClass }
}

// ── Mock adapter that stores data in memory ──────────────────────────────

class InMemoryAdapter extends BaseDbAdapter {
  private _store: Array<Record<string, unknown>> = []
  private _nextId = 1

  seed(rows: Array<Record<string, unknown>>): void {
    for (const row of rows) {
      this._store.push({ ...row })
      const id = row.id as number
      if (id >= this._nextId) { this._nextId = id + 1 }
    }
  }

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    const id = data.id ?? this._nextId++
    const row = { ...data, id }
    this._store.push(row)
    return { insertedId: id as number }
  }

  async insertMany(data: Array<Record<string, unknown>>): Promise<TDbInsertManyResult> {
    const ids: number[] = []
    for (const item of data) {
      const result = await this.insertOne(item)
      ids.push(result.insertedId as number)
    }
    return { insertedCount: ids.length, insertedIds: ids }
  }

  async replaceOne(_filter: FilterExpr, _data: Record<string, unknown>): Promise<TDbUpdateResult> {
    return { matchedCount: 0, modifiedCount: 0 }
  }

  async updateOne(_filter: FilterExpr, _data: Record<string, unknown>): Promise<TDbUpdateResult> {
    return { matchedCount: 0, modifiedCount: 0 }
  }

  async deleteOne(_filter: FilterExpr): Promise<TDbDeleteResult> {
    return { deletedCount: 0 }
  }

  async findOne(query: DbQuery): Promise<Record<string, unknown> | null> {
    const results = await this.findMany(query)
    return results[0] ?? null
  }

  private _matchFilter(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    if ('$and' in filter) {
      return (filter.$and as Array<Record<string, unknown>>).every(f => this._matchFilter(row, f))
    }
    if ('$or' in filter) {
      return (filter.$or as Array<Record<string, unknown>>).some(f => this._matchFilter(row, f))
    }
    return Object.entries(filter).every(([key, condition]) => {
      if (typeof condition === 'object' && condition !== null) {
        const ops = condition as Record<string, unknown>
        if ('$in' in ops) { return (ops.$in as unknown[]).includes(row[key]) }
        if ('$regex' in ops) { return new RegExp(String(ops.$regex)).test(String(row[key] ?? '')) }
      }
      return row[key] === condition
    })
  }

  async findMany(query: DbQuery): Promise<Array<Record<string, unknown>>> {
    let results = [...this._store]

    if (query.filter && Object.keys(query.filter).length > 0) {
      results = results.filter(row => this._matchFilter(row, query.filter as Record<string, unknown>))
    }

    const controls = query.controls || {}
    if (controls.$limit) {
      results = results.slice(0, controls.$limit as number)
    }

    return results
  }

  async count(query: DbQuery): Promise<number> {
    return (await this.findMany(query)).length
  }

  async updateMany(_filter: FilterExpr, _data: Record<string, unknown>): Promise<TDbUpdateResult> {
    return { matchedCount: 0, modifiedCount: 0 }
  }

  async replaceMany(_filter: FilterExpr, _data: Record<string, unknown>): Promise<TDbUpdateResult> {
    return { matchedCount: 0, modifiedCount: 0 }
  }

  async deleteMany(_filter: FilterExpr): Promise<TDbDeleteResult> {
    return { deletedCount: 0 }
  }

  async syncIndexes(): Promise<void> {}
  async ensureTable(): Promise<void> {}
}

// Helper to build WithRelation objects (Uniquery & { name })
function withRel(name: string, opts?: { filter?: any; controls?: any }): any {
  return { name, filter: opts?.filter ?? {}, controls: opts?.controls ?? {} }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AtscriptDbTable — Relations', () => {
  beforeAll(() => {
    const types = buildTypes()
    Author = types.Author
    Post = types.Post
    Comment = types.Comment
  })

  // ── Nav field purging ─────────────────────────────────────────────────

  describe('nav field purging', () => {
    let table: AtscriptDbTable

    beforeEach(() => {
      table = new AtscriptDbTable(Author, new InMemoryAdapter())
    })

    it('should identify nav fields from @db.rel.from', () => {
      expect(table.navFields.has('posts')).toBe(true)
    })

    it('should add nav fields to ignored fields', () => {
      expect(table.ignoredFields.has('posts')).toBe(true)
    })

    it('should NOT register defaults for fields nested under nav fields', () => {
      for (const key of table.defaults.keys()) {
        expect(key.startsWith('posts.')).toBe(false)
      }
    })

    it('should NOT register primary keys from nav field descendants', () => {
      for (const pk of table.primaryKeys) {
        expect(pk.startsWith('posts.')).toBe(false)
      }
    })

    it('should only have own defaults (id, createdAt)', () => {
      const defaultKeys = [...table.defaults.keys()]
      expect(defaultKeys).toContain('id')
      expect(defaultKeys).toContain('createdAt')
      expect(defaultKeys).toHaveLength(2)
    })

    it('should purge nav descendant defaults on Post table', () => {
      const postTable = new AtscriptDbTable(Post, new InMemoryAdapter())
      for (const key of postTable.defaults.keys()) {
        expect(key.startsWith('comments.')).toBe(false)
        expect(key.startsWith('author.')).toBe(false)
      }
      expect(postTable.defaults.has('id')).toBe(true)
      expect(postTable.defaults.has('status')).toBe(true)
      expect(postTable.defaults.has('createdAt')).toBe(true)
    })
  })

  // ── FK metadata ───────────────────────────────────────────────────────

  describe('FK metadata', () => {
    it('should extract FK from @db.rel.FK on Post.authorId', () => {
      const postTable = new AtscriptDbTable(Post, new InMemoryAdapter())
      const fks = [...postTable.foreignKeys.values()]
      const authorFK = fks.find(fk => fk.fields.includes('authorId'))
      expect(authorFK).toBeDefined()
      expect(authorFK!.targetTable).toBe('authors')
      expect(authorFK!.targetFields).toEqual(['id'])
    })

    it('should extract onDelete from @db.rel.onDelete', () => {
      const postTable = new AtscriptDbTable(Post, new InMemoryAdapter())
      const fks = [...postTable.foreignKeys.values()]
      const authorFK = fks.find(fk => fk.fields.includes('authorId'))
      expect(authorFK!.onDelete).toBe('cascade')
    })

    it('should extract FK on Comment.postId pointing to Post', () => {
      const commentTable = new AtscriptDbTable(Comment, new InMemoryAdapter())
      const fks = [...commentTable.foreignKeys.values()]
      const postFK = fks.find(fk => fk.fields.includes('postId'))
      expect(postFK).toBeDefined()
      expect(postFK!.targetTable).toBe('posts')
      expect(postFK!.targetFields).toEqual(['id'])
      expect(postFK!.onDelete).toBe('cascade')
    })
  })

  // ── Relation metadata ─────────────────────────────────────────────────

  describe('relation metadata', () => {
    it('should extract @db.rel.to relation on Post.author', () => {
      const postTable = new AtscriptDbTable(Post, new InMemoryAdapter())
      const rel = postTable.relations.get('author')
      expect(rel).toBeDefined()
      expect(rel!.direction).toBe('to')
      expect(rel!.isArray).toBe(false)
    })

    it('should extract @db.rel.from relation on Post.comments', () => {
      const postTable = new AtscriptDbTable(Post, new InMemoryAdapter())
      const rel = postTable.relations.get('comments')
      expect(rel).toBeDefined()
      expect(rel!.direction).toBe('from')
      expect(rel!.isArray).toBe(true)
    })

    it('should extract @db.rel.from relation on Author.posts', () => {
      const authorTable = new AtscriptDbTable(Author, new InMemoryAdapter())
      const rel = authorTable.relations.get('posts')
      expect(rel).toBeDefined()
      expect(rel!.direction).toBe('from')
      expect(rel!.isArray).toBe(true)
    })

    it('should extract @db.rel.to relation on Comment.post', () => {
      const commentTable = new AtscriptDbTable(Comment, new InMemoryAdapter())
      const rel = commentTable.relations.get('post')
      expect(rel).toBeDefined()
      expect(rel!.direction).toBe('to')
      expect(rel!.isArray).toBe(false)
    })

    it('should resolve targetType to the actual type class', () => {
      const postTable = new AtscriptDbTable(Post, new InMemoryAdapter())
      const authorRel = postTable.relations.get('author')
      const target = authorRel!.targetType()
      expect(target).toBe(Author)
    })

    it('should resolve array targetType to the element type class', () => {
      const postTable = new AtscriptDbTable(Post, new InMemoryAdapter())
      const commentsRel = postTable.relations.get('comments')
      const target = commentsRel!.targetType()
      expect(target).toBe(Comment)
    })
  })

  // ── $with relation loading ────────────────────────────────────────────

  describe('$with relation loading', () => {
    let db: DbSpace

    function seedData() {
      const authorAdapter = (db.getTable(Author) as any).adapter as InMemoryAdapter
      authorAdapter.seed([
        { id: 1, name: 'Alice', createdAt: 1000 },
        { id: 2, name: 'Bob', createdAt: 1001 },
      ])

      const postAdapter = (db.getTable(Post) as any).adapter as InMemoryAdapter
      postAdapter.seed([
        { id: 1, title: 'First Post', status: 'published', authorId: 1, createdAt: 2000 },
        { id: 2, title: 'Second Post', status: 'draft', authorId: 1, createdAt: 2001 },
        { id: 3, title: 'Bobs Post', status: 'published', authorId: 2, createdAt: 2002 },
      ])

      const commentAdapter = (db.getTable(Comment) as any).adapter as InMemoryAdapter
      commentAdapter.seed([
        { id: 1, body: 'Nice post!', postId: 1, createdAt: 3000 },
        { id: 2, body: 'Thanks!', postId: 1, createdAt: 3001 },
        { id: 3, body: 'Interesting', postId: 3, createdAt: 3002 },
      ])
    }

    beforeEach(() => {
      db = new DbSpace(() => new InMemoryAdapter())
      // Initialize all tables first, then seed
      db.getTable(Author)
      db.getTable(Post)
      db.getTable(Comment)
      seedData()
    })

    it('should load @db.rel.to relation (Post.author)', async () => {
      const postTable = db.getTable(Post)
      const results = await postTable.findMany({
        filter: {},
        controls: { $with: [withRel('author')] },
      })

      expect(results).toHaveLength(3)
      expect(results[0].author).toEqual({ id: 1, name: 'Alice', createdAt: 1000 })
      expect(results[1].author).toEqual({ id: 1, name: 'Alice', createdAt: 1000 })
      expect(results[2].author).toEqual({ id: 2, name: 'Bob', createdAt: 1001 })
    })

    it('should load @db.rel.from relation (Post.comments)', async () => {
      const postTable = db.getTable(Post)
      const results = await postTable.findMany({
        filter: { id: 1 },
        controls: { $with: [withRel('comments')] },
      })

      expect(results).toHaveLength(1)
      expect(results[0].comments).toHaveLength(2)
      expect(results[0].comments[0].body).toBe('Nice post!')
      expect(results[0].comments[1].body).toBe('Thanks!')
    })

    it('should load @db.rel.from relation (Author.posts)', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: { $with: [withRel('posts')] },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(2)
      expect(results[0].posts[0].title).toBe('First Post')
      expect(results[0].posts[1].title).toBe('Second Post')
    })

    it('should load @db.rel.to relation (Comment.post)', async () => {
      const commentTable = db.getTable(Comment)
      const results = await commentTable.findMany({
        filter: {},
        controls: { $with: [withRel('post')] },
      })

      expect(results).toHaveLength(3)
      expect(results[0].post.title).toBe('First Post')
      expect(results[2].post.title).toBe('Bobs Post')
    })

    it('should load multiple relations at once', async () => {
      const postTable = db.getTable(Post)
      const results = await postTable.findMany({
        filter: {},
        controls: { $with: [withRel('author'), withRel('comments')] },
      })

      expect(results).toHaveLength(3)
      expect(results[0].author.name).toBe('Alice')
      expect(results[0].comments).toHaveLength(2)
      expect(results[1].author.name).toBe('Alice')
      expect(results[1].comments).toHaveLength(0)
      expect(results[2].author.name).toBe('Bob')
      expect(results[2].comments).toHaveLength(1)
    })

    it('should return empty array for @db.rel.from with no matching records', async () => {
      const postTable = db.getTable(Post)
      const results = await postTable.findMany({
        filter: { id: 2 },
        controls: { $with: [withRel('comments')] },
      })

      expect(results).toHaveLength(1)
      expect(results[0].comments).toEqual([])
    })

    it('should assign null for @db.rel.to with null FK', async () => {
      // Insert a post with null authorId directly via adapter (skip validation)
      const postAdapter = (db.getTable(Post) as any).adapter as InMemoryAdapter
      postAdapter.seed([{ id: 99, title: 'Orphan', status: 'draft', authorId: null, createdAt: 9000 }])

      const postTable = db.getTable(Post)
      const results = await postTable.findMany({
        filter: { id: 99 },
        controls: { $with: [withRel('author')] },
      })

      expect(results).toHaveLength(1)
      expect(results[0].author).toBeNull()
    })

    it('should throw for unknown relation names in $with', async () => {
      const postTable = db.getTable(Post)
      await expect(
        postTable.findMany({
          filter: {},
          controls: { $with: [withRel('nonexistent')] },
        })
      ).rejects.toThrow('Unknown relation "nonexistent"')
    })

    it('should throw when $with references a non-nav field (e.g. FK field)', async () => {
      const postTable = db.getTable(Post)
      await expect(
        postTable.findMany({
          filter: {},
          controls: { $with: [withRel('authorId')] },
        })
      ).rejects.toThrow('Unknown relation "authorId"')
    })

    it('should load nested $with (Post.comments via tasks($with=comments) syntax)', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: {
          $with: [withRel('posts', { controls: { $with: [withRel('comments')] } })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(2)
      // First post has 2 comments
      expect(results[0].posts[0].comments).toHaveLength(2)
      expect(results[0].posts[0].comments[0].body).toBe('Nice post!')
      expect(results[0].posts[0].comments[1].body).toBe('Thanks!')
      // Second post has 0 comments
      expect(results[0].posts[1].comments).toEqual([])
    })

    it('should throw for invalid nested $with relation names', async () => {
      const authorTable = db.getTable(Author)
      await expect(
        authorTable.findMany({
          filter: {},
          controls: {
            $with: [withRel('posts', { controls: { $with: [withRel('bogus')] } })],
          },
        })
      ).rejects.toThrow('Unknown relation "bogus"')
    })

    it('should forward $select to the correct nested relation level', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: {
          // $select=body should be on comments, not on posts
          $with: [withRel('posts', { controls: { $with: [withRel('comments', { controls: { $select: ['body'] } })] } })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(2)
      // First post has 2 comments — each should have been queried with $select=body
      expect(results[0].posts[0].comments).toHaveLength(2)
      expect(results[0].posts[0].comments[0].body).toBe('Nice post!')
    })

    it('should apply $select at the relation level it is specified on', async () => {
      const postTable = db.getTable(Post)
      const results = await postTable.findMany({
        filter: { id: 1 },
        controls: {
          // $select on comments level (correct usage for selecting comment fields)
          $with: [withRel('comments', { controls: { $select: ['body'] } })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].comments).toHaveLength(2)
      expect(results[0].comments[0].body).toBe('Nice post!')
    })

    // ── 2-level deep nested controls + filters ────────────────────────

    it('should forward $limit to nested relation', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: {
          $with: [withRel('posts', { controls: { $limit: 1 } })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(1)
    })

    it('should apply filter on nested relation', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: {
          $with: [withRel('posts', { filter: { status: 'published' } })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(1)
      expect(results[0].posts[0].title).toBe('First Post')
    })

    it('should apply filter + nested $with with filter (2 levels deep)', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: {
          $with: [withRel('posts', {
            filter: { status: 'published' },
            controls: {
              $with: [withRel('comments', { filter: { body: { $regex: 'Nice' } } })],
            },
          })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(1)
      expect(results[0].posts[0].comments).toHaveLength(1)
      expect(results[0].posts[0].comments[0].body).toBe('Nice post!')
    })

    it('should apply $select at each nested level', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: {
          $with: [withRel('posts', {
            controls: {
              $select: ['title'],
              $with: [withRel('comments', { controls: { $select: ['body'] } })],
            },
          })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(2)
      expect(results[0].posts[0].title).toBe('First Post')
      expect(results[0].posts[0].comments).toHaveLength(2)
      expect(results[0].posts[0].comments[0].body).toBe('Nice post!')
    })

    it('should apply $limit at 2nd level deep', async () => {
      const authorTable = db.getTable(Author)
      const results = await authorTable.findMany({
        filter: { id: 1 },
        controls: {
          $with: [withRel('posts', {
            controls: {
              $with: [withRel('comments', { controls: { $limit: 1 } })],
            },
          })],
        },
      })

      expect(results).toHaveLength(1)
      expect(results[0].posts).toHaveLength(2)
      // First post: 2 comments but $limit=1
      expect(results[0].posts[0].comments).toHaveLength(1)
      expect(results[0].posts[0].comments[0].body).toBe('Nice post!')
    })

    it('should work without $with (no relation loading)', async () => {
      const postTable = db.getTable(Post)
      const results = await postTable.findMany({ filter: {} })

      expect(results).toHaveLength(3)
      expect(results[0]).not.toHaveProperty('author')
      expect(results[0]).not.toHaveProperty('comments')
    })
  })

  // ── Insert with nav fields ────────────────────────────────────────────

  describe('insert with nav fields', () => {
    it('should not apply defaults for nav field descendants', async () => {
      const adapter = new InMemoryAdapter()
      const table = new AtscriptDbTable(Author, adapter)
      await table.insertOne({ name: 'Charlie' } as any)

      const stored = await adapter.findMany({ filter: {} })
      expect(stored).toHaveLength(1)
      const keys = Object.keys(stored[0])
      for (const key of keys) {
        expect(key.includes('.')).toBe(false)
      }
    })

    it('should reject insert when nav fields are present in payload', async () => {
      const adapter = new InMemoryAdapter()
      const table = new AtscriptDbTable(Author, adapter)
      await expect(
        table.insertOne({ name: 'Charlie', posts: [{ title: 'junk' }] } as any)
      ).rejects.toThrow('Navigational field is not allowed in input')
    })

    it('should accept insert when nav fields are undefined', async () => {
      const adapter = new InMemoryAdapter()
      const table = new AtscriptDbTable(Author, adapter)
      await expect(
        table.insertOne({ name: 'Charlie' } as any)
      ).resolves.toBeDefined()
    })
  })
})
