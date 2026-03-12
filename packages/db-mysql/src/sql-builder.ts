import type { TDbCollation, TDbFieldMeta, TDbForeignKey, TDbReferentialAction, DbControls, UniquSelect } from '@atscript/utils-db'
import type { AtscriptQueryNode, AtscriptQueryFieldRef, TViewColumnMapping, TViewPlan } from '@atscript/utils-db'

import type { TSqlFragment } from './filter-builder'

// ── MySQL table options (passed to buildCreateTable) ─────────────────────────

export interface TMysqlTableOptions {
  engine?: string
  charset?: string
  collation?: string
  autoIncrementStart?: number
  incrementFields?: ReadonlySet<string>
  onUpdateFields?: ReadonlyMap<string, string>
}

// ── Identifier quoting ──────────────────────────────────────────────────────

/** Escapes a MySQL identifier by doubling backticks. */
export function esc(name: string): string {
  return name.replace(/`/g, '``')
}

/** Backtick-quotes a single identifier. */
export function qi(name: string): string {
  return `\`${esc(name)}\``
}

/**
 * Backtick-quotes a table name, handling `schema.table` format.
 * Input is a raw name like `mydb.users` or just `users`.
 */
export function quoteTableName(name: string): string {
  const dot = name.indexOf('.')
  if (dot >= 0) {
    return `${qi(name.slice(0, dot))}.${qi(name.slice(dot + 1))}`
  }
  return qi(name)
}

// ── Value conversion ────────────────────────────────────────────────────────

/**
 * Converts a JS value to a MySQL-compatible parameter.
 * Objects and arrays are stored as JSON strings.
 */
export function toMysqlValue(value: unknown): unknown {
  if (value === undefined) { return null }
  if (value === null) { return null }
  if (typeof value === 'object') { return JSON.stringify(value) }
  if (typeof value === 'boolean') { return value ? 1 : 0 }
  return value
}

/** Formats a string value as a SQL literal with single-quote escaping. */
export function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

// ── DML builders ────────────────────────────────────────────────────────────

/**
 * Builds an INSERT statement.
 */
export function buildInsert(
  table: string,
  data: Record<string, unknown>
): TSqlFragment {
  const keys = Object.keys(data)
  const cols = keys.map(k => qi(k)).join(', ')
  const placeholders = keys.map(() => '?').join(', ')
  return {
    sql: `INSERT INTO ${quoteTableName(table)} (${cols}) VALUES (${placeholders})`,
    params: keys.map(k => toMysqlValue(data[k])),
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
  let sql = `SELECT ${cols} FROM ${quoteTableName(table)} WHERE ${where.sql}`
  const params = [...where.params]

  if (controls?.$sort) {
    const orderParts: string[] = []
    for (const [col, dir] of Object.entries(controls.$sort)) {
      orderParts.push(`${qi(col)} ${dir === -1 ? 'DESC' : 'ASC'}`)
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
      // MySQL requires LIMIT before OFFSET; use a very large number as "unlimited"
      sql += ` LIMIT 18446744073709551615`
    }
    sql += ` OFFSET ?`
    params.push(controls.$skip)
  }

  return { sql, params }
}

/**
 * Builds an UPDATE ... SET ... WHERE statement with optional LIMIT.
 */
export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  where: TSqlFragment,
  limit?: number
): TSqlFragment {
  const setClauses: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    setClauses.push(`${qi(key)} = ?`)
    params.push(toMysqlValue(value))
  }

  let sql = `UPDATE ${quoteTableName(table)} SET ${setClauses.join(', ')} WHERE ${where.sql}`
  if (limit !== undefined) {
    sql += ` LIMIT ${limit}`
  }

  return {
    sql,
    params: [...params, ...where.params],
  }
}

/**
 * Builds a DELETE ... WHERE statement with optional LIMIT.
 */
export function buildDelete(
  table: string,
  where: TSqlFragment,
  limit?: number
): TSqlFragment {
  let sql = `DELETE FROM ${quoteTableName(table)} WHERE ${where.sql}`
  if (limit !== undefined) {
    sql += ` LIMIT ${limit}`
  }
  return { sql, params: where.params }
}

// ── DDL builders ────────────────────────────────────────────────────────────

/**
 * Maps portable collation values to MySQL collation names.
 */
