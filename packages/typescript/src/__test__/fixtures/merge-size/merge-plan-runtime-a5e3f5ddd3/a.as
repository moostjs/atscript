export interface Address {
  @expect.maxLength 20
  city: string
}
export interface A {
  addr: Address
  list: Address[]
}
export interface B {
  addr: Address
  list: Address[]
}
export type M = A & B
export type N = B & A
export interface C extends B, A {
  z?: string
}