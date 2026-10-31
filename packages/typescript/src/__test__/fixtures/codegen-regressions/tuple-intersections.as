// Intersections of tuples of objects: `never` (a warning); of scalars: a tuple of the items'
// intersections.
export interface TiA {
  a: string
}

export interface TiB {
  b: number
}

export interface TupleInter {
  same: [TiA] & [TiB]
  pair?: [TiA, string] & [TiB, string]
  mixed?: TiA[] & [TiB]
  apart?: [TiA] & [TiB, TiB]
}

export interface TupleScalars {
  s: [string, number] & [string, number]
}
