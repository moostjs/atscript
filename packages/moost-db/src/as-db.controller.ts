import type {
  TAtscriptAnnotatedType,
  TAtscriptDataType,
} from '@atscript/typescript/utils'
import type { AtscriptDbTable } from '@atscript/utils-db'
import { Body, Delete, HttpError, Patch, Post, Put } from '@moostjs/event-http'
import { Inherit, Inject, Moost, Param } from 'moost'

import { AsDbReadableController } from './as-db-readable.controller'
import { TABLE_DEF } from './decorators'

/**
 * Full CRUD database controller for Moost that works with any `AtscriptDbTable` +
 * `BaseDbAdapter`. Extends {@link AsDbReadableController} with write operations.
 *
 * Subclass and provide the table via DI:
 * ```ts
 * ‎@TableController(usersTable)
 * export class UsersController extends AsDbController<typeof UserModel> {}
 * ```
 */
@Inherit()
export class AsDbController<
  T extends TAtscriptAnnotatedType = TAtscriptAnnotatedType,
  DataType = TAtscriptDataType<T>,
> extends AsDbReadableController<T, DataType> {
  /** Reference to the underlying table (typed for write access). */
  protected get table(): AtscriptDbTable<T> {
    return this.readable as AtscriptDbTable<T>
  }

  constructor(
    @Inject(TABLE_DEF)
    table: AtscriptDbTable<T>,
    app: Moost
  ) {
    super(table, app)
  }

  // ── Hooks (overridable) ────────────────────────────────────────────────

  /**
   * Intercepts write operations. Return `undefined` to abort.
   */
  protected onWrite(
    action: 'insert' | 'insertMany' | 'replace' | 'update',
    data: unknown
  ): unknown | Promise<unknown | undefined> {
    return data
  }

  /**
   * Intercepts delete operations. Return `undefined` to abort.
   */
  protected onRemove(id: unknown): unknown | Promise<unknown | undefined> {
    return id
  }

  // ── Write Endpoints ─────────────────────────────────────────────────────

  /**
   * **POST /** — inserts one or many records.
   */
  @Post('')
  async insert(@Body() payload: unknown): Promise<HttpError | unknown> {
    const arr = Array.isArray(payload) ? payload : [payload]

    if (arr.length === 1) {
      const data = await this.onWrite('insert', arr[0])
      if (data === undefined) { return new HttpError(500, 'Not saved') }
      return await this.table.insertOne(data as any)
    }

    const data = await this.onWrite('insertMany', arr)
    if (data === undefined) { return new HttpError(500, 'Not saved') }
    return await this.table.insertMany(data as any)
  }

  /**
   * **PUT /** — fully replaces a record matched by primary key.
   */
  @Put('')
  async replace(@Body() payload: unknown): Promise<HttpError | unknown> {
    const data = await this.onWrite('replace', payload)
    if (data === undefined) { return new HttpError(500, 'Not saved') }
    return await this.table.replaceOne(data as any)
  }

  /**
   * **PATCH /** — partially updates a record matched by primary key.
   */
  @Patch('')
  async update(@Body() payload: unknown): Promise<HttpError | unknown> {
    const data = await this.onWrite('update', payload)
    if (data === undefined) { return new HttpError(500, 'Not saved') }
    return await this.table.updateOne(data as any)
  }

  /**
   * **DELETE /:id** — removes a single record by primary key.
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<HttpError | unknown> {
    const resolvedId = await this.onRemove(id)
    if (resolvedId === undefined) { return new HttpError(500, 'Not deleted') }

    const result = await this.table.deleteOne(resolvedId as any)
    if ((result as any).deletedCount < 1) {
      return new HttpError(404)
    }
    return result
  }
}
