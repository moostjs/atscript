// Mutating annotate paths are the annotated type's own annotations, live wherever it is used: a
// step reaching the annotated type again is its own prop (every depth, the top level included);
// a path into another type refines it at that spot (its copy refers to the live annotated type).
export interface PeT {
  name: string
  next?: PeT
  kids: PeT[]
  alt?: PeT | null
}

annotate PeT {
  @expect.minLength 3
  next.name
  @expect.maxLength 5
  alt.name
}

// A reference to the annotated type from another type: the annotated type.
export interface PeHolder {
  t: PeT
}

// Mutual recursion: `a` is another type (an override), whose `b` is PeB itself.
export interface PeA {
  s: string
  b?: PeB
}

export interface PeB {
  t: string
  a?: PeA
}

annotate PeB {
  @expect.minLength 2
  a.s
}

// Three types in a cycle: `y.z.x` is PeX itself.
export interface PeX {
  s: string
  y?: PeY
}

export interface PeY {
  z?: PeZ
}

export interface PeZ {
  x?: PeX
}

annotate PeX {
  @expect.maxLength 2
  y.z.x.s
}

// A path starting inside the annotated type's own inline structure: `inner.back` is PeI.
export interface PeI {
  s?: string
  inner?: { back?: PeI }
  again?: PeI
}

annotate PeI {
  @expect.maxLength 2
  inner.back.s
}

// An override (`lead`, a PePerson) referring to the live PeDept (`lead.dept`, `lead.team.dept`).
export interface PeDept {
  title: string
  lead?: PePerson
}

export interface PePerson {
  name: string
  dept?: PeDept
  team?: PeTeam
}

export interface PeTeam {
  dept?: PeDept
}

export interface PeOrg {
  dept: PeDept
}

annotate PeDept {
  @expect.maxLength 2
  lead.name
}

// The documented example: `lead.dept` is PeD2 itself.
export interface PeD2 {
  title: string
  lead?: PeP2
}

export interface PeP2 {
  name: string
  dept?: PeD2
}

annotate PeD2 {
  @expect.minLength 2
  lead.dept.title
}
