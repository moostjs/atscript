import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { rolldown } from 'rolldown'
import { afterEach, describe, expect, it, vi } from 'vitest'

import atscript from './adapters/rolldown'
import { unplugin, unpluginFactory } from './index'

/*
 * A plugin of the atscript config that writes `.as` files (and other modules) in `buildStart`:
 * the bundler plugin runs it at the start of every build, and no `.as` module is resolved or
 * read before it finished — also when the bundler resolves modules while its start hook runs,
 * or never starts a build — so a project that has none of the generated files yet builds.
 */

const TS_PLUGIN = path.resolve(__dirname, '../../typescript/src/index.ts')
const UTILS = path.resolve(__dirname, '../../typescript/src/utils.ts')
/** Vite as vitest resolves it (not a dependency of this package). */
const viteEntry = createRequire(
  createRequire(import.meta.url).resolve('vitest/package.json')
).resolve('vite')

/** What the `gen` plugin of a project's config saw. */
interface TCalls {
  config: number
  buildStart: number
  /** The `rootDir` its `config` hook received. */
  configRoot?: string
  /** The `rootDir` its `buildStart` hook received. */
  rootDir?: string
}

/** Shared with the projects' configs (by project directory). */
const shared = globalThis as {
  __atscriptBuildStart?: Record<string, TCalls>
  __atscriptBuildStartGates?: Record<string, Promise<void>>
}

const dirs: string[] = []
const closers: Array<() => Promise<unknown>> = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of closers.splice(0)) {
    await close()
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const ENTRY =
  "import { Gen } from './gen.as'\nimport { model } from './gen.model.ts'\nexport const probe = () => [model, Gen.type.props.has('id')]\n"

interface TProjectOptions {
  /** `buildStart` throws this (the first time only with `once`). */
  fail?: string
  once?: boolean
  /** The config's `rootDir`. */
  rootDir?: string
}

function tmpProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-build-start-'))
  dirs.push(dir)
  return dir
}

/**
 * A project holding only its entry and an atscript config whose `gen` plugin writes `gen.as` and
 * `gen.model.ts` into its `rootDir` in `buildStart` (after the project's gate opened, see
 * `gate`): its directory and the plugin's calls.
 */
function project(options: TProjectOptions = {}): { dir: string; calls: () => TCalls | undefined } {
  const dir = tmpProject()
  writeFileSync(path.join(dir, 'entry.ts'), ENTRY)
  const key = JSON.stringify(dir)
  const fail = options.fail
    ? `if (${options.once ? 'calls.buildStart === 1' : 'true'}) throw new Error(${JSON.stringify(options.fail)})`
    : ''
  writeFileSync(
    path.join(dir, 'atscript.config.mjs'),
    `import { readFileSync, writeFileSync } from 'node:fs'
import ts from ${JSON.stringify(pathToFileURL(TS_PLUGIN).href)}
const calls = ((globalThis.__atscriptBuildStart ??= {})[${key}] = { config: 0, buildStart: 0 })
const write = (file, content) => {
  let old
  try {
    old = readFileSync(file, 'utf8')
  } catch {}
  if (old !== content) writeFileSync(file, content)
}
export default {
  ${options.rootDir ? `rootDir: ${JSON.stringify(options.rootDir)},` : ''}
  plugins: [
    ts(),
    {
      name: 'gen',
      config(config) {
        calls.config++
        calls.configRoot = config.rootDir
      },
      async buildStart(config) {
        calls.buildStart++
        calls.rootDir = config.rootDir
        ${fail}
        await globalThis.__atscriptBuildStartGates?.[${key}]
        write(config.rootDir + '/gen.as', 'export interface Gen {\\n  id: string\\n}\\n')
        write(config.rootDir + '/gen.model.ts', "export const model = 'M'\\n")
      },
    },
  ],
}
`
  )
  return { dir, calls: () => shared.__atscriptBuildStart?.[dir] }
}

/** Holds the `buildStart` of `dir`'s `gen` plugin until the returned function is called. */
function gate(dir: string): () => void {
  let open!: () => void
  ;(shared.__atscriptBuildStartGates ??= {})[dir] = new Promise<void>(resolve => {
    open = resolve
  })
  return open
}

const utils = () => createRequire(import.meta.url).resolve('@atscript/typescript/utils')

