export interface A {
  next?: A
  @meta.required
  ok: boolean
  @meta.id
  id: string
}
export interface B {
  next?: B
  ok: boolean
  id: string
}
export type M = A & B
export interface SA {
  @meta.required
  ok: boolean
  @meta.id
  id: string
}
export interface SB {
  ok: boolean
  id: string
}
export type S = SA & SB
export interface C {
  a: M.ok
  c: S.ok
  d: A.ok
  ia: M.id
  ic: S.id
  id: A.id
}
