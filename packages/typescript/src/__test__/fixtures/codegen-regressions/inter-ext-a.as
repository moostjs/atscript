import { Q2 } from './inter-ext-b'

export type MQ2 = Q2 & { x?: string }

export interface LocalP {
  @expect.minLength 2
  lp: string
}

export interface LocalQ extends LocalP {
  lq?: string
}

export type MLocal = LocalQ & { y?: string }
