import { A, B, Addr2 } from './a'
annotate B {
  @meta.label 'B'
  @expect.maxLength 3
  home.city
  @meta.label 'BL'
  @expect.maxLength 3
  list.city
}
annotate A {
  @meta.label 'A'
  @expect.maxLength 5
  home.city
}
annotate Addr2 {
  @meta.label 'a2'
  @expect.maxLength 3
  city
  @expect.maxLength 2
  zip
}