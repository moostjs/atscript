export interface A {
  next?: A
  y?: string
}
export interface B {
  next?: B
  y?: string
}
export annotate A as AX {
  @meta.label 'ax'
  next.y
}
export type M = AX & B
export type M2 = B & AX
export interface H { m?: AX & B }
