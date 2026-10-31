export type Json = string | Json[]

export interface H {
  @expect.maxLength 3
  a: Json
  b: Json
}
