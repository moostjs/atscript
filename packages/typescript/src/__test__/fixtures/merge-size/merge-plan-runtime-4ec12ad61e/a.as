export interface Address {
  @expect.maxLength 20
  city: string
}
export interface Addr2 {
  city: string
  zip?: string
}
export interface A {
  home: Address
  list: Address[]
}
export interface B {
  home?: Address | null
  list?: Address[] | null
}
export type M = A & B
export type N = B & A
export interface A2 {
  home: Address
}
export interface B2 {
  home?: Addr2 | null
}
export type M2 = A2 & B2