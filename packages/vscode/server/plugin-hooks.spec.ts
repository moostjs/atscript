import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'

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
 * A project with `files` and a config (with `extra` options) whose `spy` plugin counts its hooks'
 * calls.
 */
function project(files: Record<string, string>, extra = ''): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-lsp-hooks-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
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

  it('a config that fails to load: tried once, the built-in config until it changes', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-lsp-hooks-'))
    dirs.push(dir)
    const files = ['a.as', 'b.as', 'c.as']
    for (const f of files) {
      writeFileSync(
        path.join(dir, f),
        `@x.mark\nexport interface ${f[0].toUpperCase()} {\n  id: string\n}\n`
      )
    }
    const config = path.join(dir, 'atscript.config.ts')
    writeFileSync(
      config,
      "if (globalThis) {\n  throw new Error('config failed')\n}\nexport default {}\n"
    )
    const s = server(dir)
    const severities = () => files.map(f => s.sent.get(uriOf(dir, f))?.map((m: any) => m.severity))

    await s.handlers['workspace/files'](files.map(f => uriOf(dir, f)))
    await s.settle()

    // (one load, one report; the unknown annotation is an error with the built-in config)
    expect(errors.mock.calls.filter(c => c[0] === 'Failed to load config')).toEqual([
      ['Failed to load config', config, expect.any(Error)],
    ])
    expect(severities()).toEqual([[1], [1], [1]])

    // (fixed: its plugin makes unknown annotations warnings)
    writeFileSync(
      config,
      "export default {\n  plugins: [{ name: 'lenient', config: () => ({ unknownAnnotation: 'warn' as const }) }],\n}\n"
    )
    await s.repo.onConfigChanged(pathToFileURL(config).toString())
    await s.settle()

    expect(severities()).toEqual([[2], [2], [2]])
    expect(errors.mock.calls.filter(c => c[0] === 'Failed to load config')).toHaveLength(1)
  })
})
