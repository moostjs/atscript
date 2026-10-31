import { CycleA } from './cycle-a'

export interface CycleB {
  y?: string
}

annotate CycleA {
  @expect.minLength 2
  x
  @expect.maxLength 3
  b.y
}
