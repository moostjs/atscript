export interface A {
  next?: A
  @expect.maxLength 5
  y?: string
}
export interface B {
  next?: B
  @meta.label 'B'
  y?: string
}
export type M = A & B
export interface H {
  c?: M.next
  cy?: M.next.y
  dy?: M.next.next.y
  ty?: M.y
}
