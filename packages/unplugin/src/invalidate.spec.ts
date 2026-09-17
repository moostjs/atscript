import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { unpluginFactory } from './index'

type TWatchEvent = 'create' | 'update' | 'delete'

interface TPlugin {
  load: (id: string) => Promise<unknown>
  watchChange: (id: string, change: { event: TWatchEvent }) => void
}

const dirs: string[] = []

const A = 'import { B } from "./b"\n\nexport interface A {\n  id: string\n  b: B\n}\n'
const B = 'import { C } from "./c"\n\nexport interface B {\n  id: string\n  c: C\n}\n'
const C = 'export interface C {\n  id: string\n}\n'

function makeProject(files?: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-invalidate-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files ?? { 'a.as': A, 'b.as': B, 'c.as': C })) {
    writeFileSync(path.join(dir, name), content)
  }
  return dir
}

const makePlugin = (dir: string): TPlugin =>
  unpluginFactory({ root: dir }, {} as never) as unknown as TPlugin

/** Invokes `load` with the minimal build context the hook relies on. */
const runLoad = (plugin: TPlugin, id: string, addWatchFile: (f: string) => void = () => {}) =>
  plugin.load.call({ addWatchFile }, id)

const runWatchChange = (plugin: TPlugin, id: string, event: TWatchEvent) =>
  plugin.watchChange.call({}, id, { event })

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('watchChange invalidation', () => {
  it('re-checks an importer against the new definition of a changed import', async () => {
    const dir = makeProject()
    const plugin = makePlugin(dir)
    const a = path.join(dir, 'a.as')
    const b = path.join(dir, 'b.as')

    await expect(runLoad(plugin, a)).resolves.toBeTruthy()

    // `B` is gone from b.as, but the repo keeps documents cached until they are
    // closed — the importer still resolves against the stale parse.
    writeFileSync(b, 'export interface Bb {\n  id: string\n}\n')
    await expect(runLoad(plugin, a)).resolves.toBeTruthy()

    runWatchChange(plugin, b, 'update')
    await expect(runLoad(plugin, a)).rejects.toThrow('"./b" has no exported member "B"')

    writeFileSync(b, B)
    runWatchChange(plugin, b, 'update')
    await expect(runLoad(plugin, a)).resolves.toBeTruthy()
  })

  it('registers every transitive .as import as a watch file, once', async () => {
    const dir = makeProject()
    const plugin = makePlugin(dir)
    const addWatchFile = vi.fn<(file: string) => void>()

    await runLoad(plugin, path.join(dir, 'a.as'), addWatchFile)

    const watched = addWatchFile.mock.calls.map(([file]) => file)
    expect(watched).toContain(path.join(dir, 'b.as'))
    expect(watched).toContain(path.join(dir, 'c.as'))
    expect(watched).toHaveLength(2)
  })

  it('ignores non-.as ids and changes seen before the first load', () => {
    const dir = makeProject()
    const plugin = makePlugin(dir)

    // No repo yet: nothing has been loaded.
    expect(() => runWatchChange(plugin, path.join(dir, 'a.as'), 'update')).not.toThrow()
    expect(() => runWatchChange(plugin, path.join(dir, 'main.ts'), 'update')).not.toThrow()
  })

  it('reports a deleted import on the next load', async () => {
    const dir = makeProject()
    const plugin = makePlugin(dir)
    const b = path.join(dir, 'b.as')
    const c = path.join(dir, 'c.as')

    await expect(runLoad(plugin, b)).resolves.toBeTruthy()

    rmSync(c)
    runWatchChange(plugin, c, 'delete')
    await expect(runLoad(plugin, b)).rejects.toThrow('"./c" not found')
  })
})
