import type { Token } from '../token'
import { SemanticArrayNode } from './array-node'
import { SemanticConstNode } from './const-node'
import { SemanticStructureNode } from './structure-node'
import { SemanticTupleNode } from './tuple-node'

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

export interface TPrimitiveBaseConfig {
  type?: TPrimitiveTypeDef
  documentation?: string
  flags?: string[]
}

export interface TPrimitiveConfig extends TPrimitiveBaseConfig {
  extensions?: {
    [name: string]: Partial<TPrimitiveConfig>
  }
}

export interface TPrimitiveTypeComplex {
  kind: 'union' | 'intersection' | 'tuple'
  items: TPrimitiveTypeDef[]
  optional?: boolean
}

export interface TPrimitiveTypeArray {
  kind: 'array'
  of: TPrimitiveTypeDef
  optional?: boolean
}

export interface TPrimitiveTypeObject {
  kind: 'object'
  props: Record<string, TPrimitiveTypeDef>
  optional?: boolean
}

export type TPrimitiveTypeFinal = 'string' | 'number' | 'boolean' | 'void' | 'null'
export type TPrimitiveTypeFinalOptional = {
  kind: 'final'
  value: TPrimitiveTypeFinal
  optional: true
}

export type TPrimitiveTypeDef =
  | TPrimitiveTypeComplex
  | TPrimitiveTypeArray
  | TPrimitiveTypeObject
  | TPrimitiveTypeFinal
  | TPrimitiveTypeFinalOptional
