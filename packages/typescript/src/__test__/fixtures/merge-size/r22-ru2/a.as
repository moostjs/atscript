export interface S1 {
  p0?: string
  p1?: string
  p2?: string
  p3?: string
  p4?: string
  p5?: string
  p6?: string
  p7?: string
  p8?: string
  p9?: string
  p10?: string
  p11?: string
  @expect.maxLength 3
  y?: string
}
export interface C {
  @expect.maxLength 3
  y?: string
}
export interface S2 {
  p0?: string
  p1?: string
  p2?: string
  p3?: string
  p4?: string
  p5?: string
  p6?: string
  p7?: string
  p8?: string
  p9?: string
  p10?: string
  p11?: string
  @expect.maxLength 8
  y?: string
}
export interface P { s?: S1 | C }
export interface Q { s?: S2 }
export type M = P & Q
export interface T1 {
  @expect.maxLength 3
  y?: string
}
export interface T2 {
  @expect.maxLength 8
  y?: string
}
export interface P2 { s?: T1 | C }
export interface Q2 { s?: T2 }
export type MS = P2 & Q2
