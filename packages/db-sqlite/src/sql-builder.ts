import type { TDbFieldMeta, TDbFindOptions, TDbProjection } from '@atscript/utils-db'

import type { TSqlFragment } from './filter-builder'

/**
 * Builds an INSERT statement.
 *
 * @param table - Table name.
 * @param data - Column→value map.
 * @returns `{ sql, params }` ready for `driver.run()`.
 */
export function buildInsert(
  table: string,
  data: Record<string, unknown>
): TSqlFragment {
  const keys = Object.keys(data)
  const cols = keys.map(k => `"${esc(k)}"`).join(', ')
  const placeholders = keys.map(() => '?').join(', ')
  return {
    sql: `INSERT INTO "${esc(table)}" (${cols}) VALUES (${placeholders})`,
    params: keys.map(k => toSqliteValue(data[k])),
  }
}

/**
 * Builds a SELECT statement with optional sort, limit, offset, projection.
 */
export function buildSelect(
  table: string,
  where: TSqlFragment,
  options?: TDbFindOptions
): TSqlFragment {
  const cols = buildProjection(options?.projection)
  let sql = `SELECT ${cols} FROM "${esc(table)}" WHERE ${where.sql}`
  const params = [...where.params]

  if (options?.sort) {
    const orderParts: string[] = []
    for (const [col, dir] of Object.entries(options.sort)) {
      orderParts.push(`"${esc(col)}" ${dir === -1 ? 'DESC' : 'ASC'}`)
    }
    if (orderParts.length > 0) {
      sql += ` ORDER BY ${orderParts.join(', ')}`
    }
  }

  if (options?.limit !== undefined) {
    sql += ` LIMIT ?`
    params.push(options.limit)
  }

  if (options?.skip !== undefined) {
    if (options.limit === undefined) {
      sql += ` LIMIT -1`
    }
    sql += ` OFFSET ?`
    params.push(options.skip)
  }

  return { sql, params }
}

/**
 * Builds an UPDATE ... SET ... WHERE statement.
 */
export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  where: TSqlFragment
): TSqlFragment {
  const setClauses: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    setClauses.push(`"${esc(key)}" = ?`)
    params.push(toSqliteValue(value))
  }

  return {
    sql: `UPDATE "${esc(table)}" SET ${setClauses.join(', ')} WHERE ${where.sql}`,
    params: [...params, ...where.params],
  }
}

/**
 * Builds a DELETE ... WHERE statement.
 */
export function buildDelete(
  table: string,
  where: TSqlFragment
): TSqlFragment {
  return {
    sql: `DELETE FROM "${esc(table)}" WHERE ${where.sql}`,
    params: [...where.params],
  }
}

/**
 * Builds a CREATE TABLE IF NOT EXISTS statement from field descriptors.
 * Uses pre-computed {@link TDbFieldMeta} — no raw type introspection needed.
 */
export function buildCreateTable(
  table: string,
  fields: readonly TDbFieldMeta[]
): string {
  const colDefs: string[] = []
  const primaryKeys = fields.filter(f => f.isPrimaryKey)

  for (const field of fields) {
    if (field.ignored) { continue }

    const sqlType = sqliteTypeFromDesignType(field.designType)

    let def = `"${esc(field.physicalName)}" ${sqlType}`
    if (field.isPrimaryKey && primaryKeys.length === 1) {
      def += ' PRIMARY KEY'
    }
    if (!field.optional && !field.isPrimaryKey) {
      def += ' NOT NULL'
    }
    colDefs.push(def)
  }

  // Composite primary key
  if (primaryKeys.length > 1) {
    const pkCols = primaryKeys
      .map(pk => `"${esc(pk.physicalName)}"`)
      .join(', ')
    colDefs.push(`PRIMARY KEY (${pkCols})`)
  }

  return `CREATE TABLE IF NOT EXISTS "${esc(table)}" (${colDefs.join(', ')})`
}

/**
 * Maps Atscript design types to SQLite storage types.
 */
export function sqliteTypeFromDesignType(designType: string): string {
  switch (designType) {
    case 'number':
    case 'integer': {
      return 'REAL'
    }
    case 'boolean': {
      return 'INTEGER'
    }
    case 'string': {
      return 'TEXT'
    }
    default: {
      // Arrays, objects, etc. → store as JSON text
      return 'TEXT'
    }
  }
}

function buildProjection(
  projection?: TDbProjection
): string {
  if (!projection) { return '*' }

  // Array form: list of field names
  if (Array.isArray(projection)) {
    if (projection.length === 0) { return '*' }
    return projection.map(k => `"${esc(k)}"`).join(', ')
  }

  const entries = Object.entries(projection)
  if (entries.length === 0) { return '*' }

  // Check if it's an inclusion or exclusion projection
  const firstVal = entries[0][1]
  if (firstVal === 1) {
    // Inclusion: only these columns
    return entries
      .filter(([_, v]) => v === 1)
      .map(([k]) => `"${esc(k)}"`)
      .join(', ')
  }
  // Exclusion projections should be resolved by AtscriptDbTable.resolveProjection()
  // before reaching here. Fall back to *.
  return '*'
}

function esc(name: string): string {
  return name.replace(/"/g, '""')
}

/**
 * Converts a JS value to a SQLite-compatible value.
 * Objects and arrays are stored as JSON strings.
 */
function toSqliteValue(value: unknown): unknown {
  if (value === undefined) { return null }
  if (value === null) { return null }
  if (typeof value === 'object') { return JSON.stringify(value) }
  if (typeof value === 'boolean') { return value ? 1 : 0 }
  return value
}
