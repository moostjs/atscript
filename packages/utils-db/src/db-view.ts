import type {
  FlatOf,
  PrimaryKeyOf,
  TAtscriptAnnotatedType,
  TAtscriptDataType,
  AtscriptRef,
  AtscriptQueryNode,
  AtscriptQueryFieldRef,
} from '@atscript/typescript/utils'

import type { BaseDbAdapter } from './base-adapter'
import { AtscriptDbReadable } from './db-readable'
import type { TGenericLogger } from './logger'
import type { TViewPlan, TViewJoin } from './query-tree'
import type { TTableResolver } from './types'

export interface TViewColumnMapping {
  viewColumn: string
  sourceTable: string
  sourceColumn: string
}

/**
 * Database view abstraction driven by Atscript `@db.view.*` annotations.
 *
 * Extends {@link AtscriptDbReadable} with view plan resolution — entry table,
 * joins, filter, and materialization flag. Read operations are inherited;
 * write operations are not available on views.
 *
 * ```typescript
 * const adapter = new SqliteAdapter(db)
 * const activeUsers = new AtscriptDbView(ActiveUsersType, adapter)
 * const users = await activeUsers.findMany({ filter: {}, controls: {} })
 * ```
 */
export class AtscriptDbView<
  T extends TAtscriptAnnotatedType = TAtscriptAnnotatedType,
  DataType = TAtscriptDataType<T>,
  FlatType = FlatOf<T>,
  A extends BaseDbAdapter = BaseDbAdapter,
  IdType = PrimaryKeyOf<T>,
> extends AtscriptDbReadable<T, DataType, FlatType, A, IdType> {
  private _viewPlan?: TViewPlan

  constructor(
    _type: T,
    adapter: A,
    logger?: TGenericLogger,
    _tableResolver?: TTableResolver
  ) {
    super(_type, adapter, logger, _tableResolver)

    // Validate: must have @db.view.for
    if (!_type.metadata.has('db.view.for' as keyof AtscriptMetadata)) {
      throw new Error('@db.view.for annotation is required for views')
    }
  }

  override get isView(): boolean {
    return true
  }

  /**
   * Lazily resolves the view plan from `@db.view.*` metadata.
   *
   * - `db.view.for` → entry type ref (required)
   * - `db.view.joins` → array of `{ target, condition }` (optional, multiple)
   * - `db.view.filter` → query tree (optional)
   * - `db.view.materialized` → boolean (optional)
   */
  get viewPlan(): TViewPlan {
    if (this._viewPlan) {
      return this._viewPlan
    }

    const metadata = this._type.metadata

    // Resolve entry type from @db.view.for (AtscriptRef)
    const forRef = metadata.get('db.view.for' as keyof AtscriptMetadata) as AtscriptRef
    const entryType = typeof forRef === 'function'
      ? forRef
      : forRef.type
    const entryTypeResolved = entryType()
    const entryTable = (entryTypeResolved?.metadata?.get('db.table' as keyof AtscriptMetadata) as string)
      || entryTypeResolved?.id
      || ''

    // Resolve joins from @db.view.joins (array of { target: AtscriptRef, condition: AtscriptQueryNode })
    const rawJoins = metadata.get('db.view.joins' as keyof AtscriptMetadata) as
      Array<{ target: AtscriptRef; condition: AtscriptQueryNode }> | undefined

    const joins: TViewJoin[] = []
    if (rawJoins) {
      for (const join of rawJoins) {
        const targetRef = join.target
        const targetType = typeof targetRef === 'function'
          ? targetRef
          : targetRef.type
        const targetTypeResolved = targetType()
        const targetTable = (targetTypeResolved?.metadata?.get('db.table' as keyof AtscriptMetadata) as string)
          || targetTypeResolved?.id
          || ''

        joins.push({
          targetType: targetType,
          targetTable,
          condition: join.condition,
        })
      }
    }

    // Resolve filter from @db.view.filter
    const filter = metadata.get('db.view.filter' as keyof AtscriptMetadata) as AtscriptQueryNode | undefined

    // Resolve materialized flag
    const materialized = metadata.has('db.view.materialized' as keyof AtscriptMetadata)

    this._viewPlan = {
      entryType,
      entryTable,
      joins,
      filter,
      materialized,
    }

    return this._viewPlan
  }

  /**
   * Resolves a query field ref `{ type?: () => T, field: string }` to `"table"."column"`.
   * Used by adapters to render join conditions and filters.
   */
  resolveFieldRef(ref: AtscriptQueryFieldRef): string {
    if (!ref.type) {
      // Unqualified — resolve against entry table
      const plan = this.viewPlan
      return `"${plan.entryTable}"."${ref.field}"`
    }
    const resolved = ref.type()
    const table = (resolved?.metadata?.get('db.table' as keyof AtscriptMetadata) as string)
      || resolved?.id || ''
    return `"${table}"."${ref.field}"`
  }

  /**
   * Maps each view field to its source table and column via ref chain.
   * Fields without refs (inline definitions) map to the entry table with the same name.
   */
  getViewColumnMappings(): TViewColumnMapping[] {
    const plan = this.viewPlan
    const mappings: TViewColumnMapping[] = []

    if (this._type.type.kind !== 'object') { return mappings }

    for (const [fieldName, fieldType] of this._type.type.props.entries()) {
      if (fieldType.ref) {
        const resolved = fieldType.ref.type()
        const sourceTable = (resolved?.metadata?.get('db.table' as keyof AtscriptMetadata) as string)
          || resolved?.id || ''
        const sourceColumn = fieldType.ref.field || fieldName
        mappings.push({ viewColumn: fieldName, sourceTable, sourceColumn })
      } else {
        // No ref — assume entry table, same column name
        mappings.push({ viewColumn: fieldName, sourceTable: plan.entryTable, sourceColumn: fieldName })
      }
    }

    return mappings
  }
}
