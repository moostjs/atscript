import { B, Y } from './rec-cross-b'

// Recursive intersections across two modules (members of both, reaching one another).
export interface A {
  a: string
  b?: B & X
}

export interface X {
  @expect.maxLength 2
  x?: string
  a2?: A & Y
}

export type T = A & B

export type T3 = A & B & X & Y

export interface E extends A {
  e?: E & X
}

export annotate T as TA {
  @expect.maxLength 1
  b.a2.b.x
}
