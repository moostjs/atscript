export interface A {
  b: B
  x: string
}

annotate A {
  @expect.maxLength 3
  b.y
}

export interface B {
  y?: string
}
