import { T0 } from './dead-branch-a'
export interface S0 {
  ownS0: string
  e?: S0 & {
  c: S1 | {
  d: boolean
  c: {
  c?: boolean
  a: S1
  e: string
}
}
}
  a?: S1 & S2
}
export interface S1 {
  ownS1: string
  d: T0 & S0
}
export interface S2 {
  ownS2: string
  c: S2
  b: S0 | S2
  a?: T0
}
annotate S2 {
  @meta.description 'Z3'
  a.c
}
