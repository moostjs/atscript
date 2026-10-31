// Members repeated through merges (`Node & Node`): the intersection keys stay sets.
export interface Node {
  parent?: Wrapper
}

export interface X {
  x?: string
}

export interface Y {
  y?: string
}

export interface A {
  w?: Node & X
}

export interface B {
  w?: Node & Y
}

export interface Wrapper {
  ab?: A & B
}
