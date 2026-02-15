@ts.buildJsonSchema
export interface User {
  @expect.minLength 3
  @expect.maxLength 20
  name: string

  @expect.min 18
  @expect.max 99
  age?: number
}

export interface NoAnnotation {
  title: string
}
