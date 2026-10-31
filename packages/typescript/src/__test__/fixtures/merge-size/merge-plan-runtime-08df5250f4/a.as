export interface A {
  @expect.maxLength 3
  x?: string
  next?: A
}
export interface B {
  @expect.maxLength 5
  x?: string
  y?: string
  next?: B
}
export type M = A & B
export interface H {
  m: A & B
}
export interface W1 {
  @expect.maxLength 4
  a?: string
  @expect.maxLength 4
  b?: string
  @expect.maxLength 4
  c?: string
  @expect.maxLength 4
  d?: string
  @expect.maxLength 4
  e?: string
  @expect.maxLength 4
  f?: string
  @expect.maxLength 4
  g?: string
  @expect.maxLength 4
  h?: string
}
export interface W2 {
  @expect.maxLength 6
  a?: string
  @expect.maxLength 6
  b?: string
  @expect.maxLength 6
  c?: string
  @expect.maxLength 6
  d?: string
  @expect.maxLength 6
  e?: string
  @expect.maxLength 6
  f?: string
  @expect.maxLength 6
  g?: string
  @expect.maxLength 6
  i?: string
}
export interface P {
  home: W1
}
export interface Q {
  home?: W2 | null
}
export type PQ = P & Q
export type PW = P & {
  home: W2
}
export interface I1 {
  work?: A | null
}
export interface I2 extends I1 {
  z?: string
}
export type II = I1 & I2