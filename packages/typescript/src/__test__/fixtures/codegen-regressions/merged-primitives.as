export type Num = number

export interface MergedPrimitives {
  n: { v: number.int } & { v: Num }
  b: { v: number.int.uint8 } & { v: number }
}
