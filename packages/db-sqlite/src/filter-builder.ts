import type { TDbFilter } from '@atscript/utils-db'

export interface TSqlFragment {
  sql: string
  params: unknown[]
}

/**
 * Translates a MongoDB-style filter object into a SQL WHERE clause
 * with parameterized values.
 *
 * Supports:
 * - Equality: `{ field: value }`
 * - Comparison: `$gt`, `$gte`, `$lt`, `$lte`, `$ne`
 * - Set: `$in`, `$nin`
 * - Existence: `$exists`
 * - Pattern: `$regex` (converted to LIKE)
 * - Logical: `$and`, `$or`, `$not`
 *
 * @returns `{ sql, params }` — the WHERE clause (without "WHERE") and bound params.
 *          Returns `{ sql: '1=1', params: [] }` for empty filters.
 */
export function buildWhere(filter: TDbFilter): TSqlFragment {
  if (!filter || Object.keys(filter).length === 0) {
    return { sql: '1=1', params: [] }
  }

  const parts: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and') {
      const sub = (value as TDbFilter[]).map(f => buildWhere(f))
      parts.push(`(${sub.map(s => s.sql).join(' AND ')})`)
      for (const s of sub) { params.push(...s.params) }
    } else if (key === '$or') {
      const sub = (value as TDbFilter[]).map(f => buildWhere(f))
      parts.push(`(${sub.map(s => s.sql).join(' OR ')})`)
      for (const s of sub) { params.push(...s.params) }
    } else if (key === '$not') {
      const sub = buildWhere(value as TDbFilter)
      parts.push(`NOT (${sub.sql})`)
      params.push(...sub.params)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Operator object: { $gt: 5, $lt: 10 }
      for (const [op, opVal] of Object.entries(value as Record<string, unknown>)) {
        const fragment = buildOperator(key, op, opVal)
        parts.push(fragment.sql)
        params.push(...fragment.params)
      }
    } else if (value === null) {
      parts.push(`"${escapeIdent(key)}" IS NULL`)
    } else {
      parts.push(`"${escapeIdent(key)}" = ?`)
      params.push(value)
    }
  }

  return { sql: parts.join(' AND '), params }
}

function buildOperator(field: string, op: string, value: unknown): TSqlFragment {
  const col = `"${escapeIdent(field)}"`

  switch (op) {
    case '$gt': {
      return { sql: `${col} > ?`, params: [value] }
    }
    case '$gte': {
      return { sql: `${col} >= ?`, params: [value] }
    }
    case '$lt': {
      return { sql: `${col} < ?`, params: [value] }
    }
    case '$lte': {
      return { sql: `${col} <= ?`, params: [value] }
    }
    case '$ne': {
      if (value === null) {
        return { sql: `${col} IS NOT NULL`, params: [] }
      }
      return { sql: `${col} != ?`, params: [value] }
    }
    case '$in': {
      const arr = value as unknown[]
      if (arr.length === 0) {
        return { sql: '0=1', params: [] }
      }
      const placeholders = arr.map(() => '?').join(', ')
      return { sql: `${col} IN (${placeholders})`, params: [...arr] }
    }
    case '$nin': {
      const arr = value as unknown[]
      if (arr.length === 0) {
        return { sql: '1=1', params: [] }
      }
      const placeholders = arr.map(() => '?').join(', ')
      return { sql: `${col} NOT IN (${placeholders})`, params: [...arr] }
    }
    case '$exists': {
      return value
        ? { sql: `${col} IS NOT NULL`, params: [] }
        : { sql: `${col} IS NULL`, params: [] }
    }
    case '$regex': {
      // Basic conversion: regex → LIKE pattern
      // Only handles simple cases (^prefix, suffix$, contains)
      const pattern = regexToLike(String(value))
      return { sql: `${col} LIKE ?`, params: [pattern] }
    }
    default: {
      throw new Error(`Unsupported filter operator: ${op}`)
    }
  }
}

/**
 * Basic regex-to-LIKE conversion.
 * - `^abc` → `abc%`
 * - `abc$` → `%abc`
 * - `^abc$` → `abc`
 * - `abc` → `%abc%`
 */
function regexToLike(pattern: string): string {
  const hasStart = pattern.startsWith('^')
  const hasEnd = pattern.endsWith('$')
  let core = pattern
  if (hasStart) { core = core.slice(1) }
  if (hasEnd) { core = core.slice(0, -1) }

  // Escape SQL LIKE special chars in the core
  core = core.replace(/%/g, '\\%').replace(/_/g, '\\_')
  // Convert regex . to _ and .* to %
  core = core.replace(/\.\*/g, '%').replace(/\./g, '_')

  if (hasStart && hasEnd) { return core }
  if (hasStart) { return `${core}%` }
  if (hasEnd) { return `%${core}` }
  return `%${core}%`
}

/**
 * Escapes a SQL identifier to prevent injection.
 * Doubles any embedded double-quotes.
 */
function escapeIdent(name: string): string {
  return name.replace(/"/g, '""')
}
