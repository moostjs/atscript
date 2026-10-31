export type Json = string | number | Json[]

export type Nested = string | { a: Nested }

export interface Doc {
  json: Json
  nested?: Nested
  tree: Json[]
}
