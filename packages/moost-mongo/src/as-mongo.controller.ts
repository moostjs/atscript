// oxlint-disable max-lines
import { Body, Delete, Get, HttpError, Patch, Post, Put, Url } from '@moostjs/event-http'
import { Inject, Moost, Param, type TConsoleBase } from 'moost'
import { parseUrlql, type UrlqlQuery } from 'urlql'
import { GetOneControlsDto, PagesControlsDto, QueryControlsDto } from './dto/controls.dto.as'
import { AsMongo, AsCollection } from '@atscript/mongo'
import { COLLECTION_DEF } from './decorators'
import {
  Validator,
  ValidatorError,
  type TAtscriptAnnotatedTypeConstructor,
} from '@atscript/typescript'
import type {
  BulkWriteOptions,
  DeleteOptions,
  Filter,
  InsertManyResult,
  InsertOneOptions,
  InsertOneResult,
  ObjectId,
  OptionalUnlessRequiredId,
  ReplaceOptions,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
  WithoutId,
  DeleteResult,
} from 'mongodb'

/**
 * Generic **Moost** controller that exposes a full REST‑style CRUD surface over a
 * MongoDB collection described with **atscript** and handled by **@atscript/mongo**.
 *
 * The controller is intentionally designed for extension – simply subclass it and
 * provide your model constructor. Every important step is overridable via the
 * `protected` hooks documented below.
 *
 * ```ts
 * ‎@Provide(AsMongo, () => new AsMongo(CONNECTION_STRING))
 * ‎@CollectionController(MyCollectionType)
 * export class MyCollectionController
 *     extends AsMongoController<typeof MyCollectionType> {}
 * ```
 *
 * @typeParam T - The **atscript** annotated class (constructor) representing the
 *               collection schema. Must be decorated with `@AsCollection`.
 */
export class AsMongoController<T extends TAtscriptAnnotatedTypeConstructor> {
  /** Reference to the lazily created {@link AsCollection}. */
  protected asCollection: AsCollection<T>

  /** Application‑scoped logger bound to the collection name. */
  protected logger: TConsoleBase

  /**
   * Creates a controller instance and resolves the underlying collection.
   *
   * > Do **not** perform heavy asynchronous work directly inside the
   * > constructor – override {@link init} instead.
   *
   * @param asMongo - Shared `AsMongo` driver instance.
   * @param type - AtScript annotated model constructor for the collection.
   * @param app - The current `Moost` application (used for retrieving a logger).
   * @throws Rethrows any error emitted from {@link init} to stop controller registration.
   */
  constructor(
    protected asMongo: AsMongo,
    @Inject(COLLECTION_DEF)
    protected type: T,
    app: Moost
  ) {
    this.logger = app.getLogger(`mongo [${type.metadata.get('mongo.collection') || ''}]`)
    this.asCollection = this.asMongo.getCollection(type, this.logger)
    this.logger.info(`Initializing Collection`)
    try {
      const p = this.init()
      if (p instanceof Promise) {
        p.catch(e => {
          this.logger.error(e)
        })
      }
    } catch (e) {
      this.logger.error(e)
      throw e
    }
  }

  /**
   * One‑time initialization hook executed right after the collection is obtained.
   *
   * Default behaviour:
   * * Automatically synchronises MongoDB indexes unless
   *   `mongo.autoIndexes` metadata flag is set to `false` on the model.
   *
   * Override to seed data, register change streams, etc. Both sync and async
   * return types are supported.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected init(): void | Promise<any> {
    if (this.type.metadata.get('mongo.autoIndexes') === false) {
      // indexing explicitly disabled
    } else {
      return this.asCollection.syncIndexes()
    }
  }

  // ---------------------------------------------------------------------
  // Lazily built validators ------------------------------------------------

  private _queryControlsValidator?: Validator<any>
  private _pagesControlsValidator?: Validator<any>
  private _getOneControlsValidator?: Validator<any>

  /** Returns (and memoises) validator for *query* endpoint controls. */
  protected get queryControlsValidator() {
    if (!this._queryControlsValidator) {
      this._queryControlsValidator = QueryControlsDto.validator()
    }
    return this._queryControlsValidator
  }

