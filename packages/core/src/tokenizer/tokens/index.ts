import type { ProstoParserNodeContext } from '@prostojs/parser'
import { BasicNode } from '@prostojs/parser'

import { toVsCodeRange } from '../../parser/utils'
import type { TLexicalToken } from '../types'
import { AIdentifierToken } from './a-identifier.token'
import { BlockToken } from './block.token'
import { commentNodes } from './comment.token'
import { IdentifierToken } from './identifier.token'
import { NumberToken } from './number.token'
import { PunctuationToken } from './punctuation.token'
import { TextToken } from './text.node'

export const tokens = {
  aIdentifier: AIdentifierToken,
  punctuation: PunctuationToken,
  comments: commentNodes.all,
  inlineComment: commentNodes.inline,
  blockComment: commentNodes.block,
  block: BlockToken,
  identifier: IdentifierToken,
  number: NumberToken,
  text: TextToken,
  root: undefined as unknown as BasicNode<TLexicalToken>,
}

export const root = new BasicNode<TLexicalToken>({
  label: 'root',
  skipToken: /\s/u,
}).addRecognizes(
  ...tokens.comments,
  tokens.block,
  tokens.aIdentifier,
  tokens.identifier,
  tokens.text,
  tokens.number,
  tokens.punctuation
)

tokens.root = root

BlockToken.addRecognizes(
  ...tokens.comments,
  tokens.block,
  tokens.aIdentifier,
  tokens.identifier,
  tokens.text,
  tokens.number,
  tokens.punctuation
)

export const mapContent = (content: ProstoParserNodeContext['content']) =>
  content.map(item => {
    if (typeof item === 'string') {
      return {
        type: 'unknown',
        text: item,
      } as TLexicalToken
    }
    const data = item.getCustomData<TLexicalToken>()
    data.getRange = () =>
      toVsCodeRange(item.startPos, item.endPos, data.startOffset, data.endOffset)
    return data
  })

for (const node of Object.values(tokens)) {
  if (node instanceof BasicNode) {
    node.popsAtEOFSource(true).mapContent('children', mapContent)
  }
}
