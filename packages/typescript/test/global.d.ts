declare module '@anscript/typescript/runtime' {
  export const defineAnnotatedType: typeof import('../src/annotated-type').defineAnnotatedType
  export type TAnscriptAnnotatedType = import('../src/annotated-type').TAnscriptAnnotatedType
  export type TAnscriptTypeObject = import('../src/annotated-type').TAnscriptTypeObject
}
