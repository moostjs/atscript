export interface AaTarget {
  x: string
  n: { y: number }
  u: { k: string } | number
}

export type AaUnion = AaTarget | number
