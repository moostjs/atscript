import type { Token } from '../token'

export type TSemanticToken = 'type' | 'identifier' | 'array' | 'public' | 'optional'
export type TNodeEntity =
  | 'interface' //
  | 'type' //
  | 'ref' //
  | 'const' //
  | 'prop' //
  | 'structure' //
  | 'tuple' //
  | 'group' //
  | 'array' //

export interface TAnnotationTokens {
  token: Token
  args: Token[]
}
