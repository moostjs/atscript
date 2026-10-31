export interface $ {
  a: string
}

export interface $a {
  b?: $
}

export interface $c {
  @expect.minLength 2
  c: string
}

export interface $cv {
  d?: $c
}

export interface $d {
  x: $a
}

annotate $d {
  @expect.maxLength 3
  x.b.a
}

export interface $p {
  p?: string
}
