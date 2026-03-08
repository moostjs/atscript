import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import type { FilterExpr } from '@uniqu/core'

import { DbSpace } from '../db-space'
import { BaseDbAdapter } from '../base-adapter'
import type {
  DbQuery,
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
} from '../types'

import { prepareFixtures } from './test-utils'

let AuthorType: any
let PostType: any
let CommentType: any

// ── Mock adapter (no native FK support) ──────────────────────────────────────

class MockAdapter extends BaseDbAdapter {
  public calls: Array<{ method: string; args: any[] }> = []

  /** In-memory store keyed by table name → rows */
  public store = new Map<string, Array<Record<string, unknown>>>()

  private record(method: string, ...args: any[]) {
    this.calls.push({ method, args })
  }

  private _rows(): Array<Record<string, unknown>> {
    const name = this._table?.tableName ?? ''
    if (!this.store.has(name)) { this.store.set(name, []) }
    return this.store.get(name)!
  }

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    this.record('insertOne', data)
    this._rows().push({ ...data })
    return { insertedId: data.id ?? data._id ?? 1 }
  }

  async insertMany(data: Array<Record<string, unknown>>): Promise<TDbInsertManyResult> {
    this.record('insertMany', data)
    for (const row of data) { this._rows().push({ ...row }) }
    return { insertedCount: data.length, insertedIds: data.map(d => d.id ?? d._id ?? 1) }
  }

  async replaceOne(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    this.record('replaceOne', filter, data)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async updateOne(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    this.record('updateOne', filter, data)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async deleteOne(filter: FilterExpr): Promise<TDbDeleteResult> {
    this.record('deleteOne', filter)
    const rows = this._rows()
    const before = rows.length
    const remaining = rows.filter(r => !matchesFilter(r, filter))
    this.store.set(this._table.tableName, remaining)
    return { deletedCount: before - remaining.length }
  }

  async findOne(query: DbQuery): Promise<Record<string, unknown> | null> {
    this.record('findOne', query)
    return this._rows().find(r => matchesFilter(r, query.filter)) ?? null
  }

  async findMany(query: DbQuery): Promise<Array<Record<string, unknown>>> {
    this.record('findMany', query)
    return this._rows().filter(r => matchesFilter(r, query.filter))
  }

  async count(query: DbQuery): Promise<number> {
    this.record('count', query)
    return this._rows().filter(r => matchesFilter(r, query.filter)).length
  }

  async updateMany(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    this.record('updateMany', filter, data)
    let modified = 0
    for (const row of this._rows()) {
      if (matchesFilter(row, filter)) {
        Object.assign(row, data)
        modified++
      }
    }
    return { matchedCount: modified, modifiedCount: modified }
  }

  async replaceMany(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    this.record('replaceMany', filter, data)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async deleteMany(filter: FilterExpr): Promise<TDbDeleteResult> {
    this.record('deleteMany', filter)
    const rows = this._rows()
    const before = rows.length
    const remaining = rows.filter(r => !matchesFilter(r, filter))
    this.store.set(this._table.tableName, remaining)
    return { deletedCount: before - remaining.length }
  }

  async syncIndexes(): Promise<void> {}
  async ensureTable(): Promise<void> {}
}

/** Simple filter matching for tests — supports exact match and $in */
function matchesFilter(row: Record<string, unknown>, filter: FilterExpr): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or') {
      const clauses = value as Array<Record<string, unknown>>
      if (!clauses.some(clause => matchesFilter(row, clause))) { return false }
      continue
    }
    if (value && typeof value === 'object' && '$in' in (value as Record<string, unknown>)) {
      const inValues = (value as Record<string, unknown>).$in as unknown[]
      if (!inValues.includes(row[key])) { return false }
    } else if (row[key] !== value) {
      return false
    }
  }
  return true
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Cascade Delete', () => {
  // Shared store across all adapters in a DbSpace
  let sharedStore: Map<string, Array<Record<string, unknown>>>

  beforeAll(async () => {
    await prepareFixtures()
    const author = await import('./fixtures/rel-author.as.js')
    const post = await import('./fixtures/test-relations.as.js')
    const comment = await import('./fixtures/rel-comment.as.js')
    AuthorType = author.Author
    PostType = post.Post
    CommentType = comment.Comment
  })

  beforeEach(() => {
    sharedStore = new Map()
  })

  function createSpace() {
    return new DbSpace(() => {
      const adapter = new MockAdapter()
      adapter.store = sharedStore
      return adapter
    })
  }

  function seedData() {
    // Author 1 has posts 10, 20
    // Post 10 has comments 100, 101
    // Post 20 has comments 200
    sharedStore.set('authors', [
      { id: 1, name: 'Alice', createdAt: 1000 },
      { id: 2, name: 'Bob', createdAt: 2000 },
    ])
    sharedStore.set('posts', [
      { id: 10, title: 'Post A', authorId: 1, status: 'published', createdAt: 1000 },
      { id: 20, title: 'Post B', authorId: 1, status: 'draft', createdAt: 2000 },
      { id: 30, title: 'Post C', authorId: 2, status: 'published', createdAt: 3000 },
    ])
    sharedStore.set('comments', [
      { id: 100, body: 'Comment 1', postId: 10, createdAt: 1000 },
      { id: 101, body: 'Comment 2', postId: 10, createdAt: 1001 },
      { id: 200, body: 'Comment 3', postId: 20, createdAt: 2000 },
      { id: 300, body: 'Comment 4', postId: 30, createdAt: 3000 },
    ])
  }

  it('should cascade delete children when parent is deleted (deleteOne)', async () => {
    const space = createSpace()
    const posts = space.getTable(PostType)
    const comments = space.getTable(CommentType)
    space.getTable(AuthorType) // register for FK discovery

    seedData()

    // Delete post 10 → should cascade-delete comments 100, 101
    await posts.deleteOne(10)

    expect(sharedStore.get('posts')!.map(p => p.id)).toEqual([20, 30])
    expect(sharedStore.get('comments')!.map(c => c.id)).toEqual([200, 300])
  })

  it('should cascade delete children when parent is deleted (deleteMany)', async () => {
    const space = createSpace()
    const posts = space.getTable(PostType)
    const comments = space.getTable(CommentType)
    space.getTable(AuthorType)

    seedData()

    // Delete posts by author 1 → should cascade-delete their comments
    await posts.deleteMany({ authorId: 1 })

    expect(sharedStore.get('posts')!.map(p => p.id)).toEqual([30])
    expect(sharedStore.get('comments')!.map(c => c.id)).toEqual([300])
  })

  it('should cascade transitively (grandparent → parent → child)', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)
    const comments = space.getTable(CommentType)

    seedData()

    // Delete author 1 → cascade posts 10, 20 → cascade comments 100, 101, 200
    await authors.deleteOne(1)

    expect(sharedStore.get('authors')!.map(a => a.id)).toEqual([2])
    expect(sharedStore.get('posts')!.map(p => p.id)).toEqual([30])
    expect(sharedStore.get('comments')!.map(c => c.id)).toEqual([300])
  })

  it('should not cascade when no children exist', async () => {
    const space = createSpace()
    const posts = space.getTable(PostType)
    space.getTable(CommentType)
    space.getTable(AuthorType)

    seedData()

    // Delete post 30 which has one comment (300)
    await posts.deleteOne(30)

    expect(sharedStore.get('posts')!.map(p => p.id)).toEqual([10, 20])
    expect(sharedStore.get('comments')!.map(c => c.id)).toEqual([100, 101, 200])
  })

  it('should not cascade with native FK adapter', async () => {
    // Create a space with an adapter that claims native FK support
    const nativeStore = new Map<string, Array<Record<string, unknown>>>()
    const space = new DbSpace(() => {
      const adapter = new MockAdapter()
      adapter.store = nativeStore
      // Override to simulate native FK support
      adapter.supportsNativeForeignKeys = () => true
      return adapter
    })

    const posts = space.getTable(PostType)
    space.getTable(CommentType)
    space.getTable(AuthorType)

    nativeStore.set('posts', [
      { id: 10, title: 'Post A', authorId: 1, status: 'published', createdAt: 1000 },
    ])
    nativeStore.set('comments', [
      { id: 100, body: 'Comment 1', postId: 10, createdAt: 1000 },
    ])

    // Delete post — with native FK, no application-level cascade
    await posts.deleteOne(10)

    expect(nativeStore.get('posts')!).toHaveLength(0)
    // Comment should NOT be deleted (native adapter handles it)
    expect(nativeStore.get('comments')!).toHaveLength(1)
  })

  it('should handle deleteOne with non-existent record gracefully', async () => {
    const space = createSpace()
    const posts = space.getTable(PostType)
    space.getTable(CommentType)
    space.getTable(AuthorType)

    seedData()

    // Delete a non-existent post — no cascade, no errors
    const result = await posts.deleteOne(999)
    expect(result.deletedCount).toBe(0)

    // Everything untouched
    expect(sharedStore.get('posts')!).toHaveLength(3)
    expect(sharedStore.get('comments')!).toHaveLength(4)
  })
})
