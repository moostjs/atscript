import path from 'path'
import { URL, fileURLToPath, pathToFileURL } from 'url'

import { isBareSpecifier, withoutAsExtension } from '../resolve-bare'

export type TVsCodeRange = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

/** {@link resolveAtscriptFromPath} by document id and import path (a pure function of both). */
const resolvedFromPaths = new Map<string, Map<string, string>>()

export function resolveAtscriptFromPath(written: string, id: string) {
  let byFrom = resolvedFromPaths.get(id)
  if (!byFrom) {
    byFrom = new Map()
    resolvedFromPaths.set(id, byFrom)
  }
  let resolved = byFrom.get(written)
  if (resolved === undefined) {
    // (`./user.as` is `./user`: one module identity for both spellings)
    const from = withoutAsExtension(written)
    resolved = isBareSpecifier(from)
      ? `bare:${from}.as`
      : pathToFileUri(`${path.join(path.dirname(fileUriToPath(id)), from)}.as`)
    byFrom.set(written, resolved)
  }
  return resolved
}

/**
 * The id of the document of the file at `filePath`: its `file:` URL, percent-encoded as
 * `pathToFileURL` writes it. Every host builds a file's id this way (the editor's client sends its
 * URIs in this form too), so a file has one id: an ordinary path (`@` and `+` included) is
 * `file://` and the path, byte for byte; a space, a non-ASCII character, `%`, `#`, `?`, `~`,
 * brackets and the like are encoded. A relative path (not a file's) is `file://` and the path.
 */
export function pathToFileUri(filePath: string): string {
  return path.isAbsolute(filePath) ? pathToFileURL(filePath).href : `file://${filePath}`
}

/**
 * The filesystem path of document id `id` (see {@link pathToFileUri}): a `file:` URL decoded, as
 * `fileURLToPath` reads it. Any other id passes through. A `file://` id that is not a file URL (a
 * relative path, a raw `#` or `?`) is the rest of it, percent-decoded.
 */
export function fileUriToPath(id: string): string {
  if (!id.startsWith('file://')) {
    return id
  }
  if (!/[?#]/u.test(id)) {
    try {
      return fileURLToPath(id)
    } catch {}
  }
  const raw = id.slice(7)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** The path of `toUri` relative to `fromUri`'s folder, without its extension (`./b`, `../x/b`). */
export function getRelPath(fromUri: string, toUri: string): string {
  // (a file's decoded path: written into generated code and messages as it is on disk)
  const pathOf = (uri: string) =>
    uri.startsWith('file://') ? fileUriToPath(uri) : new URL(uri).pathname
  const fromPath = pathOf(fromUri)
  const toPath = pathOf(toUri)

  // Compute the relative path (with `/`: an import path)
  const relPath = path.relative(path.dirname(fromPath), toPath).split(path.sep).join('/')

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
