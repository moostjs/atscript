export { AtscriptDbTable, resolveDesignType } from './db-table'
export { BaseDbAdapter } from './base-adapter'
export { decomposePatch } from './patch-decomposer'
export { getKeyProps } from './patch-types'

export type { TArrayPatch, TDbPatch } from './patch-types'
export type {
  TDbFilter,
  TDbFindOptions,
  TDbProjection,
  TFilterOperators,
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
  TDbIndex,
  TDbIndexField,
  TDbDefaultValue,
  TIdDescriptor,
  TDbFieldMeta,
} from './types'
export type { TGenericLogger } from './logger'
export { NoopLogger } from './logger'
