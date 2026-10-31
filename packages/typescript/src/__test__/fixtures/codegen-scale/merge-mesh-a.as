// Random intersections of interfaces, unions and arrays reaching one another (a generated case).
import { I2, I5 } from './merge-mesh-b'

export interface I0 extends I3 {
  a0: string
  b0?: (string.email | (boolean | string))[]
  n0?: I4
  v0?: string
}

export interface I1 {
  m?: I6[]
  n?: I5 & I1 & I0
  v1?: number
}

export interface I3 extends I7 {
  n: string.email | (I6 & I1 & I2)
  b3: boolean | I1[]
  v3?: number
}

export interface I4 {
  n?: I1
  v4?: string.email
}

export interface I6 {
  a?: I0 & I2 & I6
  n?: { a?: I3, b: boolean }
  v6?: string.email
}

export interface I7 {
  @expect.maxLength 3
  a: string.email
  b?: I7 & I2 & I0 & { m: number.int }
  @expect.maxLength 3
  v7: string.email
}

export type T0 = I3 & I6

export type T1 = I3 & I1

export type T2 = I2 & I4 & I5

export annotate T0 as TA0 {
  @meta.label "x"
  n
}
