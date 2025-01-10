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

export function getItnFileCompletions(uri: string, word: string): string[] {
  const docPath = decodeURIComponent(uri.slice(7))
  const targetPath = path.join(path.dirname(docPath), `${word || './'}.itn`)
  const dir = path.dirname(targetPath)
  let files: string[] = []

  try {
    files = fs.readdirSync(dir)
  } catch {
    // Directory doesn't exist or is not readable
    return []
  }

  const match = word.split('/').pop() ?? ''

  return files
    .filter(name => name.endsWith('.itn') && name.startsWith(match))
    .map(name => getRelPath(uri, `file://${path.join(dir, name).slice(0, -4)}`))
}
