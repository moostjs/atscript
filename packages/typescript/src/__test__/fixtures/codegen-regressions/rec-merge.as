export interface Extra {
  tag: string
}

export interface Base {
  id: string
  children?: (Node & Extra)[]
}

export interface Node extends Base {
  @expect.minLength 2
  name: string
}

export interface D {
  d?: string
}

export interface Self {
  @expect.minLength 2
  s: string
  next?: Self & D
}

export type SD = Self & D

export interface X3 {
  @expect.minLength 2
  x: string
  nxt?: X3 & Y3 & Z3
}

export interface Y3 {
  y?: string
}

export interface Z3 {
  z?: string
}

export type XYZ = X3 & Y3 & Z3

export interface A {
  a: string
}

export interface B {
  b?: string
}

export type T = A & B
