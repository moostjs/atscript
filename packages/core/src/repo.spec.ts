import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TAtscriptConfigInput } from './config'
import { AtscriptRepo } from './repo'

const dirs: string[] = []

function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'atscript-repo-'))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, name), content)
  }
  return root
}

function makeRepo(root: string) {
  return new AtscriptRepo(root, { rootDir: root } as TAtscriptConfigInput)
}

const uri = (root: string, name: string) => `file://${path.join(root, name)}`

/** Lets the `.then` that `closeDocument` schedules on the cached promise run. */
const flush = () =>
  new Promise(resolve => {
    setTimeout(resolve, 0)
  })

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('AtscriptRepo.closeDocument', () => {
  it('reports whether something was cached', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    const repo = makeRepo(root)

    expect(repo.closeDocument(uri(root, 'a.as'))).toBe(false)
    await repo.openDocument(uri(root, 'a.as'))
    expect(repo.closeDocument(uri(root, 'a.as'))).toBe(true)
    expect(repo.closeDocument(uri(root, 'a.as'))).toBe(false)
  })

  it('makes the next open without text re-read the file from disk', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    const repo = makeRepo(root)
    const id = uri(root, 'a.as')

    const first = await repo.openDocument(id)
    expect(first.text).toContain('id: string')

    writeFileSync(path.join(root, 'a.as'), 'export interface A { id: number }\n')
    // Still the cached parse: documents live in the cache until closed.
    const cached = await repo.openDocument(id)
    expect(cached.text).toContain('id: string')

    expect(repo.closeDocument(id)).toBe(true)
    const reopened = await repo.openDocument(id)
    expect(reopened).not.toBe(first)
    expect(reopened.text).toContain('id: number')
  })

  it('detaches the closed document from its own dependencies', async () => {
    const root = makeProject({
      'b.as': 'import { C } from "./c"\n\nexport interface B { c: C }\n',
      'c.as': 'export interface C { id: string }\n',
    })
    const repo = makeRepo(root)

    const b = await repo.openDocument(uri(root, 'b.as'))
    await repo.checkDoc(b)
    const c = await repo.openDocument(uri(root, 'c.as'))
    expect(b.dependencies.has(c)).toBe(true)
    expect(c.dependants.has(b)).toBe(true)

    expect(repo.closeDocument(uri(root, 'b.as'))).toBe(true)
    await flush()

    expect(b.dependencies.size).toBe(0)
    expect(b.dependenciesMap.size).toBe(0)
    expect(c.dependants.has(b)).toBe(false)
  })

  it('rewires a dependant to the fresh document on its next check', async () => {
    const root = makeProject({
      'a.as': 'import { B } from "./b"\n\nexport interface A { b: B }\n',
      'b.as': 'export interface B { id: string }\n',
    })
    const repo = makeRepo(root)
    const bId = uri(root, 'b.as')

    const a = await repo.openDocument(uri(root, 'a.as'))
    await repo.checkDoc(a)
    const staleB = await repo.openDocument(bId)
    expect(a.dependencies.has(staleB)).toBe(true)

    expect(repo.closeDocument(bId)).toBe(true)
    await flush()
    // Dependants are untouched by `closeDocument` itself.
    expect(a.dependencies.has(staleB)).toBe(true)
    expect(a.dependenciesMap.get(bId)).toBe(staleB)
    expect(staleB.dependants.has(a)).toBe(true)

    writeFileSync(path.join(root, 'b.as'), 'export interface B { id: number }\n')
    await repo.checkDoc(a)

    const freshB = await repo.openDocument(bId)
    expect(freshB).not.toBe(staleB)
    expect(freshB.text).toContain('id: number')
    expect(a.dependencies.has(staleB)).toBe(false)
    expect(a.dependencies.has(freshB)).toBe(true)
    expect(a.dependenciesMap.get(bId)).toBe(freshB)
    expect(freshB.dependants.has(a)).toBe(true)
    expect(staleB.dependants.has(a)).toBe(false)
  })

  it('does not leave an unhandled rejection behind for a failed open', async () => {
    const root = makeProject({})
    const repo = makeRepo(root)
    const id = uri(root, 'missing.as')
    const onRejection = vi.fn()
    process.on('unhandledRejection', onRejection)
    try {
      // A pending open that ends up rejecting — the same state `openDocument`
      // is in before its own `catch` handler evicts the entry.
      ;(repo as any).atscripts.set(id, Promise.reject(new Error('Document not found')))
      expect(repo.closeDocument(id)).toBe(true)
      await flush()
    } finally {
      process.off('unhandledRejection', onRejection)
    }
    expect(onRejection).not.toHaveBeenCalled()
  })
})