/** Bundles `dir/entry.ts` with `plugin` and returns its `probe()`. */
async function bundle(dir: string, plugin: unknown, out = 'dist'): Promise<unknown> {
  const build = await rolldown({
    input: path.join(dir, 'entry.ts'),
    cwd: dir,
    plugins: [plugin as never],
    resolve: { alias: { '@atscript/typescript/utils': utils() } },
  })
  try {
    await build.write({ dir: path.join(dir, out), format: 'es', entryFileNames: 'entry.mjs' })
  } finally {
    await build.close()
  }
  const { probe } = await import(pathToFileURL(path.join(dir, out, 'entry.mjs')).href)
  return probe()
}

/** The plugin's hooks, called the way a bundler calls them. */
interface THooks {
  buildStart: (this: unknown) => Promise<void>
  resolveId: (
    this: unknown,
    id: string,
    importer?: string
  ) => Promise<string | null | undefined> | undefined
  load: (this: unknown, id: string) => Promise<{ code: string }>
}

const hooks = (dir: string) => unpluginFactory({ root: dir }, {} as never) as unknown as THooks
const ctx = { addWatchFile: () => {} }

describe('the config plugins’ buildStart in the bundler plugin', () => {
  it('runs before the bundler resolves the generated .as and .ts modules', async () => {
    const { dir, calls } = project()

    expect(await bundle(dir, atscript({ root: dir }))).toEqual(['M', true])
    expect(calls()).toEqual({ config: 1, buildStart: 1, configRoot: dir, rootDir: dir })
  })

  it('runs at the start of every build of a plugin instance; the config hooks once', async () => {
    const { dir, calls } = project()
    const plugin = atscript({ root: dir })

    expect(await bundle(dir, plugin, 'dist1')).toEqual(['M', true])
    expect(await bundle(dir, plugin, 'dist2')).toEqual(['M', true])
    expect(calls()).toMatchObject({ config: 1, buildStart: 2 })
  })

  it('fails the build when it throws; the next build starts again', async () => {
    const { dir } = project({ fail: 'cannot generate', once: true })
    const plugin = atscript({ root: dir })

    await expect(bundle(dir, plugin, 'dist1')).rejects.toThrow('cannot generate')
    expect(await bundle(dir, plugin, 'dist2')).toEqual(['M', true])
  })

  it('makes .as modules resolved and loaded during the start wait for it', async () => {
    // (webpack resolves the entries while its `make` hook — the start — runs)
    const { dir, calls } = project()
    const open = gate(dir)
    const plugin = hooks(dir)
    const entry = path.join(dir, 'entry.ts')
    const gen = path.join(dir, 'gen.as')

    const starting = plugin.buildStart.call(ctx)
    const resolving = Promise.resolve(plugin.resolveId.call(ctx, './gen.as', entry)).then(id => ({
      id,
      existed: existsSync(gen),
    }))
    const loading = plugin.load.call(ctx, gen)
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    expect(existsSync(gen)).toBe(false)
    open()

    await starting
    expect(await resolving).toEqual({ id: gen, existed: true })
    const loaded = await loading
    expect(loaded.code).toContain('Gen')
    expect(calls()).toMatchObject({ config: 1, buildStart: 1 })
  })

  it('makes other modules resolved during a start wait for it, without starting one', async () => {
    // (webpack resolves a generated `.ts` while its `make` hook — the start — runs)
    const { dir, calls } = project()
    const plugin = hooks(dir)
    const entry = path.join(dir, 'entry.ts')
    const model = path.join(dir, 'gen.model.ts')

    // (no start running: nothing waits, and nothing is started)
    expect(await plugin.resolveId.call(ctx, './gen.model.ts', entry)).toBeUndefined()
    expect(calls()).toBeUndefined()

    const open = gate(dir)
    const starting = plugin.buildStart.call(ctx)
    const resolving = Promise.resolve(plugin.resolveId.call(ctx, './gen.model.ts', entry)).then(
      id => ({ id, existed: existsSync(model) })
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    expect(existsSync(model)).toBe(false)
    open()

    await starting
    expect(await resolving).toEqual({ id: undefined, existed: true })
  })

  it('leaves a failed start to buildStart and load to report: resolveId resolves', async () => {
    const { dir } = project({ fail: 'cannot generate' })
    const plugin = hooks(dir)
    const entry = path.join(dir, 'entry.ts')

    const starting = plugin.buildStart.call(ctx)
    const ids = Promise.all([
      plugin.resolveId.call(ctx, './gen.as', entry),
      plugin.resolveId.call(ctx, './gen.model.ts', entry),
    ])

    await expect(starting).rejects.toThrow('cannot generate')
    expect(await ids).toEqual([path.join(dir, 'gen.as'), undefined])
    await expect(plugin.load.call(ctx, path.join(dir, 'gen.as'))).rejects.toThrow('cannot generate')
  })

  it('is started by the first .as module of a host that starts no build', async () => {
    const { dir, calls } = project()
    const plugin = hooks(dir)

    const loaded = await plugin.load.call(ctx, path.join(dir, 'gen.as'))
    expect(loaded.code).toContain('Gen')
    await plugin.load.call(ctx, path.join(dir, 'gen.as'))
    expect(calls()).toMatchObject({ config: 1, buildStart: 1 })
  })

  it('started by a module and failing: the next module starts it again', async () => {
    const { dir, calls } = project({ fail: 'cannot generate', once: true })
    const plugin = hooks(dir)

    await expect(plugin.load.call(ctx, path.join(dir, 'gen.as'))).rejects.toThrow('cannot generate')
    const loaded = await plugin.load.call(ctx, path.join(dir, 'gen.as'))
    expect(loaded.code).toContain('Gen')
    expect(calls()).toMatchObject({ buildStart: 2 })
  })

  it('hands the hooks the absolute rootDir of a relative one', async () => {
    const { dir, calls } = project({ rootDir: 'src' })
    mkdirSync(path.join(dir, 'src'))

    await hooks(dir).buildStart.call(ctx)

    const src = path.join(dir, 'src')
    expect(calls()).toMatchObject({ configRoot: src, rootDir: src })
    expect(existsSync(path.join(src, 'gen.as'))).toBe(true)
  })

  it('runs before the dev server serves its first module', { timeout: 60_000 }, async () => {
    const vite = (await import(viteEntry)) as typeof import('vite')
    const { dir, calls } = project()
    const server = await vite.createServer({
      root: dir,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      resolve: { alias: { '@atscript/typescript/utils': UTILS } },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      plugins: [unplugin.vite({ root: dir }) as never],
    })
    closers.push(() => server.close())

    // (the first module the server serves imports both generated files)
    const entry = await server.ssrLoadModule('/entry.ts')
    expect(entry.probe()).toEqual(['M', true])
    expect(calls()).toMatchObject({ config: 1, buildStart: 1 })
  })

  it(
    'runs in a Vite server that neither listens nor runs in middleware mode',
    {
      timeout: 60_000,
    },
    async () => {
      // (Vite starts the build of its client environment only when the server listens)
      const vite = (await import(viteEntry)) as typeof import('vite')
      const { dir, calls } = project()
      const server = await vite.createServer({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        resolve: { alias: { '@atscript/typescript/utils': UTILS } },
        server: { hmr: false, ws: false, watch: null },
        plugins: [unplugin.vite({ root: dir }) as never],
      })
      closers.push(() => server.close())

      const entry = await server.ssrLoadModule('/entry.ts')
      expect(entry.probe()).toEqual(['M', true])
      expect(calls()).toMatchObject({ config: 1, buildStart: 1 })
    }
  )
})

describe('the atscript config in the bundler plugin', () => {
  const LATE = 'atscript-late-dependency'

  /** A project without `.as` imports whose `.ts` config imports a package not installed yet. */
  function lateDependency(): string {
    const dir = tmpProject()
    writeFileSync(path.join(dir, 'entry.ts'), 'export const probe = () => 1\n')
    writeFileSync(
      path.join(dir, 'atscript.config.ts'),
      `import level from '${LATE}'\nexport default { unknownAnnotation: level }\n`
    )
    return dir
  }

  /** Installs the package the config of `lateDependency` imports. */
  function install(dir: string) {
    const pkg = path.join(dir, 'node_modules', LATE)
    mkdirSync(pkg, { recursive: true })
    writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: LATE, type: 'module', main: 'index.js' })
    )
    writeFileSync(path.join(pkg, 'index.js'), "export default 'warn'\n")
  }

  it('is loaded when a build starts: a failure stops it, even without .as imports', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dir = lateDependency()

    await expect(bundle(dir, atscript({ root: dir }))).rejects.toThrow(
      'Error happened while loading config.'
    )
  })

  it('is loaded again by the next build after it failed to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dir = lateDependency()
    const plugin = atscript({ root: dir })

    await expect(bundle(dir, plugin, 'dist1')).rejects.toThrow(
      'Error happened while loading config.'
    )
    install(dir)
    expect(await bundle(dir, plugin, 'dist2')).toBe(1)
  })
})
