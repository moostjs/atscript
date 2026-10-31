export interface A {
  next?: A
  @meta.label 'a'
  y?: string
}
export interface B {
  next?: B
  @meta.label 'b'
  y?: string
}
export type M = A & B & A
export interface SA {
  @meta.label 'a'
  y?: string
}
export interface SB {
  @meta.label 'b'
  y?: string
}
export type S = SA & SB & SA
export interface H { m?: A & B & A; s?: SA & SB & SA }
