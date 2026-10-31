export interface Base3 {
  la?: LocalAlias
}

export interface M3 {
  m: Base3 & { extra?: string }
}

export interface M3e extends Base3 {
  extra?: string
}

export type LocalAlias = Tgt

export interface Tgt {
  @expect.minLength 2
  v: string
}
