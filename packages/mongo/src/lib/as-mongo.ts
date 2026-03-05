import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
import { DbSpace } from '@atscript/utils-db'
import { MongoClient } from 'mongodb'

import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'
import { MongoAdapter } from './mongo-adapter'

/**
 * MongoDB database space — extends {@link DbSpace} with MongoDB-specific
 * features (cached collection list, `Db` access, `MongoAdapter` factory).
 *
 * ```typescript
 * const asMongo = new AsMongo('mongodb://localhost:27017/mydb')
 * const users = asMongo.getTable(UsersType)
 * const posts = asMongo.getTable(PostsType)
 * // Relation loading via $with works automatically
 * ```
 */
export class AsMongo extends DbSpace {
  public readonly client: MongoClient

  constructor(
    client: string | MongoClient,
    logger: TGenericLogger = NoopLogger
  ) {
    const resolvedClient = typeof client === 'string' ? new MongoClient(client) : client
    // Adapter factory — captures `this` via arrow for lazy db/asMongo access
    super(() => new MongoAdapter(this.db, this), logger)
    this.client = resolvedClient
  }

  get db() {
    return this.client.db()
  }

  // ── Collection list caching (Mongo-specific) ────────────────────────────

  protected collectionsList?: Promise<Set<string>>

  protected getCollectionsList() {
    if (!this.collectionsList) {
      this.collectionsList = this.db
        .listCollections()
        .toArray()
        .then(c => new Set(c.map(c => c.name)))
    }
    return this.collectionsList
  }

  async collectionExists(name: string) {
    const list = await this.getCollectionsList()
    return list.has(name)
  }

  /**
   * Returns the MongoAdapter for the given type.
   * Convenience accessor for Mongo-specific adapter operations.
   */
  override getAdapter(type: TAtscriptAnnotatedType): MongoAdapter {
    return super.getAdapter(type) as MongoAdapter
  }
}
