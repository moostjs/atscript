import { Ord3B } from './order3-b'
import { Ord3C } from './order3-c'

export interface Ord3A {
  s: string
  b?: Ord3B
  self?: Ord3A
}

annotate Ord3C {
  @meta.label 'from-a'
  a.b.c.x
  @expect.minLength 2
  a.s
}

annotate Ord3B {
  @meta.description 'a-on-b'
  c.a.self.s
}
