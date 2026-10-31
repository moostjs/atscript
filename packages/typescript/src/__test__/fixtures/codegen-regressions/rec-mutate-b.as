import { Plain } from './rec-mutate'

export interface Tgt {
  inner: { x: string }
}

// Paths through other types' trees (a reference, then their own nested types).
export interface MHolder {
  m: Plain
  t: Tgt
}

annotate MHolder {
  @expect.maxLength 2
  m.next.next.s
  @expect.maxLength 4
  m.next.next.next.next.s
  @expect.maxLength 2
  t.inner.x
}
