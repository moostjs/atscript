// A mutating annotate path re-entering the annotated (self-recursive) type: its own prop, at
// every depth.
export interface RT {
  s?: string
  inner?: { back?: RT }
  next?: RT
}

annotate RT {
  @expect.maxLength 2
  next.next.s
}

// A path through a reference to it from another type.
export interface RV {
  t: RT
}

annotate RV {
  @expect.maxLength 3
  t.next.s
}
