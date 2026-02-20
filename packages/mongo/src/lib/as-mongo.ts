import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
import { MongoClient } from 'mongodb'

import { AsCollection } from './as-collection'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'

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

  getCollection<T extends TAtscriptAnnotatedType>(
    type: T,
    logger?: TGenericLogger
  ): AsCollection<T> {
    let collection = this._collections.get(type)
    if (!collection) {
      collection = new AsCollection<T>(this, type, logger || this.logger)
      this._collections.set(type, collection)
    }
    return collection
  }

  private _collections = new WeakMap() as TWeakMapOfCollections
}

interface TWeakMapOfCollections {
  has(key: TAtscriptAnnotatedType): boolean
  get<T extends TAtscriptAnnotatedType>(key: T): AsCollection<T>
  set<T extends TAtscriptAnnotatedType>(key: T, value: AsCollection<T>): void
}
