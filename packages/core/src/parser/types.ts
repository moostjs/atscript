import type { TLexicalToken } from '../tokenizer/types'
import type { NodeIterator } from './iterator'
import type { SemanticNode } from './nodes'

export interface TExpect {
  node: TLexicalToken['type'] | Array<TLexicalToken['type']>
  text?: string | string[]
}

export enum TSeverity {
  Error = 1,
  Warning = 2,
  Info = 3,
  Hint = 4,
}

export type TMessages = Array<{
  severity: TSeverity
  message: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  tags?: Array<1 | 2>
}>

export interface TTarget<T extends SemanticNode = SemanticNode> {
  node: T
}
export type THandler = (ni: NodeIterator, target: TTarget) => boolean
