import { S0, S1, S2 } from './inherited-live-b'
export interface T0 {
  ownT0: string
  d?: T3 & T3
  a: T0 | {
  e: {
  e: T3
  a: T1
  b: {
  d?: string
  c?: string
  e: number
}
}
  d: {
  d?: {
  a: T3
  e: S2
}
  c: S1[]
  e?: T1
}
}
  e?: {
  c?: T3[][]
  b: T1 & {
  d: S1
  a?: T1 | {
  a?: S2
}
  b: {
  c?: boolean
}
}
  a?: T2
}
}
export interface T1 extends S0 {
  ownT1: string
  bT1: {
  e: T0 | {
  e: {
  a?: number
  b: T1
}
  d?: T1
  c: S2 & {
  a: string
}
}
  a: {
  d?: string[]
  c?: S0 | {
  b: string
  c: boolean
}
}
}
}
export interface T2 extends S2 {
  ownT2: string
  dT2: number
}
export interface T3 extends S2 {
  ownT3: string
  dT3?: S2 & {
  d: T3 & S1
  c: {
  d: T2
}
}
}
annotate T2 {
  @meta.description 'Z0'
  a
}
annotate T2 {
  @meta.description 'Z1'
  eS2
}
