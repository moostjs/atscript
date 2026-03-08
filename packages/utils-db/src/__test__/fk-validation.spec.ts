import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

import { DbSpace } from '../db-space'
import { prepareFixtures, MockAdapter } from './test-utils'

let AuthorType: any
let PostType: any
let CommentType: any

// ── Tests ───────────────────────────────────────────────────────────────────

describe('FK Validation', () => {
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
    sharedStore.set('authors', [
      { id: 1, name: 'Alice', createdAt: 1000 },
      { id: 2, name: 'Bob', createdAt: 2000 },
    ])
    sharedStore.set('posts', [
      { id: 10, title: 'Post A', authorId: 1, status: 'published', createdAt: 1000 },
      { id: 20, title: 'Post B', authorId: 1, status: 'draft', createdAt: 2000 },
    ])
  }

  it('should reject insert with non-existent FK value', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)

    seedData()

    await expect(
      posts.insertOne({ title: 'Bad Post', authorId: 999 })
    ).rejects.toThrow('FK constraint violation')
  })

  it('should allow insert with valid FK value', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)

    seedData()

    const result = await posts.insertOne({ title: 'Good Post', authorId: 1 })
    expect(result.insertedId).toBeDefined()
  })

  it('should reject insertMany when any record has invalid FK', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)

    seedData()

    await expect(
      posts.insertMany([
        { title: 'Good Post', authorId: 1 },
        { title: 'Bad Post', authorId: 999 },
      ] as any)
    ).rejects.toThrow('FK constraint violation')
  })

  it('should reject bulkUpdate with non-existent FK value', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)

    seedData()

    await expect(
      posts.updateOne({ id: 10, authorId: 999 } as any)
    ).rejects.toThrow('FK constraint violation')
  })

  it('should allow bulkUpdate that does not touch FK fields', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)

    seedData()

    // Update only title — no FK validation needed
    const result = await posts.updateOne({ id: 10, title: 'Updated Title' } as any)
    expect(result.matchedCount).toBe(1)
  })

  it('should reject replaceOne with non-existent FK value', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)

    seedData()

    await expect(
      posts.replaceOne({ id: 10, title: 'Replaced', authorId: 999, status: 'published' } as any)
    ).rejects.toThrow('FK constraint violation')
  })

  it('should not validate FK when adapter has native support', async () => {
    const nativeStore = new Map<string, Array<Record<string, unknown>>>()
    const space = new DbSpace(() => {
      const adapter = new MockAdapter()
      adapter.store = nativeStore
      adapter.supportsNativeForeignKeys = () => true
      return adapter
    })

    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)

    nativeStore.set('authors', [])
    nativeStore.set('posts', [])

    // Should NOT throw — native adapter handles FK
    const result = await posts.insertOne({ title: 'Post', authorId: 999 })
    expect(result.insertedId).toBeDefined()
  })

  it('should validate FK transitively (comment → post)', async () => {
    const space = createSpace()
    const authors = space.getTable(AuthorType)
    const posts = space.getTable(PostType)
    const comments = space.getTable(CommentType)

    seedData()

    // Valid: post 10 exists
    const result = await comments.insertOne({ body: 'Good comment', postId: 10 })
    expect(result.insertedId).toBeDefined()

    // Invalid: post 999 does not exist
    await expect(
      comments.insertOne({ body: 'Bad comment', postId: 999 })
    ).rejects.toThrow('FK constraint violation')
  })
})
