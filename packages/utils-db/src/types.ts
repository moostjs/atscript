import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

// ── Generic Filter (MongoDB-style, same format URLQL produces) ──────────────

export type TDbFilter = Record<string, unknown>

// ── Find Options ────────────────────────────────────────────────────────────

export interface TDbFindOptions {
  sort?: Record<string, 1 | -1>
  skip?: number
  limit?: number
  projection?: Record<string, 0 | 1>
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
  /** The dot-notation path to this field. */
  path: string
  /** The annotated type for this field. */
  type: TAtscriptAnnotatedType
  /** Physical column name override from @db.column (undefined = same as path). */
  column?: string
  /** Default value from @db.default.* */
  defaultValue?: TDbDefaultValue
  /** Whether this field is excluded from the DB (@db.ignore). */
  ignored: boolean
  /** Whether this field is part of the primary key (@meta.id). */
  isPrimaryKey: boolean
}
