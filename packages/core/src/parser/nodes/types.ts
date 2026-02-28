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
  | 'target'

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
  | 'annotate'

export interface TAnnotationTokens {
  name: string
  token: Token
  args: Token[]
}

export type TPrimitiveAnnotationArg = string | number | boolean
export type TPrimitiveAnnotationArgs = Record<string, TPrimitiveAnnotationArg>
export type TPrimitiveAnnotationValue =
  | boolean // no-arg annotation (e.g., 'expect.int': true)
  | string // single string arg (e.g., 'db.default.fn': 'now')
  | number // single number arg (e.g., 'expect.min': 0)
  | TPrimitiveAnnotationArgs // multi named args (e.g., { pattern: '...', flags: 'i', message: '...' })
  | (TPrimitiveAnnotationArg | TPrimitiveAnnotationArgs)[] // multiple instances

export interface TPrimitiveBaseConfig {
  type?: TPrimitiveTypeDef
  documentation?: string
  tags?: string[]
  isContainer?: boolean
  annotations?: Record<string, TPrimitiveAnnotationValue>
}

export interface TPrimitiveConfig extends TPrimitiveBaseConfig {
  extensions?: Record<string, Partial<TPrimitiveConfig>>
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

export type TPrimitiveTypeFinal = 'string' | 'number' | 'boolean' | 'void' | 'null' | 'phantom'
export interface TPrimitiveTypeFinalOptional {
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
