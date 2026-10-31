export interface Hidden {
  @expect.minLength 2
  h: string
}

export interface HBase {
  hidden?: Hidden
}
