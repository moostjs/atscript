import { OrdB } from './order-b'

export interface OrdA {
  s: string
  b?: OrdB
}

annotate OrdB {
  @expect.minLength 2
  a.s
}
