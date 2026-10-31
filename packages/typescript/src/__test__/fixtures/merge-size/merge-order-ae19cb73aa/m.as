export interface I1 {
  @meta.label 'L4'
  c: string
}
export interface I0 {
  work: {
    @meta.label 'L1'
    c?: string
  }
}
export type M1 = I0 & {
  work?: P0
}
export type P0 = I1