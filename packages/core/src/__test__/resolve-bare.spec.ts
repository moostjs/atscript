import { mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import {
  isBareSpecifier,
  isBareId,
  parseBareSpecifier,
  resolveBareSpecifier,
  clearResolveBareCache,
} from '../resolve-bare'

describe('isBareSpecifier', () => {
  it('returns false for relative paths', () => {
    expect(isBareSpecifier('./foo')).toBe(false)
    expect(isBareSpecifier('../bar')).toBe(false)
    expect(isBareSpecifier('./deeply/nested/path')).toBe(false)
  })

  it('returns false for absolute paths', () => {
    expect(isBareSpecifier('/foo/bar')).toBe(false)
  })

  it('returns true for unscoped packages', () => {
    expect(isBareSpecifier('my-lib')).toBe(true)
    expect(isBareSpecifier('my-lib/user')).toBe(true)
    expect(isBareSpecifier('my-lib/models/user')).toBe(true)
  })

  it('returns true for scoped packages', () => {
    expect(isBareSpecifier('@org/pkg')).toBe(true)
    expect(isBareSpecifier('@org/pkg/user')).toBe(true)
    expect(isBareSpecifier('@org/pkg/models/user')).toBe(true)
  })
})

describe('isBareId', () => {
  it('returns true for bare: URIs', () => {
    expect(isBareId('bare:my-lib/user.as')).toBe(true)
    expect(isBareId('bare:@org/pkg/user.as')).toBe(true)
  })

  it('returns false for file: URIs', () => {
    expect(isBareId('file:///home/user.as')).toBe(false)
  })
})

describe('parseBareSpecifier', () => {
  it('parses unscoped package without subpath', () => {
    expect(parseBareSpecifier('my-lib')).toEqual({
      packageName: 'my-lib',
      subpath: '.',
    })
  })

  it('parses unscoped package with subpath', () => {
    expect(parseBareSpecifier('my-lib/user')).toEqual({
      packageName: 'my-lib',
      subpath: './user',
    })
  })

  it('parses unscoped package with deep subpath', () => {
    expect(parseBareSpecifier('my-lib/models/user')).toEqual({
      packageName: 'my-lib',
      subpath: './models/user',
    })
  })

  it('parses scoped package without subpath', () => {
    expect(parseBareSpecifier('@org/pkg')).toEqual({
      packageName: '@org/pkg',
      subpath: '.',
    })
  })

  it('parses scoped package with subpath', () => {
    expect(parseBareSpecifier('@org/pkg/user')).toEqual({
      packageName: '@org/pkg',
      subpath: './user',
    })
  })

  it('parses scoped package with deep subpath', () => {
    expect(parseBareSpecifier('@org/pkg/models/user')).toEqual({
      packageName: '@org/pkg',
      subpath: './models/user',
    })
  })

  it('handles bare scope without package name', () => {
    expect(parseBareSpecifier('@org')).toEqual({
      packageName: '@org',
      subpath: '.',
    })
  })
})

describe('resolveBareSpecifier', () => {
  let testDir: string

  beforeAll(async () => {
    clearResolveBareCache()
    testDir = path.join(tmpdir(), `atscript-resolve-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })

    // Create a simple package: test-pkg
    const pkgDir = path.join(testDir, 'node_modules', 'test-pkg')
    await mkdir(pkgDir, { recursive: true })
    await writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        exports: {
          './user.as': {
            atscript: './src/user.as',
            import: './dist/user.as.mjs',
          },
          './task.as': './src/task.as',
        },
      })
    )
    await mkdir(path.join(pkgDir, 'src'), { recursive: true })
    await writeFile(path.join(pkgDir, 'src', 'user.as'), 'export interface User { name: string }')
    await writeFile(path.join(pkgDir, 'src', 'task.as'), 'export interface Task { title: string }')

    // Create a package with wildcard exports: wildcard-pkg
    const wildcardDir = path.join(testDir, 'node_modules', 'wildcard-pkg')
    await mkdir(path.join(wildcardDir, 'types'), { recursive: true })
    await writeFile(
      path.join(wildcardDir, 'package.json'),
      JSON.stringify({
        name: 'wildcard-pkg',
        exports: {
          './*.as': {
            atscript: './types/*.as',
          },
        },
      })
    )
    await writeFile(path.join(wildcardDir, 'types', 'model.as'), 'export interface Model { id: number }')

    // Create a package with no exports (direct file access fallback): simple-pkg
    const simpleDir = path.join(testDir, 'node_modules', 'simple-pkg')
    await mkdir(simpleDir, { recursive: true })
    await writeFile(
      path.join(simpleDir, 'package.json'),
      JSON.stringify({ name: 'simple-pkg' })
    )
    await writeFile(path.join(simpleDir, 'schema.as'), 'export interface Schema { data: string }')

    // Create a scoped package: @my-org/models
    const scopedDir = path.join(testDir, 'node_modules', '@my-org', 'models')
    await mkdir(path.join(scopedDir, 'src'), { recursive: true })
    await writeFile(
      path.join(scopedDir, 'package.json'),
      JSON.stringify({
        name: '@my-org/models',
        exports: {
          './user.as': {
            atscript: './src/user.as',
          },
        },
      })
    )
    await writeFile(path.join(scopedDir, 'src', 'user.as'), 'export interface User { id: number }')

    // Create a source dir (where the importing file lives)
    await mkdir(path.join(testDir, 'src'), { recursive: true })
  })

  afterAll(async () => {
    clearResolveBareCache()
    await rm(testDir, { recursive: true, force: true })
  })

  it('resolves via exports with atscript condition', async () => {
    const result = await resolveBareSpecifier('test-pkg/user', path.join(testDir, 'src'))
    expect(result).toBeTruthy()
    expect(result!.endsWith('/src/user.as')).toBe(true)
  })

  it('resolves via exports with string value (no condition)', async () => {
    clearResolveBareCache()
    const result = await resolveBareSpecifier('test-pkg/task', path.join(testDir, 'src'))
    expect(result).toBeTruthy()
    expect(result!.endsWith('/src/task.as')).toBe(true)
  })

  it('resolves via wildcard exports', async () => {
    clearResolveBareCache()
    const result = await resolveBareSpecifier('wildcard-pkg/model', path.join(testDir, 'src'))
    expect(result).toBeTruthy()
    expect(result!.endsWith('/types/model.as')).toBe(true)
  })

  it('resolves via direct file fallback (no exports)', async () => {
    clearResolveBareCache()
    const result = await resolveBareSpecifier('simple-pkg/schema', path.join(testDir, 'src'))
    expect(result).toBeTruthy()
    expect(result!.endsWith('/schema.as')).toBe(true)
  })

  it('resolves scoped packages', async () => {
    clearResolveBareCache()
    const result = await resolveBareSpecifier('@my-org/models/user', path.join(testDir, 'src'))
    expect(result).toBeTruthy()
    expect(result!.endsWith('/src/user.as')).toBe(true)
  })

  it('returns undefined for non-existent package', async () => {
    clearResolveBareCache()
    const result = await resolveBareSpecifier('non-existent-pkg/foo', path.join(testDir, 'src'))
    expect(result).toBeUndefined()
  })

  it('returns undefined for non-existent subpath in existing package', async () => {
    clearResolveBareCache()
    const result = await resolveBareSpecifier('test-pkg/nonexistent', path.join(testDir, 'src'))
    expect(result).toBeUndefined()
  })

  it('uses cache on repeated calls', async () => {
    clearResolveBareCache()
    const fromDir = path.join(testDir, 'src')
    const result1 = await resolveBareSpecifier('test-pkg/user', fromDir)
    const result2 = await resolveBareSpecifier('test-pkg/user', fromDir)
    expect(result1).toBe(result2)
  })

  it('walks up directories to find node_modules', async () => {
    clearResolveBareCache()
    // Create a nested source dir without its own node_modules
    const nestedDir = path.join(testDir, 'src', 'deep', 'nested')
    await mkdir(nestedDir, { recursive: true })
    const result = await resolveBareSpecifier('test-pkg/user', nestedDir)
    expect(result).toBeTruthy()
    expect(result!.endsWith('/src/user.as')).toBe(true)
  })
})
