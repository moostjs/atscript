export type L0 = I0[]
export interface I0 {
  a: string
}
export interface H0 {
  v: L0
}
annotate H0 {
  @expect.pattern '^[^z]*$'
  v.a
}