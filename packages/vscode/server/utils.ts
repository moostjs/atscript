/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable complexity */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import fs from 'fs'
import { getRelPath, resolveItnFromPath } from 'intertation'
import path from 'path'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function debounce<A>(fn: (a: A) => any, delay: number) {
  let timer: NodeJS.Timeout
  return (a: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      fn(a)
    }, delay)
  }
}

export function createInsertTextRule(
  text: string,
  offset: number,
  type: 1 | 2 | 3
): {
  test: (insertText: string) => boolean
  apply: (insertText: string) => string
  word: string
} {
  const i = offset - 1
  let needSpace = false
  let word = ''

  if (text[i] === ',') {
    needSpace = true
  } else if (i >= 0) {
    // Collect full word
    // eslint-disable-next-line regexp/no-super-linear-move
    const [, s, w] = /([\s.])?(\w+)$/u.exec(text.slice(0, offset)) || []
    word = w
    needSpace = !s && type === 1
  }

  return {
    test(insertText: string) {
      // If there's a partial word, check if the new text continues it
      return word ? insertText.startsWith(word) : true
    },
    apply(insertText: string) {
      return (needSpace ? ' ' : '') + insertText
    },
    word,
  }
}

export async function getItnFileCompletions(
  uri: string,
  word: string
): Promise<Array<{ path: string; isDirectory: boolean }>> {
  // Convert "file:///..." => absolute path
  const docPath = decodeURIComponent(uri.slice(7))

  // For historical consistency, replicate original logic:
  const targetPath = path.join(path.dirname(docPath), `${word || './'}.itn`)
  const dir = path.dirname(targetPath)

  let entries: fs.Dirent[]
  try {
    // Read directory with Dirent objects
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    // Directory doesn't exist or is not readable
    return []
  }

  // If user typed './some', then match = 'some'
  // If user typed '../foo/bar', then match = 'bar'
  // If user typed '', then match = ''
  const match = word.split('/').pop() ?? ''

  // Collect directories and .itn files that start with `match`
  // Directories => we return them with a trailing slash
  // .itn files => remove the extension
  return entries
    .filter(entry => entry.name.startsWith(match))
    .map(entry => {
      if (entry.isDirectory()) {
        // Append slash so user can continue navigating deeper
        return {
          path: getRelPath(uri, `file://${path.join(dir, entry.name)}`),
          isDirectory: true,
        }
      } else if (entry.isFile() && entry.name.endsWith('.itn')) {
        // Remove the .itn extension
        const fileNoExt = path.join(dir, entry.name).slice(0, -4)
        return {
          path: getRelPath(uri, `file://${fileNoExt}`),
          isDirectory: false,
        }
      }
      // Not a directory or an .itn file => skip
      return undefined
    })
    .filter(Boolean) as Array<{ path: string; isDirectory: boolean }>
}
