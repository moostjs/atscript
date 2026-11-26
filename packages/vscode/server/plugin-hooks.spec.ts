import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { FileChangeType } from 'vscode-languageserver/node'

import { VscodeAtscriptRepo } from './repo'

/*
 * The language server and the plugins of a project's `atscript.config.*`: their `config` hooks
 * run once per load of the config file (for all the documents under it), and their `buildStart`
 * hooks never (the editor reads what a build left on disk).
 */

/** What the `spy` plugin of a project's config saw (kept on `globalThis`, by project). */
interface TCalls {
  config: number
  buildStart: number
  render: number
  /** The `rootDir` its `config` hook received. */
  rootDir?: string
}

const callsOf = (dir: string) =>
  (globalThis as { __atscriptLspHooks?: Record<string, TCalls> }).__atscriptLspHooks?.[dir]

const dirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * A temporary project holding `files` (by path, relative to it), its folder named `prefix` and a
 * random suffix: its directory.
 */
function tmpProject(files: Record<string, string>, prefix = 'atscript-lsp-configs-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), content)
  }
  return dir
}

/**
 * A project with `files` and a config (with `extra` options) whose `spy` plugin counts its hooks'
 * calls (its folder named `prefix` and a random suffix).
 */
function project(
  files: Record<string, string>,
  extra = '',
  prefix = 'atscript-lsp-hooks-'
): string {
  const dir = tmpProject(files, prefix)
  writeFileSync(
    path.join(dir, 'atscript.config.mjs'),
    `const calls = ((globalThis.__atscriptLspHooks ??= {})[${JSON.stringify(dir)}] ??= { config: 0, buildStart: 0, render: 0 })
export default {
  ${extra}
  plugins: [
    {
      name: 'spy',
      config(config) {
        calls.config++
        calls.rootDir = config.rootDir
      },
      buildStart() {
        calls.buildStart++
      },
      render() {
        calls.render++
        return []
      },
    },
  ],
}
`
  )
  return dir
}

/** A language server on `dir` with a fake connection (its handlers kept) and editor. */
function server(dir: string) {
  const textDocs = new Map<string, TextDocument>()
  const handlers: Record<string, (...args: any[]) => any> = {}
  const sent = new Map<string, any[]>()
  const connection: any = new Proxy(
    {
      sendDiagnostics: (p: any) => sent.set(p.uri, p.diagnostics),
      onNotification: (m: string, h: any) => {
        handlers[m] = h
      },
      languages: { semanticTokens: { onRange: () => {} } },
    },
    {
      get: (t: any, k: string) =>
        k in t
          ? t[k]
          : (h: unknown) => {
              if (typeof h === 'function') {
                handlers[k] = h as (...args: any[]) => any
              }
            },
    }
  )
  const documents: any = {
    onDidChangeContent: (h: any) => {
      handlers.change = h
    },
    onDidClose: (h: any) => {
      handlers.close = h
    },
    listen: () => {},
    get: (uri: string) => textDocs.get(uri),
  }
  const repo = new VscodeAtscriptRepo(connection, documents)
  ;(repo as any).root = dir
  repo.checksDelay = 1
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 2)
      })
      await repo.currentCheck
      if (
        (repo as any).idle &&
        (repo as any).changeQueue.length === 0 &&
        (repo as any).revalidateQueue.length === 0
      ) {
        break
      }
    }
  }
  return { repo, textDocs, handlers, sent, settle }
}

const uriOf = (dir: string, f: string) => pathToFileURL(path.join(dir, f)).toString()

/** The severities of the diagnostics of `files` (`1` error, `2` warning) as last sent. */
const severities = (s: ReturnType<typeof server>, dir: string, files: string[]) =>
  files.map(f => s.sent.get(uriOf(dir, f))?.map((m: any) => m.severity))

const FILES = {
  'a.as': 'export interface A {\n  id: string\n}\n',
  'b.as': "import { A } from './a'\nexport interface B {\n  a: A\n}\n",
  'c.as': 'export interface C {\n  id: string\n}\n',
}

