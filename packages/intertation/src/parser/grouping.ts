/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable no-empty */
import type { TPunctuation } from '../tokenizer/nodes/punctuation.node'
import { Token } from './token'
import type { TGroupedNodes, TTransformedNode } from './types'

export function groupByPriority(
  nodes: Array<TTransformedNode | Token>,
  priority: TPunctuation[]
): TTransformedNode | TGroupedNodes | undefined {
  if (nodes.length === 1) {
    return nodes[0] as TTransformedNode | TGroupedNodes
  }
  if (nodes.length === 0) {
    return undefined
  }
  if (nodes.length % 2 === 0) {
    throw new Error(`Invalid number of nodes ${nodes.length}. Odd number expected`)
  }
  let currentPass = nodes as Array<TTransformedNode | TGroupedNodes | Token>
  let temporaryResult = [] as Array<TTransformedNode | TGroupedNodes | Token>
  let groupped = [] as Array<TTransformedNode | TGroupedNodes>
  for (const p of priority) {
    for (const [i, node] of currentPass.entries()) {
      const isOperator = i % 2 === 1
      if (!isOperator && node instanceof Token) {
        throw new Error(`Unexpected token ${node.toString()} at ${i}`)
      } else if (isOperator && !(node instanceof Token)) {
        throw new Error(
          `Unexpected token ${node.isGroup ? node.operator : node.token?.toString()} at ${i}`
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
        temporaryResult.push(node as TTransformedNode)
        continue
      }
      if (prev === p || next === p) {
        groupped.push(node as TTransformedNode)
        if (next !== p) {
          temporaryResult.push({
            isGroup: true,
            operator: p,
            nodes: groupped,
          })
          groupped = []
        }
      }
    }
    currentPass = temporaryResult
    temporaryResult = []
  }
  const output = currentPass[0] as TGroupedNodes
  return output.nodes.length === 1 ? output.nodes[0] : output
}
