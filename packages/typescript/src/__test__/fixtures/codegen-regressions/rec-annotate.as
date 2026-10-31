export interface D {
  d?: string
}

export interface Self {
  s: string
  next?: Self & D
}

export interface H {
  one: Self & D
}

export annotate H as H2 {
  @expect.maxLength 2
  one.next.d
  @meta.label 'deep'
  one.next.next.s
}

export annotate Self as S2 {
  @expect.maxLength 3
  next.next.d
}

export interface Ext {
  e?: string
}

export interface Rec {
  r?: Rec & Ext
  list: (Rec & Ext)[]
}

export annotate Rec as RecA {
  @expect.maxLength 2
  r.e
}
