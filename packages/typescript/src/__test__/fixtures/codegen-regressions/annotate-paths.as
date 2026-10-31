// Mutating annotate paths through intersections kept at runtime and union branches: a prop a
// member / branch inherits (`extends`), a branch that is a reference, a branch without the prop.
export interface PBase {
  own: string
}

export interface PRec extends PBase {
  cs?: PRec & { d: number }
}

export interface PHolder {
  c: PRec & PRec
}

annotate PHolder {
  @expect.minLength 2
  c.cs.own
}

export interface PChild extends PBase {
  u: string
}

export interface PUnion {
  c: PChild | { own?: string }
}

annotate PUnion {
  @expect.minLength 2
  c.own
}

export interface PSelf {
  own: string
  a?: PSelf | { x: number }
}

annotate PSelf {
  @expect.minLength 2
  a.own
}

export interface PWord {
  c: string
}

export interface PLeaf {
  e: string
}

export interface PBranches {
  a?: PWord | { c: PLeaf }
}

annotate PBranches {
  @expect.minLength 2
  a.c.e
}
