import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { AtscriptDoc } from '@atscript/core'
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
  let annotatedFile: string
  const cwd = process.cwd()

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-cv-'))
    process.chdir(dir)
    asFile = path.join(dir, 'model.as')
    writeFileSync(asFile, 'export interface Model {\n  @expect.minLength 2\n  id: string\n}\n')
    annotatedFile = path.join(dir, 'annotated.as')
    writeFileSync(
      annotatedFile,
      '@emit.compiledValidator\nexport interface Annotated {\n  @expect.minLength 2\n  id: string\n}\n'
    )
  })

  afterAll(() => {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })

  /** The module `load` returns for `file` (`ssr`: Vite's load option; `ctx`: plugin context). */
  async function code(
    compileValidators: boolean | 'ssr' | undefined,
    opts: { ssr?: boolean; ctx?: Record<string, unknown>; file?: string } = {}
  ) {
    const plugin = unpluginFactory({ compileValidators }, {} as never)
    const load = plugin.load as (id: string, o?: { ssr?: boolean }) => Promise<{ code: string }>
    const loadOptions = opts.ssr === undefined ? undefined : { ssr: opts.ssr }
    const ctx = { addWatchFile: () => {}, ...opts.ctx }
    return (await load.call(ctx, opts.file ?? asFile, loadOptions)).code
  }

  it('leaves the atscript config in charge when unset', async () => {
    expect(await code(undefined)).not.toContain('$cv(')
  })

  it('true / false force compiled checks on / off', async () => {
    expect(await code(true)).toContain('$cv(Model')
    expect(await code(false)).not.toContain('$cv(')
  })

  it('@emit.compiledValidator compiles unless the override forces interpreted output', async () => {
    const file = annotatedFile
    expect(await code(undefined, { file })).toContain('$cv(Annotated')
    expect(await code(true, { file })).toContain('$cv(Annotated')
    expect(await code('ssr', { file, ssr: true })).toContain('$cv(Annotated')
    expect(await code(false, { file })).not.toContain('$cv(')
    expect(await code('ssr', { file, ssr: false })).not.toContain('$cv(')
  })

  it("'ssr' compiles for Vite server loads only", async () => {
    expect(await code('ssr', { ssr: true })).toContain('$cv(Model')
    expect(await code('ssr', { ssr: false })).not.toContain('$cv(')
    expect(await code('ssr')).not.toContain('$cv(')
    // Vite environment API (`this.environment`)
    const server = { environment: { config: { consumer: 'server' } } }
    const client = { environment: { config: { consumer: 'client' } } }
    expect(await code('ssr', { ctx: server })).toContain('$cv(Model')
    expect(await code('ssr', { ctx: client })).not.toContain('$cv(')
  })
})

describe('moduleSideEffects', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-fx-'))
    // `a` annotates its own `C` and imports `b` without using it; `b` imports `a`: a cycle of
    // the `.as` files only — the generated `a` does not import `b`.
    writeFileSync(
      path.join(dir, 'a.as'),
      "import { B } from './b'\nexport interface C {\n  y: string\n}\nannotate C {\n  @expect.minLength 3\n  y\n}\n"
    )
    writeFileSync(
      path.join(dir, 'b.as'),
      "import { C } from './a'\nexport interface B {\n  c: C\n}\n"
    )
    // `d` annotates `C2` of `c`, which imports `d`: their modules import each other.
    writeFileSync(
      path.join(dir, 'c.as'),
      "import { D } from './d'\nexport interface C2 {\n  d?: D\n  y: string\n}\n"
    )
    writeFileSync(
      path.join(dir, 'd.as'),
      "import { C2 } from './c'\nexport interface D {\n  c?: C2\n}\nannotate C2 {\n  @expect.minLength 3\n  y\n}\n"
    )
    writeFileSync(path.join(dir, 'plain.as'), 'export interface Plain {\n  id: string\n}\n')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const load = async (file: string) => {
    const plugin = unpluginFactory({ root: dir }, {} as never)
    return (await runLoad(plugin, path.join(dir, file))) as {
      code: string
      moduleSideEffects?: boolean
    }
  }

  it('keeps every module of an import cycle with mutating annotates', async () => {
    expect((await load('c.as')).moduleSideEffects).toBeUndefined()
    expect((await load('d.as')).moduleSideEffects).toBeUndefined()
    expect((await load('plain.as')).moduleSideEffects).toBe(false)
  })

  it('a cycle of the .as files only is not one of the modules', async () => {
    const a = await load('a.as')
    // Its annotations apply as it loads (kept for them).
    expect(a.moduleSideEffects).toBeUndefined()
    expect(a.code).not.toContain('./b.as')
    expect(a.code).not.toContain('completeCycleModule')
    expect((await load('b.as')).moduleSideEffects).toBe(false)
  })
})

