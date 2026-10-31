import { LzT0 } from './lazy-cycle-a'

export interface LzS0 {
  own: string
  d?: LzT0
}

export interface LzS1 {
  b: LzS0
}

// Clones `b` (a reference) while the import cycle's other module is not evaluated yet.
annotate LzS1 {
  @expect.minLength 2
  b.own
}
