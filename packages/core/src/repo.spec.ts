import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TAtscriptConfigInput } from './config'
import type { AtscriptDoc } from './document'
import { AtscriptRepo, blockDependencies, blockTargetDocuments } from './repo'

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

describe('AtscriptRepo.openDocument with text', () => {
  it('an empty text is the text: a document emptied is parsed as empty', async () => {
    const root = makeProject({
      't.as': 'export interface T {\n  a: string\n}\n',
      'p.as': "import { T } from './t'\nexport interface P {\n  t: T\n}\n",
    })
    const repo = makeRepo(root)
    const p = await repo.openDocument(uri(root, 'p.as'))
    await repo.checkDoc(p)
    expect(p.getDiagMessages().filter(m => m.severity === 1)).toEqual([])
    const t = await repo.openDocument(uri(root, 't.as'), '')
    expect(t.text).toBe('')
    expect(t.exports.size).toBe(0)
    p.clearMessages()
    await repo.checkDoc(p)
    expect(p.getDiagMessages().map(m => m.message)).toContain(`"./t" has no exported member "T"`)
    // (and a document opened with an empty text is not read from disk)
    const fresh = makeRepo(root)
    const empty = await fresh.openDocument(uri(root, 't.as'), '')
    expect(empty.text).toBe('')
    expect(empty.exports.size).toBe(0)
  })
})

describe('diagnostics read before the imports are wired', () => {
  // Concurrent loads (a bundler) read a document another load is still checking — one an import
  // cycle or a diamond links in before its own imports are wired: what is derived from it then
  // must not outlive the wiring, whichever load reads it first.
  const errors = (doc: AtscriptDoc) =>
    doc
      .getDiagMessages()
      .filter(m => m.severity === 1)
      .map(m => m.message)

  it('are computed again once its imports are wired', async () => {
    const root = makeProject({
      'tenant.as': 'export interface Tenant {\n  id: string\n}\n',
      'department.as':
        "import { Tenant } from './tenant'\nexport interface Department {\n  id: string\n  tenantId: Tenant.id\n}\n",
    })
    const repo = makeRepo(root)
    const department = await repo.openDocument(uri(root, 'department.as'))
    // (read mid-check: its import is not wired yet)
    expect(errors(department)).toEqual(['Unknown member "id"'])
    await repo.checkDoc(department)
    expect(errors(department)).toEqual([])
  })

  it('of a document reading through another one: once that one is wired', async () => {
    const root = makeProject({
      'tenant.as': 'export interface Tenant {\n  id: string\n}\n',
      'task.as':
        "import { Tenant } from './tenant'\nexport interface Task {\n  id: string\n  tenantId: Tenant.id\n}\n",
      'task-dict.as':
        "import { Task } from './task'\nexport interface TaskDict {\n  tenantId: Task.tenantId\n}\n",
    })
    const repo = makeRepo(root)
    const task = await repo.openDocument(uri(root, 'task.as'))
    const dict = await repo.openDocument(uri(root, 'task-dict.as'))
    // (the dict wired to the task; the task's own import not yet)
    dict.updateDependencies([task])
    expect(errors(dict)).not.toEqual([])
    await repo.checkDoc(task)
    expect(errors(dict)).toEqual([])
  })
})

describe('blockTargetDocuments / blockDependencies', () => {
  it('resolve a block through plain aliases, in any file', async () => {
    const root = makeProject({
      'a.as': 'export interface User {\n  name: string\n}\n',
      'e.as': 'export interface Addr {\n  name: string\n}\n',
      'b.as': "import { User } from './a'\nexport type UA = User\n",
      'c.as': "import { UA } from './b'\nannotate UA {\n  @meta.label 'c'\n  name\n}\n",
      'u.as':
        "import { User } from './a'\nimport { X } from './x'\nexport interface U {\n  u: User\n  x: X\n}\n",
      'x.as': 'export interface X {\n  n: string\n}\n',
    })
    const repo = makeRepo(root)
    const docs: Record<string, AtscriptDoc> = {}
    for (const f of ['a.as', 'e.as', 'b.as', 'c.as', 'u.as', 'x.as']) {
      docs[f] = await repo.openDocument(uri(root, f))
      await repo.checkDoc(docs[f])
    }
    const names = (set: Set<AtscriptDoc>) => [...set].map(d => path.basename(d.id)).sort()
    expect(names(blockTargetDocuments(docs['c.as']))).toEqual(['a.as'])
    // (User's module, its users and what they import: whether the block is reachable)
    expect(names(blockDependencies(docs['c.as']))).toEqual(['a.as', 'b.as', 'u.as', 'x.as'])
    expect(names(blockTargetDocuments(docs['b.as']))).toEqual([])
    // the alias retargeted
    const b = await repo.openDocument(
      uri(root, 'b.as'),
      "import { Addr } from './e'\nexport type UA = Addr\n"
    )
    await repo.checkDoc(b)
    expect(names(blockTargetDocuments(docs['c.as']))).toEqual(['e.as'])
  })
})

describe('go to definition in a repo', () => {
  it('the head of a chain goes to the declaration it names, an intersection alias too', async () => {
    const root = makeProject({
      'a.as': `export interface A {
  y?: string
}
export interface B {
  y?: string
}
export type M = A & B
export type N = A
export interface C {
  v?: M.y
  w?: N.y
}
`,
    })
    const repo = makeRepo(root)
    const doc = (await repo.openDocument(uri(root, 'a.as')))!
    const line = (l: number, c: number) => doc.getToDefinitionAt(l, c)?.[0]?.targetRange.start.line
    // (`M` is the alias, not its first member `A`)
    expect([line(9, 7), line(10, 7), line(9, 9)]).toEqual([6, 7, 1])
  })
})
