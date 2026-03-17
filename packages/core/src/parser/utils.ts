import path from 'path'
import { URL } from 'url'

import { isBareSpecifier } from '../resolve-bare'

export type TVsCodeRange = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

export function resolveAtscriptFromPath(from: string, id: string) {
  if (isBareSpecifier(from)) {
    return `bare:${from}.as`
  }
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
