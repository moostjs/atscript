import { LocalAliasX } from './inlined-order-a'

export interface Base3x {
  la?: LocalAliasX
}

annotate Base3x {
  @meta.label "Local alias"
  la
}
