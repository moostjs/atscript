export interface Node {
  @expect.maxLength 9
  name?: string
  next?: Node & {
    @meta.label 'inl'
    name?: string
  }
}
export interface H { n?: Node }
