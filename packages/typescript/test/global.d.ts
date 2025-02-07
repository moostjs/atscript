declare module '@atscript/typescript' {
  export const defineAnnotatedType: typeof import('../src/annotated-type').defineAnnotatedType
  export type TAtscriptTypeObject = import('../src/annotated-type').TAtscriptTypeObject
  export type TMetadataMap = import('../src/annotated-type').TMetadataMap
}
