export interface Address {
  @expect.maxLength 20
  city: string
}
export interface A {
  home: Address
}
export interface B {
  home?: Address | null
}
export type M1 = A & B
export type M4 = M1 & M1