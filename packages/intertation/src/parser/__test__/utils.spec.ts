import { describe, expect, it } from 'vitest'

import { getRelPath } from '../utils'

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
