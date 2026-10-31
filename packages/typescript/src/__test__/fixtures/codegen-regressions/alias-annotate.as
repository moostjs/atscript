import { AaTarget, AaUnion } from './alias-annotate-b'

export type AaAlias = AaTarget

annotate AaAlias {
  @expect.min 3
  n.y
  @expect.maxLength 2
  u.k
  @meta.label "X"
  x
}

export type AaUnionAlias = AaUnion

annotate AaUnionAlias {
  @expect.min 5
  n.y
}

export interface AaLocal {
  n: { y: number }
}

export type AaLocalAlias = AaLocal

annotate AaLocalAlias {
  @expect.min 3
  n.y
}
