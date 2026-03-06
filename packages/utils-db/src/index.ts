export { AtscriptDbReadable, resolveDesignType } from './db-readable'
export type { DbResponse } from './db-readable'
export { AtscriptDbTable } from './db-table'
export { AtscriptDbView } from './db-view'
export type { TViewColumnMapping } from './db-view'
export { BaseDbAdapter } from './base-adapter'
export { DbSpace } from './db-space'
export type { TAdapterFactory } from './db-space'
export { UniquSelect } from './uniqu-select'
export { decomposePatch } from './patch-decomposer'
export { getKeyProps } from './patch-types'
export { translateQueryTree } from './query-tree'
export type { TViewPlan, TViewJoin, AtscriptQueryNode, AtscriptQueryFieldRef, AtscriptQueryComparison, AtscriptRef } from './query-tree'

export type { TArrayPatch, TDbPatch } from './patch-types'
export type {
  DbQuery,
  DbControls,
  FilterExpr,
  FieldOpsFor,
  UniqueryControls,
  Uniquery,
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
  TDbIndex,
  TDbIndexField,
  TDbDefaultValue,
  TIdDescriptor,
  TDbFieldMeta,
  TDbStorageType,
  TDbIndexType,
  TDbDefaultFn,
  TDbForeignKey,
  TDbReferentialAction,
  TDbRelation,
  TSearchIndexInfo,
  TTableResolver,
  TWriteTableResolver,
  AtscriptDbWritable,
  WithRelation,
  TypedWithRelation,
  OwnPropsOf,
  NavPropsOf,
} from './types'
export type { TGenericLogger } from './logger'
export { NoopLogger } from './logger'

// Re-export walker utilities from @uniqu/core for adapter implementations
export { walkFilter, isPrimitive } from '@uniqu/core'
export type { FilterVisitor } from '@uniqu/core'
