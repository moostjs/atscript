export interface D {
  d?: string
}

export interface C {
  x?: string
}

export interface MSelf {
  s: string
  child?: C
  next?: MSelf & D
}

// Paths re-entering MSelf through the recursive intersection: its own props (`child.x`: a local
// copy of C at its own `child`).
annotate MSelf {
  @expect.maxLength 2
  next.next.s
  @expect.maxLength 3
  next.next.child.x
}

// Two entries reaching MDeep's own `s` (the later one wins).
export interface MDeep {
  s: string
  next?: MDeep & D
}

annotate MDeep {
  @expect.maxLength 2
  next.next.s
  @expect.maxLength 4
  next.next.next.next.s
}

export interface Plain {
  s: string
  next?: Plain & D
}
