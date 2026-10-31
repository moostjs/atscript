import { P } from './inherited-a'

// A mutating annotate path through a prop inherited from another module's interface.
export interface Q extends P {
  q?: string
}

annotate Q {
  @expect.maxLength 1
  k.c
}
