export interface S0 {
  ownS0: string
  d?: S0 | {
  d: S1
  c: {
  e: S0[]
}
  e: S0
}
  c?: S2
  b: string
}
export interface S1 {
  ownS1: string
  d?: S2 | S1
  c: S1
  b: S2 & S1
  e?: S0
}
export interface S2 extends S1 {
  ownS2: string

}
annotate S1 {
  @meta.description 'Z1'
  d.d
}
