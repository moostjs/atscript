import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
export type { FlatOf } from '@atscript/typescript/utils'

// ── Re-export uniqu types as canonical filter/query format ──────────────────

export type {
  FilterExpr,
  FieldOpsFor,
  UniqueryControls,
  Uniquery,
} from '@uniqu/core'

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
  /** Physical column/field name (from @db.column, __-separated for flattened, or same as path). */
  physicalName: string
  /** Resolved design type: 'string', 'number', 'boolean', 'object', 'json', etc. */
  designType: string
  /** Whether the field is optional. */
  optional: boolean
  /** Whether this field is part of the primary key (@meta.id). */
  isPrimaryKey: boolean
  /** Whether this field is excluded from the DB (@db.ignore). */
  ignored: boolean
  /** Default value from @db.default.* */
  defaultValue?: TDbDefaultValue
  /**
   * How this field is stored in the database.
   * - 'column': a standard scalar column (default for primitives)
   * - 'flattened': a leaf scalar from a flattened nested object
   * - 'json': stored as a single JSON column (arrays, @db.json fields)
   */
  storage: 'column' | 'flattened' | 'json'
  /**
   * For flattened fields: the dot-notation path (same as `path`).
   * E.g., for physicalName 'contact__email', this is 'contact.email'.
   * Undefined for non-flattened fields.
   */
  flattenedFrom?: string
}
