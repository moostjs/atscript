import { RBase } from './rec-inline-b'

export annotate RBase as RView {
  @expect.minLength 2
  j.x
}

export annotate RBase as RTyping {
  j.x
}
