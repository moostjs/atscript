import { Ord3A } from './order3-a'
import { Ord3B } from './order3-b'

export interface Ord3C {
  a?: Ord3A
  x: string
}

annotate Ord3B {
  @meta.label 'from-c'
  c.a.s
  y
}

annotate Ord3A as Ord3AA {
  @meta.label 'alias'
  b.y
}
