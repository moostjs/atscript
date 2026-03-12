import { walkFilter, type FilterExpr, type FilterVisitor } from '@uniqu/core'

import { esc } from './sql-builder'

export interface TSqlFragment {
  sql: string
  params: unknown[]
}

const EMPTY_AND: TSqlFragment = { sql: '1=1', params: [] }
const EMPTY_OR: TSqlFragment = { sql: '0=1', params: [] }

/**
 * MySQL visitor for `walkFilter` — renders a filter expression tree
 * into a parameterized SQL WHERE clause with backtick-quoted identifiers.
 */
const mysqlVisitor: FilterVisitor<TSqlFragment> = {
  comparison(field, op, value) {
    const col = `\`${esc(field)}\``
    const v = toMysqlParam(value)

    switch (op) {
      case '$eq': {
        if (v === null) {
          return { sql: `${col} IS NULL`, params: [] }
        }
        return { sql: `${col} = ?`, params: [v] }
      }
      case '$ne': {
        if (v === null) {
          return { sql: `${col} IS NOT NULL`, params: [] }
        }
        return { sql: `${col} != ?`, params: [v] }
      }
      case '$gt': {
        return { sql: `${col} > ?`, params: [v] }
      }
      case '$gte': {
        return { sql: `${col} >= ?`, params: [v] }
      }
      case '$lt': {
        return { sql: `${col} < ?`, params: [v] }
      }
      case '$lte': {
        return { sql: `${col} <= ?`, params: [v] }
      }
      case '$in': {
        const arr = (value as unknown[]).map(toMysqlParam)
        if (arr.length === 0) {
          return EMPTY_OR // 0=1 — no match
        }
        const placeholders = arr.map(() => '?').join(', ')
        return { sql: `${col} IN (${placeholders})`, params: arr }
      }
      case '$nin': {
        const arr = (value as unknown[]).map(toMysqlParam)
        if (arr.length === 0) {
          return EMPTY_AND // 1=1 — all match
        }
        const placeholders = arr.map(() => '?').join(', ')
        return { sql: `${col} NOT IN (${placeholders})`, params: arr }
      }
      case '$exists': {
        return value
          ? { sql: `${col} IS NOT NULL`, params: [] }
          : { sql: `${col} IS NULL`, params: [] }
      }
      case '$regex': {
        // MySQL supports native REGEXP — no LIKE conversion needed
        const pattern = value instanceof RegExp ? value.source : String(value)
        return { sql: `${col} REGEXP ?`, params: [pattern] }
      }
      default: {
        throw new Error(`Unsupported filter operator: ${op}`)
      }
    }
  },

  and(children) {
    if (children.length === 0) { return EMPTY_AND }
    return {
      sql: children.map(c => c.sql).join(' AND '),
      params: children.flatMap(c => c.params),
    }
  },

  or(children) {
    if (children.length === 0) { return EMPTY_OR }
    return {
      sql: `(${children.map(c => c.sql).join(' OR ')})`,
      params: children.flatMap(c => c.params),
    }
  },

  not(child) {
    return {
      sql: `NOT (${child.sql})`,
      params: child.params,
    }
  },
}

/**
 * Translates a uniqu filter expression into a parameterized MySQL WHERE clause.
 *
 * @returns `{ sql, params }` — the WHERE clause (without "WHERE") and bound params.
 *          Returns `{ sql: '1=1', params: [] }` for empty/null filters.
 */
export function buildWhere(filter: FilterExpr): TSqlFragment {
  if (!filter || Object.keys(filter).length === 0) {
    return EMPTY_AND
  }
  return walkFilter(filter, mysqlVisitor) ?? EMPTY_AND
}

/**
 * Converts a JS value to a MySQL-bindable parameter.
 * mysql2 handles booleans natively, but we convert to 0/1 for consistency
 * with TINYINT(1) storage.
 */
function toMysqlParam(value: unknown): unknown {
  if (typeof value === 'boolean') { return value ? 1 : 0 }
  return value
}
