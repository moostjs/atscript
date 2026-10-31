import { CrossB, CrossTag } from './cross-b'

// A recursive merge with a member of another module (merged at build time).
export interface CrossA {
  a: string
  b?: CrossB & CrossTag
}
