export interface I2 {
  c: string
}
export interface I0 {
  @expect.maxLength 5
  c: string
  next?: I2
}
export interface I1 {
  next?: I0 | null
}
export type M0 = I0 & I1
export type H = M0 & {
  z?: string
}
export interface H0 {
  w: M0 & {
    a?: string
  }
}