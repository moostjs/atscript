import { Ord3A } from './order3-a'
import { Ord3C } from './order3-c'

export interface Ord3B {
  c: Ord3C
  y: string
}

annotate Ord3A {
  @meta.label 'from-b'
  b.c.x
  @expect.maxLength 9
  self.self.s
}
