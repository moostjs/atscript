export { annotate, defineAnnotatedType, isAnnotatedType, isAnnotatedTypeOfPrimitive } from './annotated-type'
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
} from './annotated-type'

export * from './validator'

export { buildJsonSchema } from './json-schema'
