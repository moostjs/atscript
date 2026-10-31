import { T } from './t'
export annotate T as X {
  @meta.label 'x'
  p.q
}
export annotate X as Y {
  @meta.description 'y'
  p.q
}
export interface UseA { y?: Y }
