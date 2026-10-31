import { S0, S1, S2 } from './lazy-id-b'
export interface T0 {
  ownT0: string
  a: (S1 & T2)[]
  b: string
  c: {
  e: S0 | {
  a?: S0
  e?: T0
  b?: T1 | {
  a: S0
  b?: T2
}
}
}
}
export interface T1 extends S2 {
  ownT1: string
  bT1: T1
  cT1?: {
  d: S2 & T3
  b: S2 & S0
  e: {
  b: S2
  d: T3
  a: S2
}
}
}
export interface T2 {
  ownT2: string
  a?: boolean
}
export interface T3 {
  ownT3: string
  d: S2
  c?: string
  e?: string
  a: {
  d: S2
  c: T3 | string
}
}
annotate T1 {
  @meta.description 'Z0'
  e
}
