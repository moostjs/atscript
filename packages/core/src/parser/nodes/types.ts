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

export interface TPrimitiveBaseConfig {
  type?: TPrimitiveTypeDef
  documentation?: string
  tags?: string[]
  expect?: {
    min?: number // number
    max?: number // number
    int?: boolean // number
    minLength?: number // string | array
    maxLength?: number // string | array
    pattern?: string | RegExp | (string | RegExp)[] // string
    message?: string
  }
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
  propsPatterns: Record<string, TPrimitiveTypeDef>
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
