import { Wrapper } from './rec-dup-a'

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