describe('diagnostics of a module loaded in two formats', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-diag-'))
    writeFileSync(path.join(dir, 't.as'), 'export interface T {\n  a: string\n}\n')
    writeFileSync(
      path.join(dir, 'q.as'),
      "import { T } from './t'\nannotate T {\n  @meta.label 'x'\n  nope1\n}\n" +
        "annotate T {\n  @meta.label 'y'\n  nope2\n}\nexport interface Q {\n  t: T\n}\n"
    )
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reading them leaves the cached messages as they are (no spurious invalidation)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // Each array `getDiagMessages` returned, with its messages as returned.
    const returned: Array<{ messages: Array<{ message: string }>; as: string[] }> = []
    const getDiagMessages = AtscriptDoc.prototype.getDiagMessages
    vi.spyOn(AtscriptDoc.prototype, 'getDiagMessages').mockImplementation(
      function (this: AtscriptDoc) {
        const messages = getDiagMessages.call(this)
        returned.push({ messages, as: messages.map(m => m.message) })
        return messages
      }
    )
    const invalidated: string[] = []
    const server = {
      moduleGraph: {
        getModulesByFile: (file: string) => new Set([{ file }]),
        invalidateModule: (mod: { file: string }) => invalidated.push(path.basename(mod.file)),
      },
    }
    const plugin = unpluginFactory({ root: dir, compileValidators: 'ssr' }, {
      framework: 'vite',
    } as never) as any
    plugin.vite.configResolved({ root: dir })
    plugin.vite.configureServer(server)
    const load = (file: string, consumer: string) =>
      Promise.resolve(
        plugin.load.call(
          { addWatchFile: () => {}, environment: { config: { consumer } } },
          path.join(dir, file)
        )
      ).then(
        (r: { code: string }) => r.code,
        (error: Error) => `error: ${error.message}`
      )
    const errors: string[] = []
    for (const consumer of ['client', 'server']) {
      await load('t.as', consumer)
      errors.push(await load('q.as', consumer))
    }
    // The same first error for either format.
    expect(errors[0]).toMatch(/^error: Unknown property/)
    expect(errors[1]).toBe(errors[0])
    // An edit of t.as leaving q.as's load results the same: q.as is not reported changed (its
    // messages read again for both formats).
    writeFileSync(path.join(dir, 't.as'), 'export interface T {\n  a: string\n  b?: string\n}\n')
    await plugin.watchChange(path.join(dir, 't.as'), { event: 'update' })
    expect(invalidated).not.toContain('q.as')
    expect(returned.length).toBeGreaterThan(2)
    for (const { messages, as } of returned) {
      expect(messages.map(m => m.message)).toEqual(as)
    }
  })
})

// A block's warning lists the documents using its target without importing the block's file:
// derived from documents its module does not import. One of them stops using the target: the
// module is loaded again and warns as a cold start does (H4).
describe('the warning of a block not reachable from the files using its target', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-reach-'))
    writeFileSync(path.join(dir, 't.as'), 'export interface T {\n  a: string\n}\n')
    writeFileSync(
      path.join(dir, 'p.as'),
      "import { T } from './t'\nexport interface P {\n  t: T\n}\n"
    )
    writeFileSync(
      path.join(dir, 'q.as'),
      "import { T } from './t'\nexport interface Q {\n  t: T\n}\n"
    )
    writeFileSync(
      path.join(dir, 'r.as'),
      "import { T } from './t'\nannotate T {\n  @meta.label 'r'\n  a\n}\n"
    )
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('follows the files using the target', async () => {
    const logged: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.join(' '))
    })
    const invalidated: string[] = []
    const server = {
      moduleGraph: {
        getModulesByFile: (file: string) => new Set([{ file }]),
        invalidateModule: (mod: { file: string }) => invalidated.push(path.basename(mod.file)),
      },
    }
    const plugin = unpluginFactory({ root: dir }, { framework: 'vite' } as never) as any
    plugin.vite.configResolved({ root: dir })
    plugin.vite.configureServer(server)
    const load = (file: string) =>
      plugin.load.call({ addWatchFile: () => {} }, path.join(dir, file))
    const warning = () => logged.filter(l => l.includes('without importing this file')).at(-1)
    for (const file of ['t.as', 'p.as', 'q.as', 'r.as']) {
      await load(file)
    }
    expect(warning()).toMatch(/used by \.\/p\.as, \.\/q\.as without/)
    writeFileSync(path.join(dir, 'q.as'), 'export interface Q {\n  w: string\n}\n')
    await plugin.watchChange(path.join(dir, 'q.as'), { event: 'update' })
    expect(invalidated).toContain('r.as')
    await load('r.as')
    expect(warning()).toMatch(/used by \.\/p\.as without/)
    // The last file using it deleted, then created again.
    const pText = readFileSync(path.join(dir, 'p.as'), 'utf8')
    rmSync(path.join(dir, 'p.as'))
    invalidated.length = 0
    logged.length = 0
    await plugin.watchChange(path.join(dir, 'p.as'), { event: 'delete' })
    expect(invalidated).toContain('r.as')
    await load('r.as')
    expect(warning()).toBeUndefined()
    writeFileSync(path.join(dir, 'p.as'), pText)
    invalidated.length = 0
    await plugin.watchChange(path.join(dir, 'p.as'), { event: 'create' })
    expect(invalidated).toContain('r.as')
    await load('r.as')
    expect(warning()).toMatch(/used by \.\/p\.as without/)
  })
})

