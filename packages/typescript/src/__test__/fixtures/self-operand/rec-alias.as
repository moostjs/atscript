export interface A {
  a?: string
  x?: X
}
export type X = A & X
export type Y = Z & A
export type Z = Y & A
export interface H {
  h?: X & A
  y?: Y & Z
}