describe('the config plugins in the language server', () => {
  it('run their config hooks once per load of the config file', async () => {
    const dir = project(FILES)
    const s = server(dir)

    await s.handlers['workspace/files'](Object.keys(FILES).map(f => uriOf(dir, f)))
    await s.settle()

    expect([...s.sent.keys()].sort()).toEqual(Object.keys(FILES).map(f => uriOf(dir, f)))
    expect(callsOf(dir)?.config).toBe(1)

    // (the config file changed: loaded again, its documents checked again)
    s.sent.clear()
    await s.repo.onConfigChanged(uriOf(dir, 'atscript.config.mjs'))
    await s.settle()

    expect(s.sent.size).toBe(Object.keys(FILES).length)
    expect(callsOf(dir)?.config).toBe(2)
  })

  it('never run their buildStart hooks: documents checked, edited and saved', async () => {
    const dir = project(FILES)
    const s = server(dir)
    const a = uriOf(dir, 'a.as')

    await s.handlers['workspace/files'](Object.keys(FILES).map(f => uriOf(dir, f)))
    await s.settle()
    const td = TextDocument.create(a, 'atscript', 1, 'export interface A {\n  id: number\n}\n')
    s.textDocs.set(a, td)
    s.handlers.change({ document: td })
    await s.settle()
    await s.handlers.onDidSaveTextDocument({ textDocument: { uri: a } })

    expect(callsOf(dir)).toMatchObject({ buildStart: 0 })
    // (the save rendered the document)
    expect(callsOf(dir)?.render).toBeGreaterThan(0)
  })

  it('see the absolute rootDir of a relative one', async () => {
    const dir = project({ 'a.as': FILES['a.as'] }, "rootDir: 'src',")
    const s = server(dir)

    await s.handlers['workspace/files']([uriOf(dir, 'a.as')])
    await s.settle()

    expect(callsOf(dir)?.rootDir).toBe(path.join(dir, 'src'))
  })

  it('see the rootDir relative to the config file for a document in a subfolder', async () => {
    for (const [rootDir, expected] of [
      ['src', (dir: string) => path.join(dir, 'src')],
      [undefined, (dir: string) => dir],
    ] as const) {
      const dir = project(
        { 'sub/a.as': FILES['a.as'] },
        rootDir ? `rootDir: ${JSON.stringify(rootDir)},` : ''
      )
      const s = server(dir)

      await s.handlers['workspace/files']([uriOf(dir, 'sub/a.as')])
      await s.settle()

      expect(callsOf(dir)?.rootDir).toBe(expected(dir))
    }
  })

  it('a config that fails to load: tried once, the built-in config until it changes', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const files = ['a.as', 'b.as', 'c.as']
    const dir = tmpProject({
      ...Object.fromEntries(
        files.map(f => [f, `@x.mark\nexport interface ${f[0].toUpperCase()} {\n  id: string\n}\n`])
      ),
      'atscript.config.ts':
        "if (globalThis) {\n  throw new Error('config failed')\n}\nexport default {}\n",
    })
    const config = path.join(dir, 'atscript.config.ts')
    const s = server(dir)

    await s.handlers['workspace/files'](files.map(f => uriOf(dir, f)))
    await s.settle()

    // (one load, one report; the unknown annotation is an error with the built-in config)
    expect(errors.mock.calls.filter(c => c[0] === 'Failed to load config')).toEqual([
      ['Failed to load config', config, expect.any(Error)],
    ])
    expect(severities(s, dir, files)).toEqual([[1], [1], [1]])

    // (fixed: its plugin makes unknown annotations warnings)
    writeFileSync(
      config,
      "export default {\n  plugins: [{ name: 'lenient', config: () => ({ unknownAnnotation: 'warn' as const }) }],\n}\n"
    )
    await s.repo.onConfigChanged(pathToFileURL(config).toString())
    await s.settle()

    expect(severities(s, dir, files)).toEqual([[2], [2], [2]])
    expect(errors.mock.calls.filter(c => c[0] === 'Failed to load config')).toHaveLength(1)
  })
})

/** A document with an annotation no config declares: an error, a warning with `'warn'`. */
const MARKED = '@x.mark\nexport interface M {\n  id: string\n}\n'

/** The source of a config exporting `config` (CommonJS with `cjs`). */
const configSource = (config: string, cjs = false) =>
  `${cjs ? 'module.exports =' : 'export default'} ${config}\n`

/** A config making unknown annotations warnings (CommonJS with `cjs`). */
const lenient = (cjs = false) => configSource("{ unknownAnnotation: 'warn' }", cjs)

/** Writes (or, for `null`, deletes) config `file` and notifies the server. */
async function configFile(
  s: ReturnType<typeof server>,
  file: string,
  content: string | null,
  type: FileChangeType
) {
  if (content === null) {
    unlinkSync(file)
  } else {
    writeFileSync(file, content)
  }
  await s.handlers.onDidChangeWatchedFiles({
    changes: [{ uri: pathToFileURL(file).toString(), type }],
  })
  await s.settle()
}

