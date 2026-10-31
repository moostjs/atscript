import { A, B } from './a'
annotate A {
  @meta.label 'A'
  @expect.maxLength 5
  addr.city
  @meta.label 'AL'
  @expect.maxLength 3
  list.city
}
annotate B {
  @meta.label 'B'
  @expect.maxLength 3
  addr.city
}