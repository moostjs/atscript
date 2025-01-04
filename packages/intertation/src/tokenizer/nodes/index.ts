import type { ProstoParserNodeContext } from '@prostojs/parser'
import { BasicNode } from '@prostojs/parser'

import { toVsCodeRange } from '../../parser/utils'
import type { TNodeData } from '../types'
import { AIdentifierNode } from './a-identifier.node'
import { BlockNode } from './block.node'
import { commentNodes } from './comment.node'
import { IdentifierNode } from './identifier.node'
import { NumberNode } from './number.node'
import { PunctuationNode } from './punctuation.node'
import { TextNode } from './text.node'

export const nodes = {
  aIdentifier: AIdentifierNode,
  punctuation: PunctuationNode,
  comments: commentNodes.all,
  inlineComment: commentNodes.inline,
  blockComment: commentNodes.block,
  block: BlockNode,
  identifier: IdentifierNode,
  number: NumberNode,
  text: TextNode,
  root: undefined as unknown as BasicNode<TNodeData>,
}

export const rootNode = new BasicNode<TNodeData>({
  label: 'root',
  skipToken: /\s/u,
}).addRecognizes(
  ...nodes.comments,
  nodes.block,
  nodes.punctuation,
  nodes.aIdentifier,
  nodes.identifier,
  nodes.text,
  nodes.number,
  nodes.punctuation
)

nodes.root = rootNode

BlockNode.addRecognizes(
  ...nodes.comments,
  nodes.block,
  nodes.punctuation,
  nodes.aIdentifier,
  nodes.identifier,
  nodes.text,
  nodes.number,
  nodes.punctuation
)

export const mapContent = (content: ProstoParserNodeContext['content']) =>
  content.map(item => {
    if (typeof item === 'string') {
      return {
        node: 'unknown',
        text: item,
      } as TNodeData
    }
    const data = item.getCustomData<TNodeData>()
    data.getRange = () =>
      toVsCodeRange(item.startPos, item.endPos, data.startOffset, data.endOffset)
    return data
  })

for (const node of Object.values(nodes)) {
  if (node instanceof BasicNode) {
    node.popsAtEOFSource(true).mapContent('children', mapContent)
  }
}
