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
  name: string
  token: Token
  args: Token[]
}

type TPrimitiveTargets = 'typescript' // potentially extendable to other languages like python, java, etc

type TPrimitiveMaps = {
  [name in TPrimitiveTargets]?: string
}

export interface TPrimitiveBaseConfig {
  base: 'numeric' | 'string' | 'boolean' | 'void' | 'null'
  lang?: TPrimitiveMaps
  documentation?: string
  flags?: Set<string>
}

export interface TPrimitiveConfig extends TPrimitiveBaseConfig {
  extensions?: {
    [name: string]: Partial<TPrimitiveConfig>
  }
}
