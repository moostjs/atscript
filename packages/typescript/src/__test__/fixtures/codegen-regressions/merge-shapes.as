// Intersections whose operands are intersections, arrays or unions: merged like TypeScript reads
// them (they used to merge into `never`).
export interface MsA {
  a: string
}

export interface MsB {
  b: string
}

export interface MsE {
  e: string
}

export type MsEB = MsE & MsB

export interface MsNested {
  p: MsE & (MsB & MsA)
  q: (MsE & MsB) & MsA
  r: MsEB & MsA
}

export interface MsArrA {
  x: { a: string }[]
}

export interface MsArrB {
  x: { b: string }[]
}

export type MsArrays = MsArrA & MsArrB

export interface MsNullA {
  y: { a: string } | null
}

export interface MsNullB {
  y: { b: string }
}

export type MsNullable = MsNullA & MsNullB

export interface MsOptA {
  y?: { a: string } | null
}

export interface MsOptB {
  y?: { b: string } | null
}

export type MsBothNullable = MsOptA & MsOptB
