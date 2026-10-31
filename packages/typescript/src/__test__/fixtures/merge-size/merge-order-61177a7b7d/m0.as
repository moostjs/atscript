import { X0 } from './m1'
export interface I0 {
  b: string
}
annotate X0 {
  @expect.maxLength 8
  b
}