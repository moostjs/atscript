import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

import { AtscriptDbTable } from './db-table'
import { AtscriptDbView } from './db-view'
import type { AtscriptDbReadable } from './db-readable'
import type { BaseDbAdapter } from './base-adapter'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'

/**
 * Adapter factory function. Called once per table/view to create a fresh adapter instance.
 * Each readable gets its own adapter (1:1 relationship required by BaseDbAdapter).
 */
export type TAdapterFactory = () => BaseDbAdapter

interface TWeakMapOf<V> {
  has(key: TAtscriptAnnotatedType): boolean
  get(key: TAtscriptAnnotatedType): V | undefined
  set(key: TAtscriptAnnotatedType, value: V): void
}

/**
 * A database space — a registry of tables and views sharing the same adapter type and driver.
 *
 * `DbSpace` solves the cross-table discovery problem: when table A has a relation
 * to table B, it needs to find and query table B. The space acts as the registry
 * that makes this possible via the table resolver callback.
 *
 * Each table/view gets its own adapter instance (created by the factory), but all
 * share the same space and can discover each other for `$with` relation loading.
 *
 * ```typescript
 * // SQLite
 * const driver = new BetterSqlite3Driver(':memory:')
 * const db = new DbSpace(() => new SqliteAdapter(driver))
 * const users = db.getTable(UsersType)
 * const activeUsers = db.getView(ActiveUsersType)
 * ```
 */
export class DbSpace {
  private _readables = new WeakMap() as TWeakMapOf<AtscriptDbReadable>

  constructor(
    protected readonly adapterFactory: TAdapterFactory,
    protected readonly logger: TGenericLogger = NoopLogger
  ) {}

  /**
   * Auto-detects whether the type is a table or view and returns the
   * appropriate instance. Uses `@db.view` or `@db.view.for` presence to distinguish.
   */
  get<T extends TAtscriptAnnotatedType>(
    type: T,
    logger?: TGenericLogger
  ): AtscriptDbReadable<T> {
    if (type.metadata.has('db.view') || type.metadata.has('db.view.for')) {
      return this.getView(type, logger)
    }
    return this.getTable(type, logger)
  }

  /**
   * Returns the table for the given annotated type.
   * Creates the table + adapter on first access, caches for subsequent calls.
   */
  getTable<T extends TAtscriptAnnotatedType>(
    type: T,
    logger?: TGenericLogger
  ): AtscriptDbTable<T> {
    let readable = this._readables.get(type) as AtscriptDbTable<T> | undefined
    if (!readable) {
      const adapter = this.adapterFactory()
      readable = new AtscriptDbTable<T>(
        type,
        adapter as any,
        logger || this.logger,
        (t) => this.get(t) as any,
        (t) => {
          const resolved = this.get(t)
          return resolved instanceof AtscriptDbTable ? resolved as any : undefined
        }
      )
      this._readables.set(type, readable as AtscriptDbReadable)
    }
    return readable as AtscriptDbTable<T>
  }

  /**
   * Returns the view for the given annotated type.
   * Creates the view + adapter on first access, caches for subsequent calls.
   */
  getView<T extends TAtscriptAnnotatedType>(
    type: T,
    logger?: TGenericLogger
  ): AtscriptDbView<T> {
    let readable = this._readables.get(type) as AtscriptDbView<T> | undefined
    if (!readable) {
      const adapter = this.adapterFactory()
      readable = new AtscriptDbView<T>(
        type,
        adapter as any,
        logger || this.logger,
        (t) => this.get(t) as any
      )
      this._readables.set(type, readable as AtscriptDbReadable)
    }
    return readable as AtscriptDbView<T>
  }

  /**
   * Returns the adapter for the given annotated type.
   * Creates the table/view + adapter on first access if needed.
   */
  getAdapter(type: TAtscriptAnnotatedType): BaseDbAdapter {
    const readable = this.get(type)
    return readable.dbAdapter
  }

  /**
   * Drops a table by name. Used by schema sync to remove tables no longer in the schema.
   * Creates a temporary adapter instance and delegates to its `dropTableByName` method.
   */
  async dropTableByName(tableName: string): Promise<void> {
    const adapter = this.adapterFactory()
    if (adapter.dropTableByName) {
      await adapter.dropTableByName(tableName)
    }
  }
}
