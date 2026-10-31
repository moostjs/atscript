import { A, SA, W, B, SB } from './a'
annotate A {
  @expect.pattern '^a2'
  x
}
annotate SA {
  @expect.pattern '^a2'
  x
}
annotate W {
  @expect.pattern '^w3'
  z
}
annotate B {
  @expect.pattern '^b2'
  x
}
annotate SB {
  @expect.pattern '^b2'
  x
}
