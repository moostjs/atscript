export interface I0 {
  b: string
}
annotate M0 {
  @expect.maxLength 5
  work.b
}
export interface I1 {
  work: I0
}
export type M0 = I1 & {
  work: {
    b: string
  }
}