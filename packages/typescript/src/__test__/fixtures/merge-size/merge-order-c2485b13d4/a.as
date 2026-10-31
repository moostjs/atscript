export interface X {
  name: string
}
export interface Y {
  name: string
  y?: string
}
export interface Z {
  z?: string
}
export interface A {
  u: X | Y
  t: [X]
}
export interface B {
  u: X | Z
  t: [Z]
}
export type M = A & B
export type T09 = { p: X | Y } & { p: Z }
export type T11 = { p: X[][] } & { p: Z[][] }
export type T12 = { p: (X | Y)[] } & { p: Z[] }
export type T8 = { p: X } & { p: string }
export type K1 = { p: 'a' | 'b' } & { p: 'b' | 'c' }
export type K2 = { p: X | null } & { p: Z | null }
export type K3 = { p: X | string } & { p: string }