/** A Vite-like plugin instance on `files` (written to a fresh directory), every file loaded. */
async function devServer(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'unplugin-dev-'))
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const logged: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.join(' '))
  })
  const invalidated: string[] = []
  const server = {
    moduleGraph: {
      getModulesByFile: (file: string) => new Set([{ file }]),
      invalidateModule: (mod: { file: string }) => invalidated.push(path.basename(mod.file)),
    },
  }
  const plugin = unpluginFactory({ root: dir }, { framework: 'vite' } as never) as any
  plugin.vite.configResolved({ root: dir })
  plugin.vite.configureServer(server)
  const load = (file: string) =>
    Promise.resolve(plugin.load.call({ addWatchFile: () => {} }, path.join(dir, file))).then(
      (r: { code: string }) => r.code,
      (error: Error) => `error: ${error.message}`
    )
  for (const file of Object.keys(files).sort()) {
    await load(file)
  }
  /** Writes `text` to `file` (`null`: deletes it) and reports the change: the files invalidated. */
  const change = async (file: string, text: string | null) => {
    const existed = existsSync(path.join(dir, file))
    if (text === null) {
      rmSync(path.join(dir, file))
    } else {
      writeFileSync(path.join(dir, file), text)
    }
    invalidated.length = 0
    logged.length = 0
    const event = text === null ? 'delete' : existed ? 'update' : 'create'
    await plugin.watchChange(path.join(dir, file), { event })
    return [...new Set(invalidated)].sort()
  }
  return { dir, load, change, logged, plugin }
}

describe('hot updates of modules with blocks (MODEL §9 U2)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const T = 'export interface T {\n  a: string\n}\n'
  const Q = (label: string) =>
    `import { T } from './t'\nannotate T {\n  @meta.label '${label}'\n  a\n}\n`
  const R = (b: string) => `export interface R {\n  b: ${b}\n}\n`
  const hot = (plugin: any, dir: string, file: string) => {
    const sent: unknown[] = []
    const modules = plugin.vite.hotUpdate.call(
      {
        environment: {
          moduleGraph: { getModulesByFile: () => new Set(), invalidateModule: () => {} },
          hot: { send: (payload: unknown) => sent.push(payload) },
        },
      },
      { file: path.join(dir, file), modules: [] }
    )
    return { modules, sent }
  }

  it('a change to a module with blocks reloads the page in full, every module fresh', async () => {
    const { dir, change, plugin } = await devServer({
      'q.as': Q('x'),
      'r.as': R('string'),
      't.as': T,
    })
    expect(await change('q.as', Q('y'))).toEqual(['q.as', 'r.as', 't.as'])
    expect(hot(plugin, dir, 'q.as')).toEqual({ modules: [], sent: [{ type: 'full-reload' }] })
    // (its blocks removed: the old writes stay in T's nodes — a full reload too)
    expect(await change('q.as', "import { T } from './t'\n")).toEqual(['q.as', 'r.as', 't.as'])
    expect(hot(plugin, dir, 'q.as').sent).toEqual([{ type: 'full-reload' }])
  })

  it('an ordinary type edit still hot-reloads', async () => {
    const { dir, change, plugin } = await devServer({
      'q.as': Q('x'),
      'r.as': R('string'),
      't.as': T,
    })
    expect(await change('r.as', R('number'))).toEqual([])
    expect(hot(plugin, dir, 'r.as').sent).toEqual([])
    // (the target's module edited: the block's module imports it, both evaluated again)
    await change('t.as', `${T}export interface U {\n  c: string\n}\n`)
    expect(hot(plugin, dir, 't.as').sent).toEqual([])
  })
})

