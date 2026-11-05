import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { unpluginFactory } from './index'

// A bundler loads the `.as` modules of a project concurrently, in any order. A module's
// result must not depend on that order: the documents another load is still checking (an
// import cycle, a diamond) must never leave diagnostics computed against their imports half
// wired.

const TMP = path.resolve(__dirname, '../.tmp-tests')
let root = ''

const files: Record<string, string> = {
  'tenant.as': `export interface Tenant {\n  @meta.id\n  id: string\n  name: string\n}\n`,
  'department.as': `import { Tenant } from './tenant'\nexport interface Department {\n  @meta.id\n  id: string\n  @meta.required\n  tenantId: Tenant.id\n}\n`,
  'project.as': `import { Tenant } from './tenant'\nimport { Department } from './department'\nexport interface Project {\n  @meta.id\n  id: string\n  @meta.required\n  tenantId: Tenant.id\n  departmentId?: Department.id\n}\n`,
  'task.as': `import { Tenant } from './tenant'\nimport { Project } from './project'\nimport { Comment } from './comment'\nimport { Department } from './department'\nexport interface Task {\n  @meta.id\n  id: string\n  @meta.required\n  tenantId: Tenant.id\n  @meta.required\n  projectId: Project.id\n  departmentId?: Department.id\n  comments?: Comment[]\n}\n`,
  'comment.as': `import { Tenant } from './tenant'\nimport { Task } from './task'\nexport interface Comment {\n  @meta.id\n  id: string\n  @meta.required\n  tenantId: Tenant.id\n  @meta.required\n  taskId: Task.id\n  task?: Task\n}\n`,
  'task-dict.as': `import { Task } from './task'\nexport interface TaskDict {\n  id: Task.id\n  tenantId: Task.tenantId\n}\n`,
  'document.as': `import { Tenant } from './tenant'\nimport { Project } from './project'\nexport interface Doc {\n  tenantId: Tenant.id\n  projectId?: Project.id\n}\n`,
  'user.as': `import { Tenant } from './tenant'\nimport { Department } from './department'\nexport interface User {\n  tenantId: Tenant.id\n  departmentId?: Department.id\n}\n`,
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true })
  root = mkdtempSync(path.join(TMP, 'concurrent-loads-'))
  writeFileSync(path.join(root, 'package.json'), '{"name":"concurrent","type":"module"}')
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, name), content)
  }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A deterministic shuffle of `list` (a linear congruential generator seeded by `seed`). */
function shuffled<T>(list: T[], seed: number): T[] {
  let s = seed
  const next = () => {
    s = Math.imul(Math.imul(s, 1_664_525) + 1_013_904_223, 1)
    return (s >>> 8) / 16_777_216
  }
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const newPlugin = () => unpluginFactory({ root, loadCheck: true }, {} as never) as any
const load = (plugin: any, name: string): Promise<{ code: string }> =>
  plugin.load.call({ addWatchFile: () => {} }, path.join(root, name))

/** Loads `names` with a fresh plugin instance, all at once: each module's code or error. */
async function loadAll(names: string[]): Promise<Map<string, string>> {
  const plugin = newPlugin()
  const results = await Promise.allSettled(names.map(name => load(plugin, name)))
  return new Map(
    results.map((r, i) => [
      names[i],
      r.status === 'fulfilled' ? r.value.code : `error: ${(r.reason as Error).message}`,
    ])
  )
}

describe('concurrent loads of an import graph with cycles and diamonds', () => {
  it('give every module the same result, whatever the order', { timeout: 120_000 }, async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const names = Object.keys(files)
    // (one at a time: the reference)
    const expected = new Map<string, string>()
    const plugin = newPlugin()
    for (const name of names) {
      const r = await load(plugin, name)
      expected.set(name, r.code)
    }
    const differ: string[] = []
    for (let seed = 1; seed <= 150; seed++) {
      // (two plugin instances of one process at once: a build's environments)
      const runs = await Promise.all([
        loadAll(shuffled(names, seed)),
        loadAll(shuffled(names, -seed)),
      ])
      for (const got of runs) {
        for (const [name, code] of got) {
          if (code !== expected.get(name)) {
            differ.push(`seed ${seed}: ${name}: ${code.startsWith('error:') ? code : 'other code'}`)
          }
        }
      }
    }
    expect(differ).toEqual([])
  })
})
