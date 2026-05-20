import { describe, expect, it } from 'vitest'

import { fileUriToPath, getRelPath } from '../utils'

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
