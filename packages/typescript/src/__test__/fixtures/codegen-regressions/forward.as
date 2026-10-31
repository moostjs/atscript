export type Alias = Target
export type PropAlias = Target.x
export interface Holder {
  alias: AliasOfAlias
}
export type AliasOfAlias = Alias

export interface Target {
  @expect.minLength 2
  x: string
}

annotate Alias {
  @expect.maxLength 3
  x
}
