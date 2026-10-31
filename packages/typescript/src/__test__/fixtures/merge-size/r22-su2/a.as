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
  k?: 'a' | 'b'
  n?: number | string
  t?: [string, number]
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
  k?: 'a'
  n?: number
  t?: [string, number]
}
export interface P { s?: S1 }
export interface Q { s?: S2 }
export type M = P & Q
export type D = S1 & S2
