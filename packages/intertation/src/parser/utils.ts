/* eslint-disable max-params */
import type { ProstoParserNodeContext } from '@prostojs/parser'

export function toVsCodeRange(
  start: ProstoParserNodeContext['startPos'],
  end: ProstoParserNodeContext['endPos'],
  startOffset = 0,
  endOffset = 0
) {
  return {
    start: {
      line: start.row,
      character: start.col + startOffset,
    },
    end: {
      line: end.row,
      character: end.col + endOffset,
    },
  }
}

export type TVsCodeRange = ReturnType<typeof toVsCodeRange>
