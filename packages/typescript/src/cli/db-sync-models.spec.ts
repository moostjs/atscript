import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import path from 'path'

import type { TAtscriptConfig } from '@atscript/core'
import { dbPlugin } from '@atscript/db/plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { flattenModels, loadDbModels } from './db-sync-models'

// __DYE_* are compile-time defines — diagnostics rendering reads them at runtime
for (const key of [
  '__DYE_RED__',
  '__DYE_BLUE__',
  '__DYE_CYAN__',
  '__DYE_YELLOW__',
  '__DYE_DIM__',
  '__DYE_RESET__',
  '__DYE_COLOR_OFF__',
]) {
  ;(globalThis as Record<string, unknown>)[key] ??= ''
}

// kept inside the package so generated modules resolve `@atscript/typescript/utils`
const tmpRoot = path.resolve(__dirname, '../../.tmp-tests')
const projects: string[] = []

function makeProject(files: Record<string, string>): string {
  mkdirSync(tmpRoot, { recursive: true })
  const root = mkdtempSync(path.join(tmpRoot, 'db-sync-'))
  projects.push(root)
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

function makeConfig(root: string, extra: Partial<TAtscriptConfig> = {}): TAtscriptConfig {
  return {
    rootDir: root,
    include: ['**/*.as'],
    plugins: [tsPlugin(), dbPlugin()],
    ...extra,
  }
}

function table(name: string, iface: string): string {
  return `@db.table "${name}"\nexport interface ${iface} {\n  @meta.id\n  id: string\n}\n`
}

function ids(types: TAtscriptAnnotatedType[]): string[] {
  return types.map(t => t.id ?? '?').sort()
}

afterAll(() => {
  for (const dir of projects.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('loadDbModels — source tree layout', () => {
  it('loads models that import across directories', async () => {
    const root = makeProject({
      'shared/b.as': table('bees', 'B'),
      'models/a.as': `import { B } from "../shared/b"\n\n@db.table "ays"\nexport interface A {\n  @meta.id\n  id: string\n  b: B\n}\n`,
    })

    const result = await loadDbModels({ config: makeConfig(root), cwd: root })

    expect(result.diagnostics.errors).toBe(0)
    expect(result.failures).toEqual([])
    expect(ids(result.types)).toEqual(['A', 'B'])
  })

  it('keeps two files with the same basename apart', async () => {
    const root = makeProject({
      'models/user.as': table('users', 'UserModel'),
      'admin/user.as': table('admins', 'AdminUser'),
    })

    const result = await loadDbModels({ config: makeConfig(root), cwd: root })

    expect(result.failures).toEqual([])
    expect(ids(result.types)).toEqual(['AdminUser', 'UserModel'])
  })

  it('handles sources that live outside rootDir', async () => {
    const root = makeProject({
      'shared/b.as': table('bees', 'B'),
      'models/a.as': `import { B } from "../shared/b"\n\n@db.table "ays"\nexport interface A {\n  @meta.id\n  id: string\n  b: B\n}\n`,
    })

    const result = await loadDbModels({
      config: makeConfig(root, {
        rootDir: path.join(root, 'models'),
        include: undefined,
        entries: ['a.as', '../shared/b.as'],
      }),
      cwd: root,
    })

    expect(result.diagnostics.errors).toBe(0)
    expect(result.failures).toEqual([])
    expect(ids(result.types)).toEqual(['A', 'B'])
  })
})

describe('loadDbModels — fail fast', () => {
  it('reports a module that cannot be imported instead of a partial inventory', async () => {
    const root = makeProject({
      'shared/b.as': table('bees', 'B'),
      'models/a.as': `import { B } from "../shared/b"\n\n@db.table "ays"\nexport interface A {\n  @meta.id\n  id: string\n  b: B\n}\n`,
      'models/c.as': table('cees', 'C'),
    })

    // only `models/**` is compiled — `shared/b` is never emitted, so `a` cannot load
    const result = await loadDbModels({
      config: makeConfig(root, { include: ['models/**/*.as'] }),
      cwd: root,
    })

    expect(result.diagnostics.errors).toBe(0)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].file).toBe(path.join('models', 'a.as.mjs'))
    // the partial inventory (only C) must never be treated as complete
    expect(ids(result.types)).toEqual(['C'])
  })

  it('reports error diagnostics and skips compilation', async () => {
    const root = makeProject({
      'models/bad.as': `@db.table "bads"\nexport interface Bad {\n  @meta.id\n  id: DoesNotExist\n}\n`,
    })

    const result = await loadDbModels({ config: makeConfig(root), cwd: root })

    expect(result.diagnostics.errors).toBeGreaterThan(0)
    expect(result.diagnostics.messages.length).toBeGreaterThan(0)
    expect(result.types).toEqual([])
    expect(result.failures).toEqual([])
  })

  it('does not leave its temp directory behind', async () => {
    const root = makeProject({ 'models/a.as': table('ays', 'A') })

    await loadDbModels({ config: makeConfig(root), cwd: root })

    expect(readdirSync(root).filter(f => f.startsWith('.atscript-db-sync-'))).toEqual([])
  })
})

describe('loadDbModels — config.models', () => {
  let packaged: TAtscriptAnnotatedType
  let root: string

  beforeAll(async () => {
    const pkgRoot = makeProject({ 'p.as': table('packs', 'Packaged') })
    const pkg = await loadDbModels({ config: makeConfig(pkgRoot), cwd: pkgRoot })
    expect(pkg.failures).toEqual([])
    packaged = pkg.types[0]
    root = makeProject({ 'models/a.as': table('ays', 'A') })
  })

  it('accepts an array', async () => {
    const result = await loadDbModels({
      config: makeConfig(root, { models: () => [packaged] }),
      cwd: root,
    })
    expect(result.packaged).toBe(1)
    expect(ids(result.types)).toEqual(['A', 'Packaged'])
  })

  it('accepts a module namespace object', async () => {
    const namespace = { Packaged: packaged, helper: () => 'not a model' }
    const result = await loadDbModels({
      config: makeConfig(root, { models: () => namespace }),
      cwd: root,
    })
    expect(result.packaged).toBe(1)
    expect(ids(result.types)).toEqual(['A', 'Packaged'])
  })

  it('accepts a promise of a nested combination and deduplicates', async () => {
    const result = await loadDbModels({
      config: makeConfig(root, {
        models: () => Promise.resolve([[packaged], { Packaged: packaged }, packaged]),
      }),
      cwd: root,
    })
    expect(result.packaged).toBe(1)
    expect(ids(result.types)).toEqual(['A', 'Packaged'])
  })

  it('ignores values that are not @db.table / @db.view models', async () => {
    const result = await loadDbModels({
      config: makeConfig(root, { models: () => [{ not: 'a model' }, undefined, 'x', []] }),
      cwd: root,
    })
    expect(result.packaged).toBe(0)
    expect(ids(result.types)).toEqual(['A'])
  })

  it('surfaces a throwing callback instead of planning', async () => {
    const result = await loadDbModels({
      config: makeConfig(root, {
        models: () => {
          throw new Error('models exploded')
        },
      }),
      cwd: root,
    })
    expect(result.modelsError).toBeInstanceOf(Error)
    expect((result.modelsError as Error).message).toBe('models exploded')
  })

  it('is not consulted when a module failed to load', async () => {
    const broken = makeProject({
      'shared/b.as': table('bees', 'B'),
      'models/a.as': `import { B } from "../shared/b"\n\n@db.table "ays"\nexport interface A {\n  @meta.id\n  id: string\n  b: B\n}\n`,
    })
    let called = false
    const result = await loadDbModels({
      config: makeConfig(broken, {
        include: ['models/**/*.as'],
        models: () => {
          called = true
          return []
        },
      }),
      cwd: broken,
    })
    expect(result.failures).toHaveLength(1)
    expect(called).toBe(false)
  })
})

describe('flattenModels', () => {
  it('ignores values that are not db models', () => {
    expect(flattenModels(undefined)).toEqual([])
    expect(flattenModels([null, 'x', 42, () => {}, { a: { b: 'c' } }])).toEqual([])
  })
})