  /** Returns (and memoises) validator for *pages* endpoint controls. */
  protected get pagesControlsValidator() {
    if (!this._pagesControlsValidator) {
      this._pagesControlsValidator = PagesControlsDto.validator()
    }
    return this._pagesControlsValidator
  }

  /** Returns (and memoises) validator for *one* endpoint controls. */
  protected get getOneControlsValidator() {
    if (!this._getOneControlsValidator) {
      this._getOneControlsValidator = GetOneControlsDto.validator()
    }
    return this._getOneControlsValidator
  }

  // ---------------------------------------------------------------------
  // Validation hooks -------------------------------------------------------

  /**
   * Validates `$limit`, `$skip`, `$sort`, `$select`, `$count` controls for the
   * **query** endpoint.
   *
   * @param controls - Controls object emitted by `urlql` parser.
   * @returns Error message string or `undefined` (when valid). Can be async.
   */
  protected validateQueryControls(
    controls: UrlqlQuery['controls']
  ): Promise<string | undefined> | string | undefined {
    this.queryControlsValidator.validate(controls)
    return undefined
  }

  /**
   * Validates pagination‑specific controls for the **pages** endpoint.
   *
   * @param controls - Controls object emitted by `urlql` parser.
   * @returns Error message string or `undefined` (when valid). Can be async.
   */
  protected validatePagesControls(
    controls: UrlqlQuery['controls']
  ): Promise<string | undefined> | string | undefined {
    this.pagesControlsValidator.validate(controls)
    return undefined
  }

  /**
   * Validates controls for the **one /: id ** endpoint.
   *
   * @param controls - Controls object emitted by `urlql` parser.
   * @returns Error message string or `undefined` (when valid). Can be async.
   */
  protected validateGetOneControls(
    controls: UrlqlQuery['controls']
  ): Promise<string | undefined> | string | undefined {
    this.getOneControlsValidator.validate(controls)
    return undefined
  }

  /**
   * Validates the `insights` section ensuring only known projection fields are used.
   *
   * @param insights - Map of insight keys.
   * @returns Error message string or `undefined` (when valid). Can be async.
   */
  protected validateInsights(
    insights: UrlqlQuery['insights']
  ): Promise<string | undefined> | string | undefined {
    for (const key of insights.keys()) {
      if (!this.asCollection.flatMap.has(key)) {
        return `Unknown field "${key}"`
      }
    }
    return undefined
  }

  /**
   * Runs all validations relevant to current endpoint and returns a ready‑to‑send
   * `HttpError` instance if something is invalid.
   *
   * @param parsed - Full parsed URLQL query.
   * @param controlsType - Which controls validator to apply.
   */
  protected async validateUrlql(
    parsed: UrlqlQuery,
    controlsType: 'query' | 'pages' | 'getOne'
  ): Promise<HttpError | undefined> {
    const controlsValidators = {
      query: this.validateQueryControls.bind(this),
      pages: this.validatePagesControls.bind(this),
      getOne: this.validateGetOneControls.bind(this),
    } as const

    try {
      const error = await controlsValidators[controlsType](parsed.controls)
      if (error) {
        return new HttpError(400, error)
      }
    } catch (e) {
      return new HttpError(400, (e as Error).message)
    }

    try {
      const error = await this.validateInsights(parsed.insights)
      if (error) {
        return new HttpError(400, error)
      }
    } catch (e) {
      return new HttpError(400, (e as Error).message)
    }
  }

  // ---------------------------------------------------------------------
  // Helpers ----------------------------------------------------------------