/*
 * Config files created, deleted or edited while the server runs: the documents under them use
 * the config as it is now, whatever its format.
 */
describe('the config files the language server watches', () => {
  it('a config created nearer an open document: used; deleted: the outer one again', async () => {
    const dir = tmpProject({
      'atscript.config.mjs': 'export default {}\n',
      'a.as': MARKED,
      'sub/b.as': MARKED,
      // (under a nearer config already: neither change concerns it)
      'sub/deep/atscript.config.mjs': "export default { unknownAnnotation: 'allow' }\n",
      'sub/deep/c.as': MARKED,
    })
    const files = ['a.as', 'sub/b.as', 'sub/deep/c.as']
    const s = server(dir)
    const b = uriOf(dir, 'sub/b.as')
    const td = TextDocument.create(b, 'atscript', 1, MARKED)
    s.textDocs.set(b, td)

    await s.handlers['workspace/files'](files.map(f => uriOf(dir, f)))
    await s.settle()
    expect(severities(s, dir, files)).toEqual([[1], [1], []])

    s.sent.clear()
    await configFile(
      s,
      path.join(dir, 'sub/atscript.config.mjs'),
      lenient(),
      FileChangeType.Created
    )
    expect(severities(s, dir, files)).toEqual([undefined, [2], undefined])

    s.sent.clear()
    await configFile(s, path.join(dir, 'sub/atscript.config.mjs'), null, FileChangeType.Deleted)
    expect(severities(s, dir, files)).toEqual([undefined, [1], undefined])
  })

  it('a config created above documents that had none: used', async () => {
    const dir = tmpProject({ 'sub/a.as': MARKED })
    const s = server(dir)

    await s.handlers['workspace/files']([uriOf(dir, 'sub/a.as')])
    await s.settle()
    expect(severities(s, dir, ['sub/a.as'])).toEqual([[1]])

    await configFile(s, path.join(dir, 'atscript.config.js'), lenient(), FileChangeType.Created)
    expect(severities(s, dir, ['sub/a.as'])).toEqual([[2]])
  })

  it('a config created beside the one in use, after it in the search order: nothing re-checked', async () => {
    const dir = tmpProject({ 'atscript.config.js': lenient(), 'a.as': MARKED })
    const s = server(dir)

    await s.handlers['workspace/files']([uriOf(dir, 'a.as')])
    await s.settle()
    expect(severities(s, dir, ['a.as'])).toEqual([[2]])

    s.sent.clear()
    await configFile(
      s,
      path.join(dir, 'atscript.config.ts'),
      configSource('{}'),
      FileChangeType.Created
    )
    expect(s.sent.size).toBe(0)
  })

  it('re-checks the documents importing a document whose config changed', async () => {
    const dir = tmpProject({
      'atscript.config.mjs': 'export default {}\n',
      'b.as': "import { A } from './sub/a'\nexport interface B {\n  a: A\n}\n",
      'sub/a.as': FILES['a.as'],
    })
    const s = server(dir)

    await s.handlers['workspace/files']([uriOf(dir, 'b.as'), uriOf(dir, 'sub/a.as')])
    await s.settle()
    s.sent.clear()

    await configFile(
      s,
      path.join(dir, 'sub/atscript.config.mjs'),
      lenient(),
      FileChangeType.Created
    )

    expect([...s.sent.keys()].sort()).toEqual([uriOf(dir, 'b.as'), uriOf(dir, 'sub/a.as')])
  })

  for (const ext of ['.js', '.mjs', '.cjs', '.ts']) {
    const cjs = ext === '.cjs'
    const name = `atscript.config${ext}`

    it(`an edited ${ext} config: the edit takes effect`, async () => {
      const dir = tmpProject({
        [name]: configSource('{}', cjs),
        'a.as': MARKED,
      })
      const s = server(dir)

      await s.handlers['workspace/files']([uriOf(dir, 'a.as')])
      await s.settle()
      expect(severities(s, dir, ['a.as'])).toEqual([[1]])

      await configFile(s, path.join(dir, name), lenient(cjs), FileChangeType.Changed)
      expect(severities(s, dir, ['a.as'])).toEqual([[2]])

      // (a plugin added)
      await configFile(
        s,
        path.join(dir, name),
        configSource(
          "{\n  plugins: [{ name: 'quiet', config: () => ({ unknownAnnotation: 'allow' }) }],\n}",
          cjs
        ),
        FileChangeType.Changed
      )
      expect(severities(s, dir, ['a.as'])).toEqual([[]])
    })

    it(`a broken ${ext} config fixed: recovers`, async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const dir = tmpProject({ [name]: "throw new Error('config failed')\n", 'a.as': MARKED })
      const s = server(dir)

      await s.handlers['workspace/files']([uriOf(dir, 'a.as')])
      await s.settle()
      // (the built-in config)
      expect(severities(s, dir, ['a.as'])).toEqual([[1]])
      expect(errors.mock.calls.filter(c => c[0] === 'Failed to load config')).toHaveLength(1)

      await configFile(s, path.join(dir, name), lenient(cjs), FileChangeType.Changed)
      expect(severities(s, dir, ['a.as'])).toEqual([[2]])
    })
  }

  it('a config in a folder whose path has a space: found, its rootDir, edits and its deletion', async () => {
    const dir = project(
      { 'a.as': MARKED },
      "rootDir: 'src',\n  unknownAnnotation: 'warn',",
      'atscript lsp space-'
    )
    const config = path.join(dir, 'atscript.config.mjs')
    const s = server(dir)
    const a = uriOf(dir, 'a.as')
    // (the editor's URIs are percent-encoded)
    expect(a).toContain('%20')

    await s.handlers['workspace/files']([a])
    await s.settle()
    expect(callsOf(dir)).toMatchObject({ config: 1, rootDir: path.join(dir, 'src') })
    expect(severities(s, dir, ['a.as'])).toEqual([[2]])

    await configFile(
      s,
      config,
      readFileSync(config, 'utf8').replace("'warn'", "'allow'"),
      FileChangeType.Changed
    )
    expect(callsOf(dir)?.config).toBe(2)
    expect(severities(s, dir, ['a.as'])).toEqual([[]])

    await configFile(s, config, null, FileChangeType.Deleted)
    // (the built-in config)
    expect(severities(s, dir, ['a.as'])).toEqual([[1]])
  })

  it('a document with no config anywhere above it: the built-in config, nothing logged', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dir = tmpProject({ 'sub/a.as': MARKED })
    const s = server(dir)
    // (a root that is not above the document: the walk goes up to the filesystem root)
    ;(s.repo as any).root = path.join(dir, 'elsewhere')

    await s.handlers['workspace/files']([uriOf(dir, 'sub/a.as')])
    await s.settle()

    expect(severities(s, dir, ['sub/a.as'])).toEqual([[1]])
    expect(errors).not.toHaveBeenCalled()
  })

  for (const prefix of ['atscript lsp space-', 'atscript-lsp-модели-']) {
    it(`a folder named "${prefix}…": an import opens the editor's document, one per file`, async () => {
      const dir = project(
        {
          'a.as': "import { B } from './b'\nexport interface A {\n  b: B\n}\n",
          'b.as': 'export interface B {\n  id: string\n}\n',
        },
        '',
        prefix
      )
      const s = server(dir)
      const a = uriOf(dir, 'a.as')
      const b = uriOf(dir, 'b.as')
      expect(b).toMatch(/%/u)
      // (`b.as` open in the editor, under the URI its client sends)
      const td = TextDocument.create(b, 'atscript', 1, 'export interface B {\n  id: string\n}\n')
      s.textDocs.set(b, td)

      await s.handlers['workspace/files']([a, b])
      await s.settle()

      expect([...(s.repo as any).atscripts.keys()].sort()).toEqual([a, b].sort())
      const docA = await s.repo.openDocument(a)
      expect([...docA.dependencies]).toEqual([await s.repo.openDocument(b)])
      expect([...s.sent.keys()].sort()).toEqual([a, b].sort())
      expect(s.sent.get(a)).toEqual([])

      // (an edit of the open `b.as`: `a.as` reads it)
      s.sent.clear()
      const edited = TextDocument.create(b, 'atscript', 2, 'interface B {\n  id: string\n}\n')
      s.textDocs.set(b, edited)
      s.handlers.change({ document: edited })
      await s.settle()

      expect([...s.sent.keys()].sort()).toEqual([a, b].sort())
      expect(s.sent.get(a)?.map((m: any) => m.severity)).toContain(1)
      expect((s.repo as any).atscripts.size).toBe(2)
    })
  }
})
