/* eslint-disable sonarjs/no-nested-template-literals */
/* eslint-disable max-params */
import type { ProstoParserNodeContext } from '@prostojs/parser'
import path from 'path'
import { URL } from 'url'

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

export function resolveAtscriptFromPath(from: string, id: string) {
  return `file://${path.join(id.slice(7).split('/').slice(0, -1).join('/'), from)}.as`
}

export function getRelPath(fromUri: string, toUri: string): string {
  // Convert URIs to file paths (remove "file://" scheme)
  const fromPath = new URL(fromUri).pathname
  const toPath = new URL(toUri).pathname

  // Compute the relative path
  const relPath = path.relative(path.dirname(fromPath), toPath)

  // Remove the file extension
  const { dir, name } = path.parse(relPath)

  const prefix = dir.startsWith('..') ? '' : './'

  return `${prefix}${dir ? `${dir}/` : ''}${name}`
}
