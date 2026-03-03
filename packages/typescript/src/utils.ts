export {
  annotate,
  cloneRefProp,
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
export type FlatOf<T> = T extends { __flat: infer F } ? F : TAtscriptDataType<T>

export * from './validator'

export { buildJsonSchema, fromJsonSchema, mergeJsonSchemas } from './json-schema'
export type { TJsonSchema } from './json-schema'

export { forAnnotatedType } from './traverse'

export { createDataFromAnnotatedType } from './default-value'
export type { TCreateDataOptions, TValueResolver } from './default-value'

export { throwFeatureDisabled } from './throw-disabled'

export { flattenAnnotatedType } from './flatten'
export type { TFlattenOptions } from './flatten'

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
