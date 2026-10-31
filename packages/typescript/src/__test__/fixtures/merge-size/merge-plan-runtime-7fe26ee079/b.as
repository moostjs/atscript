import { Base, Meta, M1 } from './a'
annotate Base {
  @meta.label 'base-blk'
  @expect.maxLength 4
  name
}
annotate Meta {
  @meta.description 'meta-blk'
  name
}
annotate M1 {
  @meta.example 'm1'
  name
}