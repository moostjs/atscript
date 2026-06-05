import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { unpluginFactory } from './index'

// Helper: run the unplugin `load` hook regardless of how the object types it.
async function runLoad(plugin: ReturnType<typeof unpluginFactory>, id: string) {
  const load = plugin.load as (id: string) => Promise<unknown>
  return load.call(plugin, id)
}

describe('unpluginFactory', () => {
  let dir: string
  const cwd = process.cwd()

  beforeAll(() => {
    // A directory whose ancestry contains NO atscript.config.* file.
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-'))
    process.chdir(dir)
  })

  afterAll(() => {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not crash the process when constructed without a config in scope', () => {
    // Regression: the factory used to eagerly probe for a config and create an
    // unhandled promise rejection when none was found, killing the host process.
    const onRejection = vi.fn()
    process.on('unhandledRejection', onRejection)
    try {
      expect(() => unpluginFactory(undefined, {} as never)).not.toThrow()
    } finally {
      process.off('unhandledRejection', onRejection)
    }
    expect(onRejection).not.toHaveBeenCalled()
  })

  it('ignores non-.as files without probing for a config', async () => {
    const plugin = unpluginFactory(undefined, {} as never)
    await expect(runLoad(plugin, '/some/file.ts')).resolves.toBeUndefined()
  })

  it('compiles a .as file with the default ts plugin when no config is found', async () => {
    const asFile = path.join(dir, 'sample.as')
    writeFileSync(asFile, 'export interface Sample {\n  id: string\n}\n')

    const plugin = unpluginFactory(undefined, {} as never)
    const result = (await runLoad(plugin, asFile)) as { code: string; moduleType: string }

    expect(result).toBeTruthy()
    expect(result.moduleType).toBe('js')
    expect(typeof result.code).toBe('string')
    expect(result.code.length).toBeGreaterThan(0)
  })
})
