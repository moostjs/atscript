import { S0, S1, S2 } from './dead-branch-b'
export interface T0 {
  ownT0: string
  d: T2
  c: T2 | S2
  b: ({
  a?: T1 | {
  d?: string
  c: string
  e?: S2
}
  b: boolean
})[]
  a: T2
}
export interface T1 {
  ownT1: string
  c: (S1 | string)[]
  d: {
  a?: S2
}
  e: T0 | {
  e?: {
  b?: T3[]
}
}
  a: number
}
export interface T2 extends S2 {
  ownT2: string
  aT2: T0
}
export interface T3 extends S2 {
  ownT3: string
  bT3: {
  e?: string
  d?: S2
}
  cT3: T1
}
annotate T1 {
  @meta.description 'Z0'
  c
}
annotate T0 {
  @meta.description 'Z1'
  c.c.c
}
annotate T2 {
  @meta.description 'Z2'
  c
}
