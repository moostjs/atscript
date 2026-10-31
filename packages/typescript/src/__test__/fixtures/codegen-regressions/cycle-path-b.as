import { CpT } from './cycle-path-a'

export interface CpS {
  c: CpT | { x: number }
}

// The path goes through a type of the module importing this one (evaluated after it).
annotate CpS {
  @expect.minLength 2
  c.t
}
