import type { FilterExpr } from '@uniqu/core'
import { buildWhere as _buildWhere } from '@atscript/db-sql-tools'
export type { TSqlFragment } from '@atscript/db-sql-tools'

import { sqliteDialect } from './sql-builder'

/**
 * Translates a uniqu filter expression into a parameterized SQL WHERE clause.
 *
 * @returns `{ sql, params }` — the WHERE clause (without "WHERE") and bound params.
 *          Returns `{ sql: '1=1', params: [] }` for empty/null filters.
 */
export function buildWhere(filter: FilterExpr): TSqlFragment {
  return _buildWhere(sqliteDialect, filter)
}