// A block on a plain alias is a block on what it aliases (`annotate UA` with `type UA = User`
// is `annotate User`): the module of the type it annotates — reached through the alias, in any
// file — is evaluated again with the block as it is now, and the warning of a block follows the
// files using that type (review A, round 21).
describe('blocks through plain aliases', () => {
  const dirs: string[] = []
  afterEach(() => {
    vi.restoreAllMocks()
  })
  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  const USER = 'export interface User {\n  name: string\n}\n'
  const ADDR = 'export interface Addr {\n  name: string\n}\n'
  const BLOCK = "import { UA } from './b'\nannotate UA {\n  @meta.label 'c'\n  name\n}\n"

  it("the alias retargeted in its own file: the old and the new target's modules", async () => {
    const s = await devServer({
      'a.as': USER,
      'e.as': ADDR,
      'b.as': "import { User } from './a'\nexport type UA = User\n",
      'c.as': BLOCK,
    })
    dirs.push(s.dir)
    expect(await s.change('b.as', "import { Addr } from './e'\nexport type UA = Addr\n")).toEqual(
      expect.arrayContaining(['a.as', 'c.as', 'e.as'])
    )
    expect(await s.change('b.as', "import { User } from './a'\nexport type UA = User\n")).toEqual(
      expect.arrayContaining(['a.as', 'c.as', 'e.as'])
    )
  })

  it('the alias retargeted to another type of the same module', async () => {
    const s = await devServer({
      'a.as': USER + ADDR,
      'b.as': "import { User } from './a'\nexport type UA = User\n",
      'c.as': BLOCK,
    })
    dirs.push(s.dir)
    expect(await s.change('b.as', "import { Addr } from './a'\nexport type UA = Addr\n")).toEqual(
      expect.arrayContaining(['a.as', 'c.as'])
    )
  })

  it("the block's own file edited: the aliased type's module", async () => {
    const s = await devServer({
      'a.as': USER,
      'b.as': "import { User } from './a'\nexport type UA = User\n",
      'c.as': BLOCK,
    })
    dirs.push(s.dir)
    expect(
      await s.change('c.as', "import { UA } from './b'\nexport interface C {\n  u: UA\n}\n")
    ).toContain('a.as')
    expect(await s.change('c.as', BLOCK)).toContain('a.as')
  })

  it('a block on a local alias of an imported type warns as its users come and go', async () => {
    const s = await devServer({
      'a.as': USER,
      'b.as':
        "import { User } from './a'\nexport type UA = User\nannotate UA {\n  @meta.label 'b'\n  name\n}\n",
      'u.as': 'export interface H {\n  x: string\n}\n',
    })
    dirs.push(s.dir)
    const warning = () => s.logged.filter(l => l.includes('without importing this file')).at(-1)
    expect(
      await s.change('u.as', "import { User } from './a'\nexport interface H {\n  u: User\n}\n")
    ).toContain('b.as')
    await s.load('b.as')
    expect(warning()).toMatch(/"User" \(declared in \.\/a\.as\) is used by \.\/u\.as without/)
    expect(await s.change('u.as', 'export interface H {\n  x: string\n}\n')).toContain('b.as')
    await s.load('b.as')
    expect(warning()).toBeUndefined()
  })
})

// What a module's `load` logs is its diagnostics, errors included: a module whose errors change
// while the one its `load` throws stays is loaded again to log them (stale HMR diagnostics).
describe('the diagnostics a module logs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('are logged again when only errors other than the thrown one change', async () => {
    const s = await devServer({
      't.as': 'export interface T {\n  a: string\n}\n',
      'q.as': "import { T } from './t'\nexport interface Q {\n  x: T.b\n  y: T.zz\n}\n",
    })
    try {
      const before = await s.load('q.as')
      expect(s.logged.join('\n')).toContain('Unknown member "b"')
      expect(
        await s.change('t.as', 'export interface T {\n  a: string\n  b: string\n}\n')
      ).toContain('q.as')
      expect(await s.load('q.as')).toBe(before)
      expect(s.logged.join('\n')).not.toContain('Unknown member "b"')
      expect(s.logged.join('\n')).toContain('Unknown member "zz"')
    } finally {
      rmSync(s.dir, { recursive: true, force: true })
    }
  })
})

// An emptied file is an empty document (review C): what imports from it reports the missing
// exports, and filled again, it is the file again.
describe('a file emptied', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is parsed as empty', async () => {
    const T = 'export interface T {\n  a: string\n}\n'
    const s = await devServer({
      't.as': T,
      'p.as': "import { T } from './t'\nexport interface P {\n  t: T\n}\n",
    })
    try {
      expect(await s.change('t.as', '')).toContain('p.as')
      expect(await s.load('p.as')).toBe('error: "./t" has no exported member "T"')
      expect(await s.load('t.as')).not.toContain('class T')
      expect(await s.change('t.as', T)).toContain('p.as')
      expect(await s.load('p.as')).not.toMatch(/^error/)
    } finally {
      rmSync(s.dir, { recursive: true, force: true })
    }
  })
})
