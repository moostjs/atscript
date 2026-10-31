import { CrossA } from './cross-a'

export interface CrossB {
  @expect.minLength 2
  b: string
  a?: CrossA & CrossTag
}

export interface CrossTag {
  @expect.maxLength 3
  tag?: string
}
