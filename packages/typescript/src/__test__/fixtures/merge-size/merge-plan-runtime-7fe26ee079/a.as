export interface Base {
  @meta.label 'base'
  @expect.maxLength 10
  name: string
  extra?: string
}
export interface Meta {
  @meta.description 'meta'
  name: string
}
export type M1 = Base & Meta
export type M2 = M1 & {
  @expect.minLength 2
  name: string
}
export type M3 = {
  @meta.label 'pre'
  name: string
} & M1
export interface I extends M1 {
  z?: string
}
export interface H {
  m: M2
  arr: M1[]
  opt?: M1 | null
  i: I
}