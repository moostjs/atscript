export interface I3 {
  @expect.maxLength 8
  c: string
}
export interface I4 {
  list?: {
    @expect.maxLength 5
    c: string
  }[]
}
export type M0 = I4 & {
  list?: L0
}
export type L0 = I3[]