  /**
   * Allows subclasses to translate field projection (e.g. whitelist vs blacklist).
   *
   * @param projection - Mongo projection generated by `urlql` `$select` control.
   * @returns Adjusted projection (may return `Promise`).
   */
  protected transformProjection(
    projection?: Record<string, 0 | 1>
  ):
    | Record<string, 1>
    | Record<string, 0>
    | undefined
    | Promise<Record<string, 1> | Record<string, 0> | undefined> {
    return projection as Record<string, 1>
  }

  /**
   * Builds MongoDB `FindOptions` object out of URLQL controls.
   *
   * @param controls - Parsed `controls` object.
   */
  protected prepareQueryOptions(controls: UrlqlQuery['controls']) {
    return {
      projection: this.transformProjection(controls.$select),
      sort: controls.$sort,
      limit: controls.$limit,
      skip: controls.$skip,
    }
  }

  // ---------------------------------------------------------------------
  // REST Endpoints ---------------------------------------------------------

  /**
   * **GET /query** – returns an array of documents or a count depending on
   * presence of `$count` control.
   *
   * @param url - Full request URL provided by Moost (includes query string).
   * @returns Documents array **or** document count number.
   */
  @Get('query')
  async query(@Url() url: string): Promise<InstanceType<T>[] | number | HttpError> {
    const query = url.split('?').slice(1).join('?')
    const parsed = parseUrlql(query)

    const error = await this.validateUrlql(parsed, 'query')
    if (error) {
      return error
    }

    return parsed.controls.$count
      ? this.asCollection.collection.countDocuments(parsed.filter as any)
      : (this.asCollection.collection
          .find(parsed.filter as any, this.prepareQueryOptions(parsed.controls))
          .toArray() as Promise<InstanceType<T>[]>)
  }

  /**
   * **GET /pages** – returns paginated documents plus basic pagination meta.
   *
   * @param url - Full request URL.
   * @returns An object with keys: `documents`, `page`, `size`, `totalPages`, `totalDocuments`.
   */
  @Get('pages')
  async pages(@Url() url: string): Promise<
    | {
        documents: InstanceType<T>[]
        page: number
        size: number
        totalPages: number
        totalDocuments: number
      }
    | HttpError
  > {
    const query = url.split('?').slice(1).join('?')
    const parsed = parseUrlql(query)

    const error = await this.validateUrlql(parsed, 'pages')
    if (error) {
      return error
    }

    const controls = parsed.controls as PagesControlsDto
    const page = Math.max(Number(controls.$page || 1), 1)
    const size = Math.max(Number(controls.$size || 10), 1)
    const skip = (page - 1) * size
    const result = await this.asCollection.collection
      .aggregate([
        { $match: parsed.filter },
        {
          $facet: {
            documents: [
              controls.$sort ? { $sort: controls.$sort } : undefined,
              { $skip: skip },
              { $limit: size },
              controls.$select ? { $project: controls.$select } : undefined,
            ].filter(Boolean),
            meta: [{ $count: 'count' }],
          },
        },
      ])
      .toArray()
    const totalDocuments = result[0].meta[0].count
    return {
      documents: result[0].documents as InstanceType<T>[],
      page,
      size: size,
      totalPages: Math.ceil(totalDocuments / size),
      totalDocuments,
    }
  }