export function collationToMysql(collation: TDbCollation): string {
  switch (collation) {
    case 'binary': { return 'utf8mb4_bin' }
    case 'nocase': { return 'utf8mb4_general_ci' }
    case 'unicode': { return 'utf8mb4_unicode_ci' }
  }
}

/**
 * Maps an Atscript field descriptor to a MySQL column type.
 *
 * Reads `designType`, primitive tags (via `type.type.tags`), and annotations
 * from field metadata to produce the most specific MySQL type.
 */
export function mysqlTypeFromField(field: TDbFieldMeta): string {
  const tags = field.type?.type?.tags as Set<string> | undefined
  const metadata = field.type?.metadata

  // MySQL-specific type override: @db.mysql.type "MEDIUMTEXT"
  const mysqlTypeOverride = metadata?.get('db.mysql.type') as string | undefined
  if (mysqlTypeOverride) { return mysqlTypeOverride }

  // Unsigned modifier: @db.mysql.unsigned
  const unsigned = metadata?.has('db.mysql.unsigned') ?? false

  // Precision for decimals: @db.column.precision 10, 2
  const precision = metadata?.get('db.column.precision') as
    | { precision: number; scale: number }
    | undefined

  switch (field.designType) {
    case 'number': {
      if (precision) {
        return `DECIMAL(${precision.precision},${precision.scale})`
      }
      return 'DOUBLE'
    }
    case 'integer': {
      // Sized integer detection via primitive tags
      if (tags?.has('int8')) { return unsigned ? 'TINYINT UNSIGNED' : 'TINYINT' }
      if (tags?.has('uint8') || tags?.has('byte')) { return 'TINYINT UNSIGNED' }
      if (tags?.has('int16')) { return unsigned ? 'SMALLINT UNSIGNED' : 'SMALLINT' }
      if (tags?.has('uint16') || tags?.has('port')) { return 'SMALLINT UNSIGNED' }
      if (tags?.has('int32')) { return unsigned ? 'INT UNSIGNED' : 'INT' }
      if (tags?.has('uint32')) { return 'INT UNSIGNED' }
      if (tags?.has('int64')) { return unsigned ? 'BIGINT UNSIGNED' : 'BIGINT' }
      if (tags?.has('uint64')) { return 'BIGINT UNSIGNED' }
      return unsigned ? 'INT UNSIGNED' : 'INT'
    }
    case 'boolean': {
      return 'TINYINT(1)'
    }
    case 'string': {
      // char primitive → CHAR(1)
      if (tags?.has('char')) { return 'CHAR(1)' }
      // Check maxLength annotation to decide VARCHAR vs TEXT
      const maxLen = metadata?.get('expect.maxLength') as number | undefined
      if (maxLen !== undefined && maxLen <= 65535) { return `VARCHAR(${maxLen})` }
      if (maxLen !== undefined && maxLen > 65535) { return 'LONGTEXT' }
      return 'VARCHAR(255)'
    }
    case 'json':
    case 'object':
    case 'array': {
      return 'JSON'
    }
    default: {
      return 'TEXT'
    }
  }
}

/**
 * Builds a CREATE TABLE IF NOT EXISTS statement with MySQL options.
 */
