import type { TPunctuation } from '../tokenizer/nodes/punctuation.node'
import type { TNodeData } from '../tokenizer/types'
import type { NodeIterator } from './iterator'
import type { Token } from './token'

export interface TExpect {
  node: TNodeData['node'] | Array<TNodeData['node']>
  text?: string | string[]
}

export interface TTransformedNode {
  entity:
    | 'interface'
    | 'type'
    | 'ref'
    | 'const'
    | 'value'
    | 'prop'
    | 'structure'
    | 'argument'
    | 'tuple'
    | 'group'
    | 'array'
  flags: Map<string, Token>
  isGroup?: false
  type?: Token
  token?: Token
  name?: Token
  definition?: TGroupedNodes | TTransformedNode
  annotations?: Record<string, TTransformedAnnotation | undefined>
}

export interface TGroupedNodes {
  isGroup: true
  operator?: TPunctuation
  nodes: Array<TTransformedNode | TGroupedNodes>
}

export interface TTransformedAnnotation {
  token: Token
  args: Token[]
}

export type TMessages = Array<{
  type: 'error' | 'warning' | 'info' | 'hint'
  message: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}>

export type TDeclorations = Record<string, Set<string> | undefined>
export type TTokenizedAttrs = 'type' | 'token' | 'name'

export interface TTarget {
  node: TTransformedNode
}
export type THandler = (ni: NodeIterator, target: TTarget, declarations: TDeclorations) => boolean
