import { User } from './a'
annotate User {
  @meta.label 'h'
  home.city
  @meta.label 'l'
  list.city
  @meta.label 'd'
  deep.a.city
  @meta.label 'o'
  opt.city
}