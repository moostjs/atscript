export interface User {
  @expect.minLength 3
  @expect.maxLength 20
  @expect.pattern "^[a-z]+$", "u"
  name: string

  @expect.min 18
  @expect.max 99
  age?: number

  @expect.exclusiveMin 0
  @expect.exclusiveMax 1
  ratio?: number

  @expect.minLength 1
  @expect.maxLength 5
  tags: string[]
}
