/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable no-empty */
import type { TPunctuation } from '../tokenizer/tokens/punctuation.token'
import type { SemanticNode } from './nodes'
import { $n, isGroup } from './nodes'
import type { SemanticGroup } from './nodes/group-node'
import { Token } from './token'

export function groupByPriority(
  nodes: Array<SemanticNode | Token>,
  priority: TPunctuation[]
): SemanticNode | undefined {
  if (nodes.length === 1) {
    return nodes[0] as SemanticNode
  }
  if (nodes.length === 0) {
    return undefined
  }
  if (nodes.length % 2 === 0) {
    throw new Error(`Invalid number of nodes ${nodes.length}. Odd number expected`)
  }
  let currentPass = nodes
  let temporaryResult = [] as Array<SemanticNode | Token>
  let groupped = [] as SemanticNode[]
  for (const p of priority) {
    for (const [i, node] of currentPass.entries()) {
      const isOperator = i % 2 === 1
      if (!isOperator && node instanceof Token) {
        throw new Error(`Unexpected token ${node.toString()} at ${i}`)
      } else if (isOperator && !(node instanceof Token)) {
        throw new Error(
          `Unexpected token ${isGroup(node) ? node.op : node.token.toString()} at ${i}`
        )
      }
      if (isOperator) {
        if ((node as Token).text !== p) {
          temporaryResult.push(node as Token)
        }
        continue
      }
      const prev = (currentPass[i - 1] as Token | undefined)?.text
      const next = (currentPass[i + 1] as Token | undefined)?.text
      if (prev !== p && next !== p) {
        temporaryResult.push(node as SemanticNode)
        continue
      }
      if (prev === p || next === p) {
        groupped.push(node as SemanticNode)
        if (next !== p) {
          temporaryResult.push(new $n.SemanticGroup(groupped, p))
          groupped = []
        }
      }
    }
    currentPass = temporaryResult
    temporaryResult = []
  }
  const output = currentPass[0] as SemanticGroup
  return output.length === 1 ? output.first : output
}
