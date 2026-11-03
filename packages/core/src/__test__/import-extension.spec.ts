import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterAll, describe, expect, it } from 'vitest'

import { build } from '../build'
import { resolveAtscriptFromPath } from '../parser/utils'
import { withoutAsExtension } from '../resolve-bare'

/*
 * `.as` imports name a file with or without its `.as` extension: both spellings resolve to the
 * same module (one identity), with the same diagnostics and go-to-definition.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function repoOf(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-import-ext-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({ rootDir: dir, entries: Object.keys(files) })
  return { dir, repo }
}

describe('.as imports with the extension', () => {
  it('strips a trailing .as from relative and bare subpath imports only', () => {
    expect(withoutAsExtension('./user.as')).toBe('./user')
    expect(withoutAsExtension('../models/user.as')).toBe('../models/user')
    expect(withoutAsExtension('./user')).toBe('./user')
    expect(withoutAsExtension('my-lib/models.as')).toBe('my-lib/models')
    expect(withoutAsExtension('@org/lib/models.as')).toBe('@org/lib/models')
    // (a package name, no subpath: kept as written)
    expect(withoutAsExtension('pkg.as')).toBe('pkg.as')
    expect(withoutAsExtension('@org/pkg.as')).toBe('@org/pkg.as')
    expect(withoutAsExtension('./.as')).toBe('./.as')
  })

  it('resolves both spellings to the same module id', () => {
    const id = 'file:///proj/src/main.as'
    expect(resolveAtscriptFromPath('./user.as', id)).toBe('file:///proj/src/user.as')
    expect(resolveAtscriptFromPath('./user', id)).toBe('file:///proj/src/user.as')
    expect(resolveAtscriptFromPath('my-lib/models.as', id)).toBe('bare:my-lib/models.as')
  })

  it('builds with an import written with the extension, one document per file', async () => {
    const { dir, repo } = await repoOf({
      'user.as': 'export interface User { name: string }\nexport type Id = string',
      'a.as': "import { User } from './user.as'\nexport interface A { u: User }",
      'b.as': "import { Id } from './user'\nexport interface B { id: Id }",
    })
    const diagnostics = await repo.diagnostics()
    const messages = [...diagnostics.values()].flat()
    expect(messages.map(m => m.message)).toEqual([])
    const a = repo.getDoc(`file://${path.join(dir, 'a.as')}`)!
    const b = repo.getDoc(`file://${path.join(dir, 'b.as')}`)!
    const userA = [...a.dependenciesMap.values()].find(d => d.id.endsWith('/user.as'))
    const userB = [...b.dependenciesMap.values()].find(d => d.id.endsWith('/user.as'))
    expect(userA).toBeDefined()
    expect(userA).toBe(userB)
  })

  it('goes to the same definition from either spelling', async () => {
    const { dir, repo } = await repoOf({
      'user.as': 'export interface User { name: string }',
      'a.as': "import { User } from './user.as'\nexport interface A { u: User }",
      'b.as': "import { User } from './user'\nexport interface B { u: User }",
    })
    const target = (name: string) => {
      const doc = repo.getDoc(`file://${path.join(dir, name)}`)!
      // (`User` in the prop `u: User`, line 1; the import path, line 0)
      return [doc.getToDefinitionAt(1, 25), doc.getToDefinitionAt(0, 24)].map(defs =>
        defs?.map(d => d.targetUri)
      )
    }
    const fromA = target('a.as')
    const uri = `file://${path.join(dir, 'user.as')}`
    expect(fromA).toEqual([[uri], [uri]])
    expect(target('b.as')).toEqual(fromA)
  })

  it('reports a missing file the same way for both spellings', async () => {
    const { repo } = await repoOf({
      'a.as': "import { X } from './missing.as'\nexport interface A { x: X }",
      'b.as': "import { X } from './missing'\nexport interface B { x: X }",
    })
    const diagnostics = await repo.diagnostics()
    const messages = [...diagnostics.values()].flat().filter(m => m.message.includes('not found'))
    expect(messages.map(m => m.message).sort()).toEqual([
      '"./missing" not found',
      '"./missing.as" not found',
    ])
  })
})
