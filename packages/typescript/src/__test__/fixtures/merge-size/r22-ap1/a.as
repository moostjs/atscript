export interface A {
  next?: A
  @expect.pattern '^a1'
  x?: string
  w?: W
}
export interface B {
  next?: B
  @expect.pattern '^b1'
  x?: string
  w?: W2
}
export interface W {
  @expect.pattern '^w1'
  z?: string
}
export interface W2 {
  @expect.pattern '^w2'
  z?: string
}
export type M = A & B
export interface SA {
  @expect.pattern '^a1'
  x?: string
  w?: W
}
export interface SB {
  @expect.pattern '^b1'
  x?: string
  w?: W2
}
export type S = SA & SB
