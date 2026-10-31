import { Address, Admin } from './a'
annotate Address {
  @meta.label 'B-addr'
  @expect.maxLength 3
  city
}
annotate Admin {
  @meta.label 'Admin-home'
  home.city
}