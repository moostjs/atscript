import { TA, TB, IC } from './a'
annotate TA {
  @meta.readonly
}
annotate TB {
  @meta.label 'B'
}
annotate IC {
  @meta.readonly
  @meta.label 'C'
}
