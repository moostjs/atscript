export interface A {
  next?: A
  k?: 'a' | 'b'
  n?: number | string
  t?: [string, number]
  e?: string
}
export interface B {
  next?: B
  k?: 'a'
  n?: number
  t?: [string, number]
  e?: string.email
}
export type M = A & B
