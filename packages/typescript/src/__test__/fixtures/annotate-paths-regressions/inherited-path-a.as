import { S0, S1, S2 } from './inherited-path-b'
export interface T0 extends S1 {
  ownT0: string

}
export interface T1 {
  ownT1: string
  e: S2 & S0
  d: {
  e: {
  a?: T2
  e: T1 | {
  e: string
}
  d: number[]
}
  a?: S0
  b: {
  a: T2
  d?: T0
}[]
}
  c?: T0 & T0
}
export interface T2 {
  ownT2: string
  c: S2 | boolean
  d?: (T2 & {
  d: S2 | T0
  a: {
  a?: T2
  c: string
  e: T1
}
})[]
  a: (T1 | boolean)[]
  e?: S1 & {
  e: T0
}
}
export interface T3 {
  ownT3: string
  d: T1
  c: (S1 & {
  b: S1[]
})[]
}
annotate T1 {
  @meta.description 'Z0'
  e.ownS0
}
annotate S1 {
  @meta.description 'Z1'
  d.ownS2
}
