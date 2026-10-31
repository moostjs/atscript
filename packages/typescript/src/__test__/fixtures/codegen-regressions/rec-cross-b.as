import { A, X } from './rec-cross-a'

export interface B {
  bb: string
  ba?: A & Y
}

export interface Y {
  y?: string
  t?: B & X & Y
}
