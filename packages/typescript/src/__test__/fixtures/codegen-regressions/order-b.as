import { OrdA } from './order-a'

export interface OrdB {
  t: string
  a?: OrdA
}

annotate OrdA {
  @expect.maxLength 5
  b.t
  @meta.label 'from-b'
  b.a.s
}
