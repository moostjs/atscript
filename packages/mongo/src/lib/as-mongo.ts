import { MongoClient } from 'mongodb'
import { TAtscriptAnnotatedTypeConstructor } from '@atscript/typescript/utils'
import { AsCollection } from './as-collection'
import { NoopLogger, TGenericLogger } from './logger'

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

  getCollection<T extends TAtscriptAnnotatedTypeConstructor>(
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

type TWeakMapOfCollections = {
  has(key: TAtscriptAnnotatedTypeConstructor): boolean
  get<T extends TAtscriptAnnotatedTypeConstructor>(key: T): AsCollection<T>
  set<T extends TAtscriptAnnotatedTypeConstructor>(key: T, value: AsCollection<T>): void
}
