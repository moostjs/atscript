export interface A {
  next?: A
  y?: string
}
export interface B {
  next?: B
  y?: string
}
export type M = A & B
export interface H {
  m?: A & B
  m2?: A & B
}
export type M2 = A & B
