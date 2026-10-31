export type LJ = { x: string } | LJ[]

export interface LBase {
  j: LJ
}

export annotate LBase as LView {
  @expect.minLength 2
  j.x
}
