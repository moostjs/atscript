import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

// ── Filter Operators ────────────────────────────────────────────────────────

/**
 * Comparison and set operators for a single field value.
 * Used inside filter objects: `{ age: { $gt: 18, $lt: 65 } }`.
 */
export type TFilterOperators<V = unknown> = {
  $gt?: V
  $gte?: V
  $lt?: V
  $lte?: V
  $ne?: V | null
  $in?: V[]
  $nin?: V[]
  $exists?: boolean
  $regex?: string
}

// ── Generic Filter (MongoDB-style, same format URLQL produces) ──────────────

/**
 * Typed filter for database queries. Root-level keys from `T` get
 * autocompletion and value type checking. Arbitrary string keys
 * (e.g. dot-notation paths like `"address.city"`) are allowed via
 * index signature fallback.
 *
 * When used without a type parameter, behaves as `Record<string, unknown>`.
 *
 * @example
 * ```typescript
 * // Typed — autocompletion + value checking
 * const filter: TDbFilter<User> = { name: 'John', age: { $gt: 18 } }
 *
 * // Dot-notation — accepted via string fallback
 * const filter2: TDbFilter<User> = { 'address.city': 'NYC' }
 * ```
 */
export type TDbFilter<T = Record<string, unknown>> = {
  [K in keyof T & string]?: T[K] | TFilterOperators<T[K]> | null
} & Record<string, unknown> & {
  $and?: Array<TDbFilter<T>>
  $or?: Array<TDbFilter<T>>
  $not?: TDbFilter<T>
}

// ── Projection ──────────────────────────────────────────────────────────────

/**
 * Projection for selecting/excluding fields.
 * Accepts either an object `{ name: 1, email: 1 }` or an array `['name', 'email']`.
 * Root-level keys get autocompletion, arbitrary strings allowed for dot-notation.
 */
export type TDbProjection<T = Record<string, unknown>> =
  | (Partial<Record<keyof T & string, 0 | 1>> & Record<string, 0 | 1>)
  | (keyof T & string | string)[]

// ── Find Options ────────────────────────────────────────────────────────────

/**
 * Options for find operations: sort, pagination, projection.
 * Root-level keys get autocompletion, arbitrary strings allowed for dot-notation.
 */
export interface TDbFindOptions<T = Record<string, unknown>> {
  sort?: Partial<Record<keyof T & string, 1 | -1>> & Record<string, 1 | -1>
  skip?: number
  limit?: number
  projection?: TDbProjection<T>
}

// ── CRUD Result Types ───────────────────────────────────────────────────────

export interface TDbInsertResult {
  insertedId: unknown
}

export interface TDbInsertManyResult {
  insertedCount: number
  insertedIds: unknown[]
}

export interface TDbUpdateResult {
  matchedCount: number
  modifiedCount: number
}

export interface TDbDeleteResult {
  deletedCount: number
}

// ── Index Types ─────────────────────────────────────────────────────────────

export interface TDbIndexField {
  name: string
  sort: 'asc' | 'desc'
}

export interface TDbIndex {
  /** Unique key used for identity/diffing (e.g., "atscript__plain__email") */
  key: string
  /** Human-readable index name. */
  name: string
  /** Index type. */
  type: 'plain' | 'unique' | 'fulltext'
  /** Ordered list of fields in the index. */
  fields: TDbIndexField[]
}

// ── Default Value Types ─────────────────────────────────────────────────────

export type TDbDefaultValue =
  | { kind: 'value'; value: string }
  | { kind: 'fn'; fn: 'increment' | 'uuid' | 'now' }

// ── ID Descriptor ───────────────────────────────────────────────────────────

export interface TIdDescriptor {
  /** Field names that form the primary key. */
  fields: string[]
  /** Whether this is a composite key (multiple fields). */
  isComposite: boolean
}

// ── Field Metadata ──────────────────────────────────────────────────────────

export interface TDbFieldMeta {
  /** The dot-notation path to this field (logical name). */
  path: string
  /** The annotated type for this field. */
  type: TAtscriptAnnotatedType
  /** Physical column/field name (from @db.column, or same as path). */
  physicalName: string
  /** Resolved design type: 'string', 'number', 'boolean', 'object', etc. */
  designType: string
  /** Whether the field is optional. */
  optional: boolean
  /** Whether this field is part of the primary key (@meta.id). */
  isPrimaryKey: boolean
  /** Whether this field is excluded from the DB (@db.ignore). */
  ignored: boolean
  /** Default value from @db.default.* */
  defaultValue?: TDbDefaultValue
}
