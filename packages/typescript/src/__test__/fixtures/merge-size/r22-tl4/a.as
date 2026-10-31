@meta.label 'IA'
export interface IA { x?: string }
@meta.label 'AXL'
export annotate IA as AX {
  @meta.label 'ax'
  x
}
export type K = AX & { y?: string }
export type K2 = IA & { y?: string }
export interface H { k?: AX & { y?: string } }
