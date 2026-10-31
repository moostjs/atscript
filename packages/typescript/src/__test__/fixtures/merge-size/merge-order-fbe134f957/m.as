export interface A {
  b?: string
}
export interface I1 {
  work?: A | null
}
export interface I2 extends I1 {
  z?: string
}
export type M = I1 & I2
annotate I1 {
  @meta.label 'L11'
  work.b
}