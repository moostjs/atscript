import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import Module from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { atscriptPluginOptions } from './index'
import { unpluginFactory } from './index'

const RUNTIME_ENTRY = '@atscript/typescript/utils'
// `@atscript/typescript` resolves from the package dir (workspace symlink), not
// from the monorepo root — this is the "resolvable root" for optimizeDeps.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

interface TViteHooks {
  config: (userConfig: {
    root?: string
    optimizeDeps?: { include?: string[] }
  }) => { optimizeDeps?: { include?: string[] } } | undefined
  configResolved: (config: { root: string }) => void
}

interface TPlugin {
  load: (id: string) => Promise<unknown>
  vite: TViteHooks
}

function makePlugin(opts?: atscriptPluginOptions): TPlugin {
  return unpluginFactory(opts, {} as never) as unknown as TPlugin
}

const runLoad = (plugin: TPlugin, id: string) => plugin.load(id)

// Vitest exposes its own node_modules through NODE_PATH, which makes every bare
// specifier resolvable from any directory and hides the "unresolvable root"
// case. Drop it (and recompute Node's global module paths) for the duration of
// the resolvability assertions, so they exercise real lookup from the root.
function withoutGlobalNodePath<T>(fn: () => T): T {
  const internals = Module as unknown as { _initPaths: () => void }
  const saved = process.env.NODE_PATH
  delete process.env.NODE_PATH
  internals._initPaths()
  try {
    return fn()
  } finally {
    if (saved === undefined) {
      delete process.env.NODE_PATH
    } else {
      process.env.NODE_PATH = saved
    }
    internals._initPaths()
  }
}

describe('root resolution', () => {
  // A project dir whose config makes unknown annotations legal. Loading the
  // sample .as succeeds only when that config was actually discovered.
  let projectDir: string
  // A dir with no atscript.config.* and no node_modules.
  let bareDir: string
  let asFile: string

  beforeAll(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-root-'))
    bareDir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-bare-'))
    writeFileSync(
      path.join(projectDir, 'atscript.config.mjs'),
      "export default { unknownAnnotation: 'allow' }\n"
    )
    asFile = path.join(projectDir, 'sample.as')
    writeFileSync(asFile, 'export interface Sample {\n  @custom.flag\n  id: string\n}\n')
  })

  afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(bareDir, { recursive: true, force: true })
  })

  it('discovers the config from an explicit `root` while the cwd is elsewhere', async () => {
    expect(process.cwd()).not.toBe(projectDir)

    const withRoot = makePlugin({ root: projectDir })
    await expect(runLoad(withRoot, asFile)).resolves.toBeTruthy()

    // Control: the very same file is a hard error when the config is out of reach.
    const withoutConfig = makePlugin({ root: bareDir })
    await expect(runLoad(withoutConfig, asFile)).rejects.toThrow(/Unknown annotation/i)
  })

  it('accepts a relative `root` (resolved against the cwd)', async () => {
    const relative = path.relative(process.cwd(), projectDir)
    const plugin = makePlugin({ root: relative })
    await expect(runLoad(plugin, asFile)).resolves.toBeTruthy()
  })

  it("adopts Vite's resolved root for config discovery", async () => {
    const plugin = makePlugin()
    plugin.vite.configResolved({ root: projectDir })
    await expect(runLoad(plugin, asFile)).resolves.toBeTruthy()
  })

  it('does not let Vite override an explicit `root`', async () => {
    const plugin = makePlugin({ root: bareDir })
    plugin.vite.configResolved({ root: projectDir })
    await expect(runLoad(plugin, asFile)).rejects.toThrow(/Unknown annotation/i)
  })

  it('falls back to the cwd when `load` runs before configResolved', async () => {
    // No option, no hook call — the lazy default still resolves, it just finds
    // no config above the cwd, so the unknown annotation stays an error.
    const plugin = makePlugin()
    await expect(runLoad(plugin, asFile)).rejects.toThrow(/Unknown annotation/i)
  })
})

describe('vite optimizeDeps prebundling', () => {
  let bareDir: string

  beforeAll(() => {
    bareDir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-noresolve-'))
  })

  afterAll(() => {
    rmSync(bareDir, { recursive: true, force: true })
  })

  it('includes the runtime entry when it resolves from the option root', () => {
    const plugin = makePlugin({ root: PKG_ROOT })
    const result = withoutGlobalNodePath(() => plugin.vite.config({}))
    expect(result?.optimizeDeps?.include).toContain(RUNTIME_ENTRY)
  })

  it("includes the runtime entry when it resolves from the user config's root", () => {
    // `config` runs before `configResolved`, so the root comes from the user config.
    const plugin = makePlugin()
    const result = withoutGlobalNodePath(() => plugin.vite.config({ root: PKG_ROOT }))
    expect(result?.optimizeDeps?.include).toContain(RUNTIME_ENTRY)
  })

  it('adds nothing when the user already listed the entry', () => {
    const plugin = makePlugin({ root: PKG_ROOT })
    const result = plugin.vite.config({ optimizeDeps: { include: [RUNTIME_ENTRY] } })
    expect(result).toBeUndefined()
  })

  it('adds nothing and does not throw when the entry is unresolvable from the root', () => {
    const plugin = makePlugin({ root: bareDir })
    expect(() => withoutGlobalNodePath(() => plugin.vite.config({}))).not.toThrow()
    expect(withoutGlobalNodePath(() => plugin.vite.config({}))).toBeUndefined()
  })
})
