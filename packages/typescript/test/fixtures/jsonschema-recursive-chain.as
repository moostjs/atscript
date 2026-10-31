export type Json = string | Json[]

export interface W {
  @expect.maxLength 3
  j: Json
}

export interface H {
  first: W.j
  second: Json
}

export interface H2 {
  second: Json
  first: W.j
}
