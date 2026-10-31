import { T0 } from './m0'
export interface S0 {
  ownS0: string
  a: S0 | string
  b?: S1
}
export interface S1 {
  ownS1: string
  a: (S0 & T0)[]
  b?: {
  a: (T0 | S2)[]
  b?: {
  c: boolean[]
  d?: {
  a: S0
  d: T0
}
}
}
  c: {
  a: S2 | string
}
  d?: {
  a: S2 & {
  a?: S2
  d: {
  c: S0
}
  b: S1
}
  b?: {
  d?: S2
  a: T0 & S0
}
  c: T0 & T0
}
}
export interface S2 {
  ownS2: string
  b: S0 & S0
  c: string
}
