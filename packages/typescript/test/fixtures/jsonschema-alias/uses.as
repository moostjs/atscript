import { AliasOfPoint } from './target'

export type ReAlias = AliasOfPoint

export interface UsesAlias {
  a: ReAlias
  b: [AliasOfPoint, ReAlias]
}
