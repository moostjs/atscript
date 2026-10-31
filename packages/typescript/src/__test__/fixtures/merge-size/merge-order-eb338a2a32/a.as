export interface X {
  @meta.label 'X'
  name: string
}
export interface Z {
  z?: string
}
export type XN = X | null
export type T02 = (X | null) & Z
export type T03 = X & (Z | null)
export type T07 = XN & Z
export interface I1 {
  p: (X | null) & Z
}
export type T18 = { p: (X | null) & Z }