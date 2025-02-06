declare module '@ts-anscript/typescript' {
  export const defineAnnotatedType: typeof import('../src/annotated-type').defineAnnotatedType
  export type TAnscriptTypeObject = import('../src/annotated-type').TAnscriptTypeObject
  export type TMetadataMap = import('../src/annotated-type').TMetadataMap
}
