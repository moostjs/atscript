import { UseA } from './a'
export interface T {
  p: P
  u?: UseA
}
export interface P { q?: string }
annotate T {
  @expect.maxLength 3
  p.q
}
