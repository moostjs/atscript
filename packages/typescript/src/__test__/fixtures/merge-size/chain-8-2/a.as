export interface A0 {
  p0: A1
  a0_0: string
  p1: A1
  a1_0: string
}
export interface B0 {
  p0: B1
  b0_0: number
  p1: B1
  b1_0: number
}
export interface A1 {
  p0: A2
  a0_1: string
  p1: A2
  a1_1: string
}
export interface B1 {
  p0: B2
  b0_1: number
  p1: B2
  b1_1: number
}
export interface A2 {
  p0: A3
  a0_2: string
  p1: A3
  a1_2: string
}
export interface B2 {
  p0: B3
  b0_2: number
  p1: B3
  b1_2: number
}
export interface A3 {
  p0: A4
  a0_3: string
  p1: A4
  a1_3: string
}
export interface B3 {
  p0: B4
  b0_3: number
  p1: B4
  b1_3: number
}
export interface A4 {
  p0: A5
  a0_4: string
  p1: A5
  a1_4: string
}
export interface B4 {
  p0: B5
  b0_4: number
  p1: B5
  b1_4: number
}
export interface A5 {
  p0: A6
  a0_5: string
  p1: A6
  a1_5: string
}
export interface B5 {
  p0: B6
  b0_5: number
  p1: B6
  b1_5: number
}
export interface A6 {
  p0: A7
  a0_6: string
  p1: A7
  a1_6: string
}
export interface B6 {
  p0: B7
  b0_6: number
  p1: B7
  b1_6: number
}
export interface A7 {
  p0: string
  a0_7: string
  p1: string
  a1_7: string
}
export interface B7 {
  p0: string
  b0_7: number
  p1: string
  b1_7: number
}
export type T = A0 & B0
export interface U {
  t: A0 & B0
}