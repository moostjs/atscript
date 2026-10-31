export interface S0 {
  ownS0: string
  a: string
  b?: S0 | {
  e: {
  e: S2
}[]
  c: S0 | {
  c: S2 | {
  e: S0
  d: string
}
  d: S1[]
  e: S2 & {
  a: S1
  b?: S2
  c: string
}
}
  b: S1 | S0
}
  e: S1 & {
  b?: S1 | S0
  e: string
  c?: S2
}
}
export interface S1 {
  ownS1: string
  d: S1
  c: S2 & {
  e: {
  d: S0[]
}
}
  a: {
  e: string
  d: S0 & {
  d?: S2 | {
  a: boolean
  b: number
}
  b: {
  a: number
}
}
  c?: S0
}
  e: S2
}
export interface S2 extends S1 {
  ownS2: string
  eS2: S0[][]
  aS2: S2
  cS2?: S2 & S1
  dS2: S1
}
annotate S1 {
  @meta.description 'Z2'
  c.c.c.e.ownS1
}
