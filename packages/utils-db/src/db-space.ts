import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

import { AtscriptDbTable } from './db-table'
import type { BaseDbAdapter } from './base-adapter'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'

/**
 * Adapter factory function. Called once per table to create a fresh adapter instance.
 * Each table gets its own adapter (1:1 relationship required by BaseDbAdapter).
 */
export type TAdapterFactory = () => BaseDbAdapter

interface TWeakMapOf<V> {
  has(key: TAtscriptAnnotatedType): boolean
  get(key: TAtscriptAnnotatedType): V | undefined
  set(key: TAtscriptAnnotatedType, value: V): void
}

/**
 * A database space — a registry of tables sharing the same adapter type and driver.
 *
 * `DbSpace` solves the cross-table discovery problem: when table A has a relation
 * to table B, it needs to find and query table B. The space acts as the registry
 * that makes this possible via the table resolver callback.
 *
 * Each table gets its own adapter instance (created by the factory), but all
 * tables share the same space and can discover each other for `$with` relation loading.
 *
 * ```typescript
 * // SQLite
 * const driver = new BetterSqlite3Driver(':memory:')
 * const db = new DbSpace(() => new SqliteAdapter(driver))
 * const users = db.getTable(UsersType)
 * const posts = db.getTable(PostsType)
 * // posts.findMany({ filter: {}, controls: { $with: [{ name: 'author' }] } })
 * // → automatically resolves UsersType via the space
 *
 * // MongoDB
 * const client = new MongoClient(uri)
 * const db = new DbSpace(() => new MongoAdapter(client.db()))
 * ```
 */
export class DbSpace {
  private _tables = new WeakMap() as TWeakMapOf<AtscriptDbTable>

  constructor(
    protected readonly adapterFactory: TAdapterFactory,
    protected readonly logger: TGenericLogger = NoopLogger
  ) {}

  /**
   * Returns the table for the given annotated type.
   * Creates the table + adapter on first access, caches for subsequent calls.
   */
  getTable<T extends TAtscriptAnnotatedType>(
    type: T,
    logger?: TGenericLogger
  ): AtscriptDbTable<T> {
    let table = this._tables.get(type) as AtscriptDbTable<T> | undefined
    if (!table) {
      const adapter = this.adapterFactory()
      table = new AtscriptDbTable<T>(
        type,
        adapter as any,
        logger || this.logger,
        (t) => this.getTable(t) as any
      )
      this._tables.set(type, table as AtscriptDbTable)
    }
    return table
  }

  /**
   * Returns the adapter for the given annotated type.
   * Creates the table + adapter on first access if needed.
   */
  getAdapter(type: TAtscriptAnnotatedType): BaseDbAdapter {
    const table = this.getTable(type)
    return table.dbAdapter
  }

  /**
   * Ensures all registered tables exist in the database.
   * Must be called after all `getTable()` calls so that tables are registered.
   *
   * @param types - The annotated types whose tables to create.
   */
  async ensureAll(types: TAtscriptAnnotatedType[]): Promise<void> {
    for (const type of types) {
      const table = this.getTable(type)
      await table.ensureTable()
    }
  }

  /**
   * Synchronizes indexes for all specified tables.
   *
   * @param types - The annotated types whose indexes to sync.
   */
  async syncAllIndexes(types: TAtscriptAnnotatedType[]): Promise<void> {
    for (const type of types) {
      const table = this.getTable(type)
      await table.syncIndexes()
    }
  }
}
