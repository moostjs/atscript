import type { TLexicalToken } from '../tokenizer/types'
import type { NodeIterator } from './iterator'
import type { SemanticNode } from './nodes'

export interface TExpect {
  node: TLexicalToken['type'] | Array<TLexicalToken['type']>
  text?: string | string[]
}

export type TMessages = Array<{
  type: 'error' | 'warning' | 'info' | 'hint'
  message: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}>

export interface TTarget {
  node: SemanticNode
}
export type THandler = (ni: NodeIterator, target: TTarget) => boolean
