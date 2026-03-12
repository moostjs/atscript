import type { TDbFieldMeta, TDbForeignKey, TDbReferentialAction, DbControls, UniquSelect } from '@atscript/utils-db'
import type { AtscriptQueryNode, AtscriptQueryFieldRef, TViewColumnMapping, TViewPlan } from '@atscript/utils-db'

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
  controls?: DbControls
): TSqlFragment {
  const cols = buildProjection(controls?.$select)
  let sql = `SELECT ${cols} FROM "${esc(table)}" WHERE ${where.sql}`
  const params = [...where.params]

  if (controls?.$sort) {
    const orderParts: string[] = []
    for (const [col, dir] of Object.entries(controls.$sort)) {
      orderParts.push(`"${esc(col)}" ${dir === -1 ? 'DESC' : 'ASC'}`)
    }
    if (orderParts.length > 0) {
      sql += ` ORDER BY ${orderParts.join(', ')}`
    }
  }

  if (controls?.$limit !== undefined) {
    sql += ` LIMIT ?`
    params.push(controls.$limit)
  }

  if (controls?.$skip !== undefined) {
    if (controls.$limit === undefined) {
      sql += ` LIMIT -1`
    }
    sql += ` OFFSET ?`
    params.push(controls.$skip)
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
  fields: readonly TDbFieldMeta[],
  foreignKeys?: ReadonlyMap<string, TDbForeignKey>
): string {
  const colDefs: string[] = []
  const primaryKeys = fields.filter(f => f.isPrimaryKey)

  for (const field of fields) {
    if (field.ignored) { continue }

    // Numeric primary keys must be INTEGER (not REAL) for SQLite rowid alias / auto-increment
    const sqlType = field.isPrimaryKey && (field.designType === 'number' || field.designType === 'integer')
      ? 'INTEGER'
      : sqliteTypeFromDesignType(field.designType)

    let def = `"${esc(field.physicalName)}" ${sqlType}`
    if (field.isPrimaryKey && primaryKeys.length === 1) {
      def += ' PRIMARY KEY'
      // Add AUTOINCREMENT for integer PKs with @db.default.increment
      // (enables sqlite_sequence seeding for start values)
      if (field.defaultValue?.kind === 'fn' && field.defaultValue.fn === 'increment'
        && (field.designType === 'number' || field.designType === 'integer')) {
        def += ' AUTOINCREMENT'
      }
    }
    if (!field.optional && !field.isPrimaryKey) {
      def += ' NOT NULL'
    }
    if (field.defaultValue?.kind === 'value') {
      def += ` DEFAULT ${sqlStringLiteral(field.defaultValue.value)}`
    }
    if (field.collate) {
      def += ` COLLATE ${field.collate.toUpperCase()}`
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

  // Foreign key constraints
  if (foreignKeys) {
    for (const fk of foreignKeys.values()) {
      const localCols = fk.fields.map(f => `"${esc(f)}"`).join(', ')
      const targetCols = fk.targetFields.map(f => `"${esc(f)}"`).join(', ')
      let constraint = `FOREIGN KEY (${localCols}) REFERENCES "${esc(fk.targetTable)}" (${targetCols})`
      if (fk.onDelete) { constraint += ` ON DELETE ${refActionToSql(fk.onDelete)}` }
      if (fk.onUpdate) { constraint += ` ON UPDATE ${refActionToSql(fk.onUpdate)}` }
      colDefs.push(constraint)
    }
  }

  return `CREATE TABLE IF NOT EXISTS "${esc(table)}" (${colDefs.join(', ')})`
}

function refActionToSql(action: TDbReferentialAction): string {
  switch (action) {
    case 'cascade': { return 'CASCADE' }
    case 'restrict': { return 'RESTRICT' }
    case 'setNull': { return 'SET NULL' }
    case 'setDefault': { return 'SET DEFAULT' }
    default: { return 'NO ACTION' }
  }
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

function buildProjection(select?: UniquSelect): string {
  const fields = select?.asArray
  if (!fields) { return '*' }
  let sql = ''
  for (let i = 0; i < fields.length; i++) {
    if (i > 0) {sql += ', '}
    sql += `"${esc(fields[i])}"`
  }
  return sql || '*'
}

export function esc(name: string): string {
  return name.replace(/"/g, '""')
}

/** Formats a string value as a SQL literal with single-quote escaping. */
export function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Converts a JS value to a SQLite-compatible value.
 * Objects and arrays are stored as JSON strings.
 */
export function toSqliteValue(value: unknown): unknown {
  if (value === undefined) { return null }
  if (value === null) { return null }
  if (typeof value === 'object') { return JSON.stringify(value) }
  if (typeof value === 'boolean') { return value ? 1 : 0 }
  return value
}

// ── View DDL ──────────────────────────────────────────────────────────────

/**
 * Builds a CREATE VIEW IF NOT EXISTS statement from a view plan and column mappings.
 *
 * @param viewName - The view name.
 * @param plan - Resolved view plan (entry table, joins, filter).
 * @param columns - Column mappings (view column → source table.column).
 * @param resolveFieldRef - Resolves a query field ref to `"table"."column"` SQL.
 */
export function buildCreateView(
  viewName: string,
  plan: TViewPlan,
  columns: TViewColumnMapping[],
  resolveFieldRef: (ref: AtscriptQueryFieldRef) => string,
): string {
  // SELECT columns
  const selectCols = columns.map(c =>
    `"${esc(c.sourceTable)}"."${esc(c.sourceColumn)}" AS "${esc(c.viewColumn)}"`
  ).join(', ')

  // FROM entry table
  let sql = `CREATE VIEW IF NOT EXISTS "${esc(viewName)}" AS SELECT ${selectCols} FROM "${esc(plan.entryTable)}"`

  // JOINs
  for (const join of plan.joins) {
    const onClause = queryNodeToSql(join.condition, resolveFieldRef)
    sql += ` JOIN "${esc(join.targetTable)}" ON ${onClause}`
  }

  // WHERE filter
  if (plan.filter) {
    const whereClause = queryNodeToSql(plan.filter, resolveFieldRef)
    sql += ` WHERE ${whereClause}`
  }

  return sql
}

const queryOpToSql: Record<string, string> = {
  $eq: '=', $ne: '!=', $gt: '>', $gte: '>=', $lt: '<', $lte: '<=',
}

/**
 * Renders an AtscriptQueryNode tree to raw SQL (no parameters — for DDL use only).
 */
function queryNodeToSql(
  node: AtscriptQueryNode,
  resolveFieldRef: (ref: AtscriptQueryFieldRef) => string,
): string {
  if ('$and' in node) {
    const children = (node as { $and: AtscriptQueryNode[] }).$and
    return children.map(n => queryNodeToSql(n, resolveFieldRef)).join(' AND ')
  }
  if ('$or' in node) {
    const children = (node as { $or: AtscriptQueryNode[] }).$or
    return `(${children.map(n => queryNodeToSql(n, resolveFieldRef)).join(' OR ')})`
  }
  if ('$not' in node) {
    return `NOT (${queryNodeToSql((node as { $not: AtscriptQueryNode }).$not, resolveFieldRef)})`
  }

  // Comparison
  const comp = node as { left: AtscriptQueryFieldRef; op: string; right?: unknown }
  const leftSql = resolveFieldRef(comp.left)
  const sqlOp = queryOpToSql[comp.op] || '='

  // Field-to-field comparison
  if (comp.right && typeof comp.right === 'object' && 'field' in (comp.right as object)) {
    return `${leftSql} ${sqlOp} ${resolveFieldRef(comp.right as AtscriptQueryFieldRef)}`
  }

  // Value comparison
  if (comp.right === null || comp.right === undefined) {
    return comp.op === '$ne' ? `${leftSql} IS NOT NULL` : `${leftSql} IS NULL`
  }
  if (typeof comp.right === 'string') {
    return `${leftSql} ${sqlOp} '${comp.right.replace(/'/g, "''")}'`
  }
  return `${leftSql} ${sqlOp} ${comp.right}`
}
