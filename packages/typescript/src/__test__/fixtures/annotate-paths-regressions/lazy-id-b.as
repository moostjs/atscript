export interface S0 {
  ownS0: string
  c?: S0 & S0
  e: S0
}
export interface S1 {
  ownS1: string
  d: string[][]
  c?: {
  b: {
  c?: S2
  b?: S2[]
}
  a: S2 | string
}
  b: S0
  e: string
}
export interface S2 {
  ownS2: string
  b?: S1
  d: S0
  e?: string[]
}
annotate S2 {
  @meta.description 'Z1'
  b.c.a
}
