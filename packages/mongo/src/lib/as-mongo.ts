import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
import { AtscriptDbTable } from '@atscript/utils-db'
import { MongoClient } from 'mongodb'

import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'
import { MongoAdapter } from './mongo-adapter'

export class AsMongo {
  public readonly client: MongoClient
  constructor(
    client: string | MongoClient,
    protected readonly logger: TGenericLogger = NoopLogger
  ) {
    if (typeof client === 'string') {
      this.client = new MongoClient(client)
    } else {
      this.client = client
    }
  }

  get db() {
    return this.client.db()
  }

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

  getAdapter<T extends TAtscriptAnnotatedType>(type: T): MongoAdapter {
    this._ensureCreated(type)
    return this._adapters.get(type) as MongoAdapter
  }

  getTable<T extends TAtscriptAnnotatedType>(
    type: T,
    logger?: TGenericLogger
  ): AtscriptDbTable<T, any, any, MongoAdapter> {
    this._ensureCreated(type, logger)
    return this._tables.get(type) as AtscriptDbTable<T, any, any, MongoAdapter>
  }

  private _ensureCreated(type: TAtscriptAnnotatedType, logger?: TGenericLogger) {
    if (!this._adapters.has(type)) {
      const adapter = new MongoAdapter(this.db, this)
      const table = new AtscriptDbTable(type, adapter, logger || this.logger)
      this._adapters.set(type, adapter)
      this._tables.set(type, table)
    }
  }

  private _adapters = new WeakMap() as TWeakMapOf<MongoAdapter>
  private _tables = new WeakMap() as TWeakMapOf<AtscriptDbTable>
}

interface TWeakMapOf<V> {
  has(key: TAtscriptAnnotatedType): boolean
  get<T extends TAtscriptAnnotatedType>(key: T): V
  set<T extends TAtscriptAnnotatedType>(key: T, value: V): void
}
