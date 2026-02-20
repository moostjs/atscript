export {
  annotate,
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
} from './annotated-type'

export * from './validator'

export { buildJsonSchema, fromJsonSchema } from './json-schema'

export { forAnnotatedType } from './traverse'

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
