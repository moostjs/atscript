import path from 'path'
import { pathToFileURL } from 'url'

import { describe, expect, it } from 'vitest'

import { fileUriToPath, getRelPath, pathToFileUri, resolveAtscriptFromPath } from '../utils'

describe('getRelPath', () => {
  it('should handle paths in same directory', () => {
    const result = getRelPath(
      'file:///home/user/project/src/file1.ts',
      'file:///home/user/project/src/file2.ts'
    )
    expect(result).toBe('./file2')
  })

  it('should handle paths in subdirectory', () => {
    const result = getRelPath(
      'file:///home/user/project/src/file1.ts',
      'file:///home/user/project/src/subdir/file2.ts'
    )
    expect(result).toBe('./subdir/file2')
  })

  it('should handle paths in parent directory', () => {
    const result = getRelPath(
      'file:///home/user/project/src/subdir/file1.ts',
      'file:///home/user/project/src/file2.ts'
    )
    expect(result).toBe('../file2')
  })

  it('should handle paths in sibling directories', () => {
    const result = getRelPath(
      'file:///home/user/project/src/dir1/file1.ts',
      'file:///home/user/project/src/dir2/file2.ts'
    )
    expect(result).toBe('../dir2/file2')
  })

  it('should handle paths with different extensions', () => {
    const result = getRelPath(
      'file:///home/user/project/src/file1.tsx',
      'file:///home/user/project/src/file2.js'
    )
    expect(result).toBe('./file2')
  })
})

describe('fileUriToPath', () => {
  it('strips the file:// prefix', () => {
    expect(fileUriToPath('file:///home/user/file.as')).toBe('/home/user/file.as')
  })

  it('percent-decodes URL-encoded characters (LSP clients encode @ and + in paths)', () => {
    // pnpm directory names contain @ and +, which VSCode percent-encodes when
    // echoing URIs back to the LSP. The on-disk path is unencoded.
    expect(
      fileUriToPath(
        'file:///node_modules/.pnpm/%40aooth%2Buser%400.1.3_%40atscript%2Bdb%400.1.80/x.as'
      )
    ).toBe('/node_modules/.pnpm/@aooth+user@0.1.3_@atscript+db@0.1.80/x.as')
  })

  it('returns non-file ids unchanged', () => {
    expect(fileUriToPath('bare:pkg/x.as')).toBe('bare:pkg/x.as')
  })

  it('falls back to the raw slice when decoding fails', () => {
    // `%XY` is not valid percent-encoding; decodeURIComponent throws.
    expect(fileUriToPath('file:///some/path/with%ZZliteral')).toBe('/some/path/with%ZZliteral')
  })
})

/*
 * One id per file, whichever host builds it: a file's `file:` URL as `pathToFileURL` writes it
 * (the editor's client sends its URIs in that form), decoded back to the path on disk.
 */
describe('document ids of files', () => {
  /** Paths whose ids are `file://` and the path, byte for byte (`@` and `+` of pnpm folders too). */
  const ORDINARY = [
    '/home/user/project/src/user.as',
    '/repo/node_modules/.pnpm/@atscript+db@0.1.80/node_modules/@atscript/db/x.as',
    "/a-b/c_d/e.f/h,i/j(1)/k!l/$m/&n/o'p/q=r;s/x.as",
  ]
  /** Paths whose ids are percent-encoded: a space, non-ASCII, `%`, `#`, `?`, `~`, brackets. */
  const ENCODED = [
    '/home/user/my models/user.as',
    '/home/user/модели/user.as',
    '/home/user/données/日本/user.as',
    '/home/user/100%/a#b/c?d/user.as',
    '/home/user/~old/[x]/{y}/user.as',
  ]

  it('an ordinary path: `file://` and the path, byte for byte', () => {
    for (const p of ORDINARY) {
      expect(pathToFileUri(p)).toBe(`file://${p}`)
    }
  })

  it('any path: its file URL, decoded back to the path', () => {
    for (const p of [...ORDINARY, ...ENCODED]) {
      expect(pathToFileUri(p)).toBe(pathToFileURL(p).href)
      expect(fileUriToPath(pathToFileUri(p))).toBe(p)
    }
    expect(pathToFileUri('/home/user/my models/user.as')).toBe(
      'file:///home/user/my%20models/user.as'
    )
  })

  it('an import resolves to the id of the file, in an encoded folder too', () => {
    for (const p of [...ORDINARY, ...ENCODED]) {
      const dir = path.dirname(p)
      const from = pathToFileUri(p)
      expect(resolveAtscriptFromPath('./b', from)).toBe(pathToFileUri(path.join(dir, 'b.as')))
      expect(resolveAtscriptFromPath('../up/b.as', from)).toBe(
        pathToFileUri(path.join(dir, '../up/b.as'))
      )
    }
  })

  it('a relative import path between encoded ids is the decoded path (written into generated code)', () => {
    const a = pathToFileUri('/home/user/my models/a.as')
    expect(getRelPath(a, pathToFileUri('/home/user/модели/b.as'))).toBe('../модели/b')
    expect(getRelPath(a, pathToFileUri('/home/user/my models/sub dir/c.as'))).toBe('./sub dir/c')
  })
})
