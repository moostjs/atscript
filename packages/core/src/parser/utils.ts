import path from 'path'
import { URL } from 'url'

import { isBareSpecifier } from '../resolve-bare'

export type TVsCodeRange = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

/** {@link resolveAtscriptFromPath} by document id and import path (a pure function of both). */
const resolvedFromPaths = new Map<string, Map<string, string>>()

export function resolveAtscriptFromPath(from: string, id: string) {
  let byFrom = resolvedFromPaths.get(id)
  if (!byFrom) {
    byFrom = new Map()
    resolvedFromPaths.set(id, byFrom)
  }
  let resolved = byFrom.get(from)
  if (resolved === undefined) {
    resolved = isBareSpecifier(from)
      ? `bare:${from}.as`
      : `file://${path.join(fileUriToPath(id).split('/').slice(0, -1).join('/'), from)}.as`
    byFrom.set(from, resolved)
  }
  return resolved
}

// LSP clients (VSCode) percent-encode `@`/`+` etc. in URIs, but on-disk paths
// are unencoded — decode before any fs access. Non-`file://` ids pass through.
export function fileUriToPath(id: string): string {
  if (!id.startsWith('file://')) {
    return id
  }
  const raw = id.slice(7)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
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

/**
 * The warning for the stateful flags (`g`, `y`) of a validation regex (`@expect.pattern`
 * flags, a `[/…/flags]` prop pattern): the validators compile the regex without them, so
 * `g` does nothing and `y` only anchors the match at the start of the `subject`.
 */
export function statefulRegexFlagsMessage(flags: string, subject: string): string | undefined {
  const g = flags.includes('g')
  const y = flags.includes('y')
  if (!g && !y) {
    return undefined
  }
  const parts: string[] = []
  if (g) {
    parts.push('flag "g" has no effect on validation')
  }
  if (y) {
    parts.push(`flag "y" matches at the start of the ${subject} only (like "^")`)
  }
  const message = parts.join('; ')
  return message[0].toUpperCase() + message.slice(1)
}
