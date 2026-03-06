import type { TAtscriptAnnotatedType, TAtscriptDataType } from './annotated-type'

export {
  annotate,
  cloneRefProp,
  createAnnotatedTypeNode,
  defineAnnotatedType,
  isAnnotatedType,
  isAnnotatedTypeOfPrimitive,
  isPhantomType,
} from './annotated-type'
export type {
  TAnnotatedTypeHandle,
  TAtscriptAnnotatedType,
  TAtscriptAnnotatedTypeConstructor,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
  TMetadataMap,
  TAtscriptTypeDef,
  InferDataType,
  TAtscriptDataType,
} from './annotated-type'

/**
 * Extracts the flat dot-notation type map from an Atscript annotated type.
 * If the type has a `__flat` static property (emitted for `@db.table` interfaces),
 * returns that flat map. Otherwise falls back to `TAtscriptDataType<T>`.
 *
 * Use this for type-safe filters and selects with dot-notation field paths.
 */
export type FlatOf<T> = T extends { __flat: infer F } ? F : T extends TAtscriptAnnotatedType ? TAtscriptDataType<T> : unknown

/**
 * Extracts the primary key type from an Atscript annotated type.
 * If the type has a `__pk` static property (emitted for `@db.table` interfaces
 * with `@meta.id` fields), returns that type. Otherwise falls back to `unknown`.
 *
 * - Single `@meta.id` field → scalar type (e.g., `string`, `number`)
 * - Multiple `@meta.id` fields → object type (e.g., `{ userId: string; orderId: number }`)
 * - No `@meta.id` fields → `unknown`
 */
export type PrimaryKeyOf<T> = T extends { __pk: infer PK } ? PK : unknown

/**
 * Extracts the own-props flat map from an Atscript annotated type.
 * `__ownProps` contains only table-owned fields (no navigation property descendants).
 * Falls back to `FlatOf<T>` for types generated before this feature was added.
 */
export type OwnPropsOf<T> = T extends { __ownProps: infer O } ? O : FlatOf<T>

/**
 * Extracts the navigation property map from an Atscript annotated type.
 * `__navProps` maps nav prop names to their declared types (e.g., `{ author: Author, comments: Comment[] }`).
 * Returns `Record<string, never>` when no `__navProps` exists (no nav props or pre-feature type).
 */
export type NavPropsOf<T> = T extends { __navProps: infer N extends Record<string, unknown> } ? N : Record<string, never>

export * from './validator'

export { buildJsonSchema, fromJsonSchema, mergeJsonSchemas } from './json-schema'
export type { TJsonSchema } from './json-schema'

export { forAnnotatedType } from './traverse'

export { createDataFromAnnotatedType } from './default-value'
export type { TCreateDataOptions, TValueResolver } from './default-value'

export { throwFeatureDisabled } from './throw-disabled'

export { flattenAnnotatedType } from './flatten'
export type { TFlattenOptions } from './flatten'

export type { AtscriptRef, AtscriptQueryNode, AtscriptQueryFieldRef, AtscriptQueryComparison } from './query-types'

export { serializeAnnotatedType, deserializeAnnotatedType, SERIALIZE_VERSION } from './serialize'
export type {
  TSerializedAnnotatedType,
  TSerializedAnnotatedTypeInner,
  TSerializedTypeDef,
  TSerializedTypeFinal,
  TSerializedTypeObject,
  TSerializedTypeArray,
  TSerializedTypeComplex,
  TSerializeOptions,
  TProcessAnnotationContext,
} from './serialize'
