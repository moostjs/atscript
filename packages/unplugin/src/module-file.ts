import path from 'path'

import { fileUriToPath } from '@atscript/core'

/**
 * The file of `fileOrUri` (a path, or the id of a document) as bundlers write module ids, and as
 * the plugin keys its files by: on Windows with `/` (Vite's ids; the plugin normalizes the ids of
 * the other bundlers too), elsewhere as it is.
 */
export function moduleFile(fileOrUri: string, sep = path.sep): string {
  const file = fileUriToPath(fileOrUri)
  return sep === '\\' ? file.replaceAll('\\', '/') : file
}
