import type { AtscriptDbTable } from '@atscript/utils-db'
import { Controller, Provide, ApplyDecorators, Inherit } from 'moost'

/**
 * DI token under which the {@link AtscriptDbTable} instance
 * is exposed to the controller's constructor via `@Inject`.
 */
export const TABLE_DEF = '__atscript_db_table_def'

/**
 * Combines the boilerplate needed to turn an {@link AsDbController}
 * subclass into a fully wired HTTP controller for a given `@db.table` model.
 *
 * Internally applies three decorators:
 * 1. **Provide** — registers the table instance under {@link TABLE_DEF}.
 * 2. **Controller** — registers the class as a Moost HTTP controller
 *    with an optional route prefix. Defaults to `table.tableName`.
 * 3. **Inherit** — copies metadata (routes, guards, etc.) from the
 *    parent class so they stay active in the derived controller.
 *
 * @param table  The {@link AtscriptDbTable} instance for this controller.
 * @param prefix Optional route prefix. Defaults to `table.tableName`.
 *
 * @example
 * ```ts
 * ‎@TableController(usersTable)
 * export class UsersController extends AsDbController<typeof UserModel> {}
 * ```
 */
export const TableController = (
  table: AtscriptDbTable,
  prefix?: string
) =>
  ApplyDecorators(
    Provide(TABLE_DEF, () => table),
    Controller(prefix || table.tableName),
    Inherit()
  )
