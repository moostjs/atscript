export interface StringLiterals {
  @meta.label "a\\"
  @meta.description 'b\\'
  @expect.pattern "^[^\"]+$", "u", "no \"quotes\""
  quoted: string

  @expect.pattern '^\S+\\$', "", 'it\'s raw'
  raw: string

  @meta.label "a\\\"b"
  odd: string

  lit: "x\\"
}
