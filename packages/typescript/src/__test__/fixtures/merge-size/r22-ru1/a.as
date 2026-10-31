export interface A {
  next?: (A | C) & B
  @expect.maxLength 3
  y?: string
}
export interface C {
  @expect.maxLength 3
  y?: string
  c?: string
}
export interface B {
  next?: B
  @expect.maxLength 8
  y?: string
}
export interface SA {
  @expect.maxLength 3
  y?: string
}
export interface SB {
  @expect.maxLength 8
  y?: string
}
export type S = (SA | C) & SB
export type M = A & B
export interface H { s?: (SA | C) & SB; n?: (A | C) & B }
export interface P3 { n?: (SA | C) & SB }
export interface Q3 { n?: SB }
export type M3 = P3 & Q3
