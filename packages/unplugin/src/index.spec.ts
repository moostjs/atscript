import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { unpluginFactory } from './index'

// Helper: run the unplugin `load` hook regardless of how the object types it.
// `load` registers its `.as` dependencies as watch files, so the context needs
// the `addWatchFile` a real bundler would provide.
async function runLoad(plugin: ReturnType<typeof unpluginFactory>, id: string) {
  const load = plugin.load as (id: string) => Promise<unknown>
  return load.call({ addWatchFile: () => {} }, id)
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

describe('compileValidators override', () => {
  let dir: string
  let asFile: string
  const cwd = process.cwd()

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-cv-'))
    process.chdir(dir)
    asFile = path.join(dir, 'model.as')
    writeFileSync(asFile, 'export interface Model {\n  @expect.minLength 2\n  id: string\n}\n')
  })

  afterAll(() => {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })

  async function code(
    compileValidators: boolean | 'ssr' | undefined,
    loadOptions?: { ssr?: boolean },
    ctx: Record<string, unknown> = {}
  ) {
    const plugin = unpluginFactory({ compileValidators }, {} as never)
    const load = plugin.load as (id: string, o?: { ssr?: boolean }) => Promise<{ code: string }>
    return (await load.call({ addWatchFile: () => {}, ...ctx }, asFile, loadOptions)).code
  }

  it('leaves the atscript config in charge when unset', async () => {
    expect(await code(undefined)).not.toContain('$cv(')
  })

  it('true / false force compiled checks on / off', async () => {
    expect(await code(true)).toContain('$cv(Model')
    expect(await code(false)).not.toContain('$cv(')
  })

  it("'ssr' compiles for Vite server loads only", async () => {
    expect(await code('ssr', { ssr: true })).toContain('$cv(Model')
    expect(await code('ssr', { ssr: false })).not.toContain('$cv(')
    expect(await code('ssr')).not.toContain('$cv(')
    // Vite environment API (`this.environment`)
    const server = { environment: { config: { consumer: 'server' } } }
    const client = { environment: { config: { consumer: 'client' } } }
    expect(await code('ssr', undefined, server)).toContain('$cv(Model')
    expect(await code('ssr', undefined, client)).not.toContain('$cv(')
  })
})
