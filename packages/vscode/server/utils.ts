/* eslint-disable unicorn/no-for-loop */
/* eslint-disable regexp/no-super-linear-backtracking */
/* eslint-disable regexp/no-super-linear-move */
/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable complexity */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { getRelPath } from '@anscript/core'
import fs from 'fs'
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
  const targetPath = path.join(path.dirname(docPath), `${word || './'}.as`)
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

  // Collect directories and .as files that start with `match`
  // Directories => we return them with a trailing slash
  // .as files => remove the extension
  return entries
    .filter(
      entry => entry.name.startsWith(match) && path.join(entry.parentPath, entry.name) !== docPath
    )
    .map(entry => {
      if (entry.isDirectory()) {
        // Append slash so user can continue navigating deeper
        return {
          path: getRelPath(uri, `file://${path.join(dir, entry.name)}`),
          isDirectory: true,
        }
      } else if (entry.isFile() && entry.name.endsWith('.as')) {
        // Remove the .as extension
        const fileNoExt = path.join(dir, entry.name).slice(0, -4)
        return {
          path: getRelPath(uri, `file://${fileNoExt}`),
          isDirectory: false,
        }
      }
      // Not a directory or an .as file => skip
      return undefined
    })
    .filter(Boolean) as Array<{ path: string; isDirectory: boolean }>
}

/**
 * Walks backward from `offset - 1` until finding a character that doesn't match
 * any provided skip rules. Returns that character, or `undefined` if none found.
 *
 * @param text - The string in which to search.
 * @param offset - The position in `text` to start looking backward (exclusive).
 * @param skip - An array of strings or regexes. If a character matches any of these, it is skipped.
 * @returns The first non-skipped character before `offset`, or `undefined` if none found.
 */
export function charBefore(
  text: string,
  offset: number,
  skip: Array<string | RegExp> = [/\s/u]
): string | undefined {
  // Helper to check if a char is in the skip set
  function isSkipped(char: string): boolean {
    return skip.some(pattern => {
      if (typeof pattern === 'string') {
        return char === pattern
      }
      return pattern.test(char)
    })
  }

  // Start just before `offset`
  let i = offset - 1
  while (i >= 0) {
    const char = text[i]
    if (!isSkipped(char)) {
      return char
    }
    i--
  }

  return undefined
}

/**
 * Given an array of lines (text already split by '\n') and a character offset
 * (0-based), returns the { line, character } position within that split text.
 * Lines do not contain the newline character at the end.
 *
 * @param lines - The text split by '\n'.
 * @param offset - The 0-based character offset to convert into a line/character position.
 */
export function positionAtOffset(lines: string[], offset: number): TPosition {
  let runningOffset = 0

  for (let i = 0; i < lines.length; i++) {
    // The effective length of this line is line.length + 1 (for the '\n' we split off).
    const lineLengthWithNewline = lines[i].length + 1
    const endOfLine = runningOffset + lineLengthWithNewline

    if (offset < endOfLine) {
      // Offset belongs to this line
      return {
        line: i,
        character: offset - runningOffset,
      }
    }

    runningOffset = endOfLine
  }

  // If offset goes beyond all lines, clamp it to the end of the last line
  const lastLineIndex = Math.max(0, lines.length - 1)
  return {
    line: lastLineIndex,
    character: lines[lastLineIndex]?.length ?? 0,
  }
}

interface TPosition {
  line: number
  character: number
}
interface TRange {
  start: TPosition
  end: TPosition
}

/**
 * Adds or updates an import for `identifier` from `fromPath`.
 * If an existing import statement (possibly multiline) is found, we replace just that import statement
 * (keeping other code intact) and return the precise start/end range of the replaced text.
 * Otherwise, we prepend a new import to the file (range is [0..0]).
 */
export function addImport(
  text: string,
  identifier: string,
  fromPath: string
): { range: TRange; newText: string } {
  // Regex explanation:
  // ^[ \t]*import\s*\{\s*  -> start of line with `import {`
  // ([\s\S]*?)             -> lazy capture of everything inside braces until the matching }
  // \}\s*from\s*(['"])     -> match the closing brace, `from`, then ' or "
  // <fromPath>             -> we escape fromPath
  // \2                     -> reference the same quote captured in (['"])
  // \s*;?[ \t]*(?=\r?\n|$) -> optional semicolon/spaces, then end-of-line or file
  const importRegex = new RegExp(
    `(^[ \\t]*import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*(['"])${escapeReg(
      fromPath
    )}\\3\\s*;?[ \\t]*(?=\\r?\\n|$))`,
    'm'
  )

  const match = importRegex.exec(text)
  if (!match) {
    // Prepend a new import at the top
    return {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      newText: `import { ${identifier} } from '${fromPath}'\n`,
    }
  }

  // match[0] = entire matched import statement
  // match[2] = content inside { }
  const fullImport = match[0]
  const insideBraces = match[2]

  // Calculate the exact character offsets
  const startOffset = match.index
  const endOffset = startOffset + fullImport.length
  const range = offsetToRange(text, startOffset, endOffset)

  // Build the new statement
  const updatedImport = buildImportStatement(fullImport, insideBraces, identifier)

  // Replace in the original text
  const newText = updatedImport

  return { range, newText }
}

function offsetToRange(text: string, startOffset: number, endOffset: number): TRange {
  const t = text.split('\n')

  return { start: positionAtOffset(t, startOffset), end: positionAtOffset(t, endOffset) }
}

/**
 * Inserts `identifier` into the captured import statement, sorts, and converts to multiline if > 3.
 */
function buildImportStatement(fullImport: string, insideBraces: string, newIdent: string): string {
  const existing = insideBraces
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (!existing.includes(newIdent)) {
    existing.push(newIdent)
  }
  existing.sort()

  if (existing.length > 3) {
    // multiline
    const multiline = existing.map(id => `  ${id}`).join(',\n')
    return fullImport.replace(/\{[\s\S]*?\}/u, `{\n${multiline}\n}`)
  }

  // single-line
  return fullImport.replace(/\{[\s\S]*?\}/u, `{ ${existing.join(', ')} }`)
}

function escapeReg(str: string): string {
  return str.replace(/[$()*+.?[\\\]^{|}]/gu, '\\$&')
}
