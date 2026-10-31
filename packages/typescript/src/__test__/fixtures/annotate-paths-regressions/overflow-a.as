import { S0, S1, S2 } from './overflow-b'
export interface T0 {
  ownT0: string
  e?: {
  c?: (T2 & {
  a?: number
  d?: T3
  b: T2
})[]
}
  b: string
  a?: S0 | S1
}
export interface T1 {
  ownT1: string
  e: {
  d: {
  a: T2
  b: S1
}[]
  c: S0[]
  b: (T1 | {
  a?: number
})[]
}
  d: S2 & S1
  c: T2
  b?: {
  b: T1
  d?: boolean
}
}
export interface T2 {
  ownT2: string
  e: T2
}
export interface T3 {
  ownT3: string
  a?: number
  b: T2[][]
  e?: S1[]
  d?: {
  a: T3
  b?: T0[]
  c: {
  e?: T0
  a: S1
  c: S1 | {
  c: string
}
}
}
}
annotate T1 {
  @meta.description 'Z0'
  ownT1
}
