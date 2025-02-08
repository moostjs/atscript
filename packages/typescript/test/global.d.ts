declare module '@atscript/typescript' {
  export const defineAnnotatedType: typeof import('../src/annotated-type').defineAnnotatedType
  export type TAtscriptTypeObject = import('../src/annotated-type').TAtscriptTypeObject
  export type TAtscriptTypeComplex = import('../src/annotated-type').TAtscriptTypeComplex
  export type TAtscriptTypeFinal = import('../src/annotated-type').TAtscriptTypeFinal
  export type TAtscriptTypeArray = import('../src/annotated-type').TAtscriptTypeArray
  export type TMetadataMap = import('../src/annotated-type').TMetadataMap
}