export function buildCreateTable(
  table: string,
  fields: readonly TDbFieldMeta[],
  foreignKeys?: ReadonlyMap<string, TDbForeignKey>,
  options?: TMysqlTableOptions
): string {
  const colDefs: string[] = []
  const primaryKeys = fields.filter(f => f.isPrimaryKey)

  for (const field of fields) {
    if (field.ignored) { continue }

    const sqlType = mysqlTypeFromField(field)
    let def = `${qi(field.physicalName)} ${sqlType}`

    // AUTO_INCREMENT for integer PKs with @db.default.increment
    if (options?.incrementFields?.has(field.physicalName)) {
      def += ' AUTO_INCREMENT'
    }

    if (!field.optional && !field.isPrimaryKey && !options?.incrementFields?.has(field.physicalName)) {
      def += ' NOT NULL'
    }
    if (field.defaultValue?.kind === 'value') {
      def += ` DEFAULT ${sqlStringLiteral(field.defaultValue.value)}`
    } else if (field.defaultValue?.kind === 'fn') {
      // DB-level defaults for uuid and now
      if (field.defaultValue.fn === 'uuid') {
        def += ' DEFAULT (UUID())'
      } else if (field.defaultValue.fn === 'now') {
        def += ' DEFAULT CURRENT_TIMESTAMP'
      }
      // increment is handled via AUTO_INCREMENT above
    }

    // Collation (portable or native override)
    const nativeCollate = field.type?.metadata?.get('db.mysql.collate') as string | undefined
    if (nativeCollate) {
      def += ` COLLATE ${nativeCollate}`
    } else if (field.collate) {
      def += ` COLLATE ${collationToMysql(field.collate)}`
    }

    // ON UPDATE expression
    const onUpdate = options?.onUpdateFields?.get(field.physicalName)
    if (onUpdate) {
      def += ` ON UPDATE ${onUpdate}`
    }

    colDefs.push(def)
  }

  // Primary key constraint
  if (primaryKeys.length === 1) {
    const pkCol = qi(primaryKeys[0].physicalName)
    for (let i = 0; i < colDefs.length; i++) {
      if (colDefs[i].startsWith(pkCol)) {
        colDefs[i] += ' PRIMARY KEY'
        break
      }
    }
  } else if (primaryKeys.length > 1) {
    const pkCols = primaryKeys.map(pk => qi(pk.physicalName)).join(', ')
    colDefs.push(`PRIMARY KEY (${pkCols})`)
  }

  // Foreign key constraints
  if (foreignKeys) {
    for (const fk of foreignKeys.values()) {
      const localCols = fk.fields.map(f => qi(f)).join(', ')
      const targetCols = fk.targetFields.map(f => qi(f)).join(', ')
      let constraint = `FOREIGN KEY (${localCols}) REFERENCES ${qi(fk.targetTable)} (${targetCols})`
      if (fk.onDelete) { constraint += ` ON DELETE ${refActionToSql(fk.onDelete)}` }
      if (fk.onUpdate) { constraint += ` ON UPDATE ${refActionToSql(fk.onUpdate)}` }
      colDefs.push(constraint)
    }
  }

  let sql = `CREATE TABLE IF NOT EXISTS ${quoteTableName(table)} (${colDefs.join(', ')})`

  // Table options
  const engine = options?.engine ?? 'InnoDB'
  const charset = options?.charset ?? 'utf8mb4'
  const collation = options?.collation ?? 'utf8mb4_unicode_ci'
  sql += ` ENGINE=${engine} DEFAULT CHARSET=${charset} COLLATE=${collation}`

  if (options?.autoIncrementStart !== undefined) {
    sql += ` AUTO_INCREMENT=${options.autoIncrementStart}`
  }

  return sql
}

export function refActionToSql(action: TDbReferentialAction): string {
  switch (action) {
    case 'cascade': { return 'CASCADE' }
    case 'restrict': { return 'RESTRICT' }
    case 'setNull': { return 'SET NULL' }
    case 'setDefault': { return 'SET DEFAULT' }
    default: { return 'NO ACTION' }
  }
}

function buildProjection(select?: UniquSelect): string {
  const fields = select?.asArray
  if (!fields) { return '*' }
  let sql = ''
  for (let i = 0; i < fields.length; i++) {
    if (i > 0) { sql += ', ' }
    sql += qi(fields[i])
  }
  return sql || '*'
}

/** Returns a safe MySQL DEFAULT literal for a given design type. */
export function defaultValueForType(designType: string): string {
  switch (designType) {
    case 'number':
    case 'integer': { return '0' }
    case 'boolean': { return '0' }
    default: { return "''" }
  }
}

// ── View DDL ────────────────────────────────────────────────────────────────

/**
 * Builds a CREATE OR REPLACE VIEW statement from a view plan and column mappings.
 */
export function buildCreateView(
  viewName: string,
  plan: TViewPlan,
  columns: TViewColumnMapping[],
  resolveFieldRef: (ref: AtscriptQueryFieldRef) => string,
): string {
  // SELECT columns
  const selectCols = columns.map(c =>
    `${qi(c.sourceTable)}.${qi(c.sourceColumn)} AS ${qi(c.viewColumn)}`
  ).join(', ')

  // FROM entry table
  let sql = `CREATE OR REPLACE VIEW ${quoteTableName(viewName)} AS SELECT ${selectCols} FROM ${qi(plan.entryTable)}`

  // JOINs
  for (const join of plan.joins) {
    const onClause = queryNodeToSql(join.condition, resolveFieldRef)
    sql += ` JOIN ${qi(join.targetTable)} ON ${onClause}`
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
