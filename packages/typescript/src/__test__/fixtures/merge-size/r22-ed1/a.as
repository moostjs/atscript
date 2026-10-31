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
  m1?: A & B
  m2?: A & B
  s1?: SA & SB
  s2?: SA & SB
}
export interface SA { y?: string }
export interface SB { y?: string }
