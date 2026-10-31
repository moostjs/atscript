// (`e.e` was `S0 | { … }`: a union operand on a recursion cycle of merges is a compile error, MODEL §6 / §9 U5)
export interface S0 {
  ownS0: string
  d?: S2
  e: {
  c: {
  a: S1 & S0
  d: {
  a: S2
  b: string
}
}
  e?: {
  e: S1[]
  a: S0 | string
  b: {
  a: string
  e: S2
}
}
  b: number
}
}
export interface S1 extends S0 {
  ownS1: string
  aS1?: {
  c: string
  a: S0 & {
  a?: S0 & {
  e?: S1
  d: number
}
}
  e: S2 & {
  a: S0[]
}
}
  dS1: S0 | boolean
  bS1: string[][][]
}
export interface S2 extends S1 {
  ownS2: string
  eS2: S0 | S2
}
annotate S2 {
  @meta.description 'Z2'
  d.bS1
}
