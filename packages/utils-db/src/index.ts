export { AtscriptDbTable, resolveDesignType } from './db-table'
export { BaseDbAdapter } from './base-adapter'
export { UniquSelect } from './uniqu-select'
export { decomposePatch } from './patch-decomposer'
export { getKeyProps } from './patch-types'

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
  TSearchIndexInfo,
} from './types'
export type { TGenericLogger } from './logger'
export { NoopLogger } from './logger'

// Re-export walker utilities from @uniqu/core for adapter implementations
export { walkFilter, isPrimitive } from '@uniqu/core'
export type { FilterVisitor } from '@uniqu/core'
