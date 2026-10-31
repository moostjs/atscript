export interface P2 {
  @expect.minLength 2
  p: string
}

export interface Q2 extends P2 {
  q?: string
}
