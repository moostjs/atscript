export interface A {
  n: number.int
  e?: string.email
  next?: A
}
export interface B {
  n: number.positive
  e?: string.uuid
  next?: B
}
export type M = A & B
export interface Small1 { n: number.int; e?: string.email }
export interface Small2 { n: number.positive; e?: string.uuid }
export type S = Small1 & Small2
