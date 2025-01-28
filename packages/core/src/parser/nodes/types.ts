import type { Token } from '../token'

export type TSemanticToken =
  | 'type'
  | 'identifier'
  | 'array'
  | 'export'
  | 'optional'
  | 'inner'
  | 'path'
  | 'from'

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
  | 'import'
  | 'primitive'

export interface TAnnotationTokens {
  token: Token
  args: Token[]
}

export interface TPrimitiveConfig {
  nativeTypes?: {
    [name in 'typescript' | 'java' | 'python' | 'csharp' | 'go']?: string
  }
  nativeConstructors?: {
    [name in 'typescript' | 'java' | 'python' | 'csharp' | 'go']?: string
  }
  documentation?: string
}
