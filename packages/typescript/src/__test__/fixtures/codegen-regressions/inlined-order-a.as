import { Base3x } from './inlined-order-b'

export interface M3x {
  m: Base3x & { extra?: string }
}

export interface M3xe extends Base3x {
  extra?: string
}

export type LocalAliasX = TgtX

export interface TgtX {
  @expect.minLength 2
  v: string
}
