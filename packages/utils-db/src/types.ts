import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'
import type { FilterExpr as _FilterExpr, UniqueryControls as _UniqueryControls } from '@uniqu/core'
import type { UniquSelect } from './uniqu-select'

export type { FlatOf, PrimaryKeyOf, OwnPropsOf, NavPropsOf } from '@atscript/typescript/utils'

// ── Re-export uniqu types as canonical filter/query format ──────────────────

export type {
  FilterExpr,
  FieldOpsFor,
  UniqueryControls,
  Uniquery,
  WithRelation,
  TypedWithRelation,
} from '@uniqu/core'

// ── Resolved query types (adapter-facing) ──────────────────────────────────

/** Controls with resolved projection. Used in the adapter interface. */
export interface DbControls extends Omit<_UniqueryControls, '$select'> {
  $select?: UniquSelect
}

/** Query object with resolved projection. Passed to adapter methods. */
export interface DbQuery {
  filter: _FilterExpr
  controls: DbControls
}

// ── Search Index Metadata ───────────────────────────────────────────────────

/** Describes an available search index exposed by a database adapter. */
export interface TSearchIndexInfo {
  /** Index name. Empty string or 'DEFAULT' for the default index. */
  name: string
  /** Human-readable label for UI display. */
  description?: string
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

export type TDbIndexType = 'plain' | 'unique' | 'fulltext'

export interface TDbIndexField {
  name: string
  sort: 'asc' | 'desc'
  weight?: number
}

export interface TDbIndex {
  /** Unique key used for identity/diffing (e.g., "atscript__plain__email") */
  key: string
  /** Human-readable index name. */
  name: string
  /** Index type. */
  type: TDbIndexType
  /** Ordered list of fields in the index. */
  fields: TDbIndexField[]
}

// ── Default Value Types ─────────────────────────────────────────────────────

export type TDbDefaultFn = 'increment' | 'uuid' | 'now'

export type TDbDefaultValue =
  | { kind: 'value'; value: string }
  | { kind: 'fn'; fn: TDbDefaultFn }

// ── ID Descriptor ───────────────────────────────────────────────────────────

export interface TIdDescriptor {
  /** Field names that form the primary key. */
  fields: string[]
  /** Whether this is a composite key (multiple fields). */
  isComposite: boolean
}

// ── Field Storage ──────────────────────────────────────────────────────────

export type TDbStorageType = 'column' | 'flattened' | 'json'

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
  storage: TDbStorageType
  /**
   * For flattened fields: the dot-notation path (same as `path`).
   * E.g., for physicalName 'contact__email', this is 'contact.email'.
   * Undefined for non-flattened fields.
   */
  flattenedFrom?: string
}

// ── Foreign Key Types ────────────────────────────────────────────────────

export type TDbReferentialAction = 'cascade' | 'restrict' | 'noAction' | 'setNull' | 'setDefault'

export interface TDbForeignKey {
  /** FK field names on this table (local columns). */
  fields: string[]
  /** Target table name (from the chain ref's type @db.table annotation). */
  targetTable: string
  /** Target field names on the referenced table. */
  targetFields: string[]
  /** Alias grouping FK fields (if any). */
  alias?: string
  /** Referential action on delete. */
  onDelete?: TDbReferentialAction
  /** Referential action on update. */
  onUpdate?: TDbReferentialAction
}

// ── Table Resolver ───────────────────────────────────────────────────────

/**
 * Callback that resolves an annotated type to a queryable table instance.
 * Required for `$with` relation loading — each table needs to query related tables.
 *
 * Typically provided by the driver/registry (e.g. `AsMongo.getTable`, `AsSqlite.getTable`).
 */
export type TTableResolver = (type: TAtscriptAnnotatedType) => Pick<AtscriptDbTableLike, 'findMany' | 'primaryKeys' | 'relations' | 'foreignKeys'> | undefined

/** Minimal table interface used by the table resolver. Avoids circular dependency with AtscriptDbTable. */
export interface AtscriptDbTableLike {
  findMany(query: unknown): Promise<Array<Record<string, unknown>>>
  primaryKeys: readonly string[]
  relations: ReadonlyMap<string, TDbRelation>
  foreignKeys: ReadonlyMap<string, TDbForeignKey>
}

// ── Write Table Resolver ─────────────────────────────────────────────────

/** Minimal writable table interface for nested creation. */
export interface AtscriptDbWritable {
  insertOne(
    payload: Record<string, unknown>,
    opts?: { maxDepth?: number; _depth?: number }
  ): Promise<TDbInsertResult>
  insertMany(
    payloads: Array<Record<string, unknown>>,
    opts?: { maxDepth?: number; _depth?: number }
  ): Promise<TDbInsertManyResult>
}

/**
 * Callback that resolves an annotated type to a writable table instance.
 * Used for nested creation — inserting related records inline.
 */
export type TWriteTableResolver = (type: TAtscriptAnnotatedType) => (AtscriptDbTableLike & AtscriptDbWritable) | undefined

// ── Relation Types ───────────────────────────────────────────────────────

export interface TDbRelation {
  /** Direction: 'to' (FK is local), 'from' (FK is remote), or 'via' (M:N junction). */
  direction: 'to' | 'from' | 'via'
  /** The alias used for pairing (if any). */
  alias?: string
  /** Target type's annotated type reference. */
  targetType: () => TAtscriptAnnotatedType
  /** Whether this is an array relation (one-to-many). */
  isArray: boolean
  /** Junction type reference for 'via' (M:N) relations. */
  viaType?: () => TAtscriptAnnotatedType
}
