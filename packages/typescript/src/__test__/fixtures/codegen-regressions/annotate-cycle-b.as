import { AnnA } from './annotate-cycle-a'

annotate AnnA {
  @expect.maxLength 3
  b.y
}

export interface AnnB {
  y?: string
}
