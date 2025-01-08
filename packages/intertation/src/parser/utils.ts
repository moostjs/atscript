/* eslint-disable max-params */
import type { ProstoParserNodeContext } from '@prostojs/parser'
import path from 'path'

export function toVsCodeRange(
  start: ProstoParserNodeContext['startPos'],
  end: ProstoParserNodeContext['endPos'],
  startOffset = 0,
  endOffset = 0
) {
  return {
    start: {
      line: start.row - 1,
      character: start.col + startOffset,
    },
    end: {
      line: end.row - 1,
      character: end.col + endOffset,
    },
  }
}

export type TVsCodeRange = ReturnType<typeof toVsCodeRange>

export function resolveItnFromPath(from: string, id: string) {
  return `file://${path.join(id.slice(7).split('/').slice(0, -1).join('/'), from)}.itn`
}