  /**
   * **GET /one/:id** – retrieves a single document. The identifier may be a
   * Mongo `ObjectId` **or** the value of any `unique` property registered on
   * the model.
   *
   * Filtering is not allowed on this route.
   *
   * @param id - Document `_id` or alternate unique key value.
   * @param url - Full request URL (supports `$select`, `$insights`, etc.).
   */
  @Get('one/:id')
  async getOne(
    @Param('id') id: string,
    @Url() url: string
  ): Promise<InstanceType<T> | HttpError | ValidatorError> {
    const idValidator = this.asCollection.flatMap.get('_id')?.validator()
    const query = url.split('?').slice(1).join('?')
    const parsed = parseUrlql(query)
    if (Object.keys(parsed.filter).length) {
      return new HttpError(400, 'Filtering is not allowed for "one" endpoint')
    }

    const error = await this.validateUrlql(parsed, 'getOne')
    if (error) {
      return error
    }

    if (idValidator?.validate(id, true)) {
      // ObjectId passed
      return this.returnOne(
        this.asCollection.collection
          .find(
            {
              _id: this.asCollection.prepareId(id),
            },
            this.prepareQueryOptions(parsed.controls)
          )
          .toArray()
      )
    } else if (this.asCollection.uniqueProps.size > 0) {
      // not ObjectId passed, trying unique indexes
      const filter = [] as Filter<InstanceType<T>>[]
      for (const prop of this.asCollection.uniqueProps) {
        filter.push({ [prop]: id } as Filter<InstanceType<T>>)
      }
      return this.returnOne(
        this.asCollection.collection
          .find(
            {
              $or: filter,
            } as Filter<InstanceType<T>>,
            this.prepareQueryOptions(parsed.controls)
          )
          .toArray()
      )
    }
    if (idValidator) {
      return new ValidatorError(idValidator.errors)
    }
    return new HttpError(500, 'Unknown error')
  }

  /**
   * Helper that unwraps a promise returning an array of documents and
   * guarantees zero‑or‑one semantics expected by **one** endpoint.
   *
   * @param result - Promise resolving to an array of documents.
   * @returns Document, 400 or 404 { @link HttpError }.
   */
  protected async returnOne(
    result: Promise<WithId<InstanceType<T>>[]>
  ): Promise<InstanceType<T> | HttpError> {
    const items = await result
    if (items.length > 1) {
      return new HttpError(400, 'Found more than one record')
    } else if (items.length === 0) {
      return new HttpError(404)
    } else {
      return items[0] as InstanceType<T>
    }
  }

  // ---------------------------------------------------------------------
  // Write operations -------------------------------------------------------

  /**
   * **POST /** – inserts one or many documents.
   *
   * @param payload - Raw request body to be inserted.
   */
  @Post('')
  async insert(@Body() payload: any): Promise<HttpError | InsertOneResult | InsertManyResult> {
    const data = this.asCollection.prepareInsert(payload) as
      | ReturnType<AsMongoController<T>['asCollection']['prepareInsert']>
      | undefined
    const opts = {} as InsertOneOptions
    if (Array.isArray(data)) {
      const newData = await this.onWrite('insertMany', data, opts)
      if (newData) {
        return this.asCollection.collection.insertMany(newData, opts)
      } else {
        return new HttpError(500, 'Not saved')
      }
    }
    if (data) {
      const newData = await this.onWrite('insert', data, opts)
      if (newData) {
        return this.asCollection.collection.insertOne(newData, opts)
      } else {
        return new HttpError(500, 'Not saved')
      }
    }
    return new HttpError(500, 'Not saved')
  }

  /**
   * **PUT /** – fully replaces a document matched by `_id`.
   *
   * @param payload - Object containing `_id` plus full replacement document.
   */
  @Put('')
  async replace(@Body() payload: any): Promise<HttpError | UpdateResult<InstanceType<T>>> {
    const args = this.asCollection.prepareReplace(payload).toArgs()
    const newData = await this.onWrite('replace', args[1], args[2])
    if (newData) {
      return this.asCollection.collection.replaceOne(args[0], newData, args[2]) as Promise<
        UpdateResult<InstanceType<T>>
      >
    }
    return new HttpError(500, 'Not saved')
  }

  /**
   * **PATCH /** – updates one document using MongoDB update operators.
   *
   * @param payload - Update payload produced by `asCollection.prepareUpdate`.
   */
  @Patch('')
  async update(@Body() payload: any): Promise<HttpError | UpdateResult> {
    const args = this.asCollection.prepareUpdate(payload).toArgs()
    const newData = await this.onWrite('update', args[1], args[2])
    if (newData) {
      return this.asCollection.collection.updateOne(args[0], newData, args[2])
    }
    return new HttpError(500, 'Not saved')
  }

