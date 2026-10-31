import { $mc } from './helper-names-a'

export interface $m {
  y?: string
}

annotate $mc {
  @expect.minLength 2
  x
}