  /**
   * **DELETE /:id** – removes a single document by `_id`.
   *
   * @param id - Document identifier.
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<HttpError | DeleteResult> {
    const opts = {} as DeleteOptions
    id = (await this.onRemove(id, opts)) as string
    if (id !== undefined) {
      const result = await this.asCollection.collection.deleteOne(
        { _id: this.asCollection.prepareId(id) },
        opts
      )
      if (result.deletedCount < 1) {
        throw new HttpError(404)
      }
      return result
    }
    return new HttpError(500, 'Not deleted')
  }

  // ---------------------------------------------------------------------
  // Overridable hooks ------------------------------------------------------

  /**
   * Intercepts delete operation allowing subclasses to veto or mutate it.
   *
   * @param id - Requested document ID.
   * @param opts - Mutable `DeleteOptions` passed to Mongo driver.
   * @returns Final ID to be deleted (can be async).
   */
  protected onRemove(
    id: string,
    opts: DeleteOptions
  ):
    | string
    | number
    | Date
    | ObjectId
    | undefined
    | Promise<string | number | Date | ObjectId | undefined> {
    return id
  }

  /**
   * Generic handler executed right before **every write** (insert/replace/update).
   *
   * Override to validate or mutate data, or tweak driver options. Return
   * `undefined` to abort the write – the endpoint will respond with *500 Not saved*.
   */
  protected onWrite(
    action: 'insert',
    data: OptionalUnlessRequiredId<InstanceType<T>>,
    opts: InsertOneOptions
  ):
    | OptionalUnlessRequiredId<InstanceType<T>>
    | Promise<OptionalUnlessRequiredId<InstanceType<T>> | undefined>
    | undefined
  protected onWrite(
    action: 'insertMany',
    data: OptionalUnlessRequiredId<InstanceType<T>>[],
    opts: BulkWriteOptions
  ):
    | OptionalUnlessRequiredId<InstanceType<T>>[]
    | Promise<OptionalUnlessRequiredId<InstanceType<T>>[] | undefined>
    | undefined
  protected onWrite(
    action: 'replace',
    data: WithoutId<InstanceType<T>>,
    opts: ReplaceOptions
  ): WithoutId<InstanceType<T>> | Promise<WithoutId<InstanceType<T>> | undefined> | undefined
  protected onWrite(
    action: 'update',
    data: UpdateFilter<InstanceType<T>>,
    opts: UpdateOptions
  ): UpdateFilter<InstanceType<T>> | Promise<UpdateFilter<InstanceType<T>> | undefined> | undefined
  // eslint-disable-next-line max-params
  protected onWrite(
    action: 'insert' | 'insertMany' | 'replace' | 'update',
    data:
      | WithoutId<InstanceType<T>>
      | OptionalUnlessRequiredId<InstanceType<T>>
      | OptionalUnlessRequiredId<InstanceType<T>>[]
      | UpdateFilter<InstanceType<T>>,
    opts: InsertOneOptions | ReplaceOptions | UpdateOptions | BulkWriteOptions
  ):
    | WithoutId<InstanceType<T>>
    | OptionalUnlessRequiredId<InstanceType<T>>
    | OptionalUnlessRequiredId<InstanceType<T>>[]
    | UpdateFilter<InstanceType<T>>
    | Promise<WithoutId<InstanceType<T>> | undefined>
    | Promise<OptionalUnlessRequiredId<InstanceType<T>> | undefined>
    | Promise<OptionalUnlessRequiredId<InstanceType<T>>[] | undefined>
    | Promise<UpdateFilter<InstanceType<T>> | undefined>
    | undefined {
    // Default passthrough implementation.
    return data
  }
}
