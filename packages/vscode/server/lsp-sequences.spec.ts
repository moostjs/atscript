import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

import { build } from '@atscript/core'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { TextDocuments } from 'vscode-languageserver/node'

import { tsPlugin } from '../../typescript/src/index'
import { rng } from '../../typescript/src/test-utils'
import { VscodeAtscriptRepo } from './repo'

/*
 * The language server after any sequence of edits, creations and deletions of files importing
 * each other (open in the editor or not) reports the diagnostics a fresh build of the same files
 * reports (errors and warnings, by file, line and message), and answers hovers and completions
 * like a server started on them. The files' variants cover imports of a missing file, unexported
 * types, mutating and `annotate … as` blocks through other files, `extends`, chain references,
 * intersections and import cycles.
 *
 * `ATSCRIPT_LARGE_TESTS=1`: more and longer sequences.
 */

const LARGE = !!process.env.ATSCRIPT_LARGE_TESTS
const SEQUENCES = LARGE ? 80 : 12
const STEPS = LARGE ? 10 : 6

const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]

/** Each file's variants (`null`: deleted). */
const VARIANTS: Record<string, Array<string | null>> = {
  'b.as': [
    'export interface BT {\n  x: string\n  y?: string\n  h?: Hidden\n}\ninterface Hidden {\n  k: string\n}\n',
    'export interface BT {\n  x: string\n  y?: string\n  h?: Hidden\n}\nexport interface Hidden {\n  k: string\n}\n',
    "import { AT } from './a'\nexport interface BT {\n  x: string\n  a?: AT\n}\nannotate AT {\n  @expect.maxLength 6\n  z\n}\n",
    'export type BT = {\n  x: string\n  y?: string\n} | {\n  x: number\n}\n',
    null,
  ],
  'a.as': [
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\n",
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\nannotate BT {\n  @expect.maxLength 4\n  y\n}\n",
    "import { BT } from './b'\nexport interface AT extends BT {\n  z: string\n}\n",
    "import { BT } from './b'\nexport interface AT {\n  z: string\n}\nexport annotate BT as BA {\n  @meta.label 'BA'\n  h.k\n}\n",
    "import { BT } from './b'\nexport interface AT {\n  z: string\n  c?: BT.y\n}\n@meta.label 'L'\n@expect.minLength 2\nannotate AT {}\n",
    null,
  ],
  'c.as': [
    "import { AT } from './a'\nexport interface CT extends AT {\n  c?: string\n}\n",
    'import { AT } from \'./a\'\nexport interface CT {\n  t: AT\n}\nannotate CT {\n  @expect.pattern "a{", "u"\n  t.z\n}\n',
    "import { AT } from './a'\nexport annotate AT as CX {\n  @expect.minLength 3\n  b.x\n}\nexport interface CE extends CX {\n  e?: string\n}\n",
    "import { AT } from './a'\nexport type CI = AT & { z: number }\n",
    "import { BT } from './b'\nimport { AT } from './a'\nexport type CB = BT.x | AT.z\n",
  ],
}
const FILES = Object.keys(VARIANTS)

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) {
    rmSync(d, { recursive: true, force: true })
  }
})

function norm(msgs: Array<{ severity?: number; range: any; message: string }>) {
  return msgs
    .filter(m => m.severity === 1 || m.severity === 2)
    .map(m => `${m.severity}:${m.range.start.line}:${m.message}`)
    .sort()
}

/** The diagnostics of a fresh build of the existing files. */
async function fresh(dir: string, state: Record<string, string | null>) {
  const entries = FILES.filter(f => state[f] !== null)
  const repo = await build({ rootDir: dir, entries, plugins: [tsPlugin()] })
  const out: Record<string, string[]> = {}
  const diags = await repo.diagnostics()
  for (const f of entries) {
    out[f] = norm(diags.get(pathToFileURL(path.join(dir, f)).toString()) ?? [])
  }
  return out
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
  ;(repo as any).sharedConfig = { rootDir: dir, plugins: [tsPlugin()] }
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

/** Hovers and completions at every identifier of the open files. */
async function answers(s: ReturnType<typeof server>, dir: string, open: string[]) {
  const out: Record<string, unknown> = {}
  for (const f of open) {
    const uri = uriOf(dir, f)
    const td = s.textDocs.get(uri)!
    const text = td.getText()
    for (const m of text.matchAll(/[A-Za-z]\w*/g)) {
      const position = td.positionAt(m.index! + 1)
      const at = `${f}:${position.line}:${position.character}`
      // (a request that throws answers its error)
      const ask = (handler: string) =>
        Promise.resolve()
          .then(() => s.handlers[handler]({ textDocument: { uri }, position }))
          .catch((error: Error) => ({ error: error.message.replace(dir, '<dir>') }))
      const hover = await ask('onHover')
      const completion = await ask('onCompletion')
      out[at] = {
        hover: hover?.error ?? hover?.contents,
        completion:
          completion?.error ??
          (Array.isArray(completion)
            ? completion.map((c: any) => c.label).sort()
            : completion?.items?.map((c: any) => c.label).sort()),
      }
    }
  }
  return out
}

describe('language server diagnostics under edit sequences', () => {
  for (let seq = 0; seq < SEQUENCES; seq++) {
    it(`sequence ${seq}`, { timeout: 300_000 }, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const r = rng(seq * 104_729 + 7)
      const dir = mkdtempSync(path.join(tmpdir(), 'atscript-lsp-seq-'))
      dirs.push(dir)
      const s = server(dir)
      const uri = (f: string) => uriOf(dir, f)
      let version = 0
      const state: Record<string, string | null> = {}
      /** Whether a file is open in the editor (else only on disk). */
      const open = new Set<string>()
      const apply = (f: string, content: string | null, inEditor: boolean) => {
        state[f] = content
        if (content === null) {
          if (existsSync(path.join(dir, f))) {
            unlinkSync(path.join(dir, f))
          }
          s.textDocs.delete(uri(f))
          open.delete(f)
        } else {
          writeFileSync(path.join(dir, f), content)
          if (inEditor) {
            s.textDocs.set(uri(f), TextDocument.create(uri(f), 'atscript', ++version, content))
            open.add(f)
          } else {
            s.textDocs.delete(uri(f))
            open.delete(f)
          }
        }
      }
      for (const f of FILES) {
        apply(
          f,
          pick(
            r,
            VARIANTS[f].filter(v => v !== null)
          ) as string,
          r() < 0.5
        )
      }
      await s.handlers['workspace/files'](FILES.map(uri))
      await s.settle()
      const mismatches: string[] = []
      const history: string[] = []
      const compare = async (step: number) => {
        const expected = await fresh(dir, state)
        for (const f of FILES) {
          if (state[f] === null) {
            continue
          }
          // (a file not open is reported once checked: every file is, the workspace's)
          const got = norm(s.sent.get(uri(f)) ?? [])
          if (JSON.stringify(got) !== JSON.stringify(expected[f])) {
            mismatches.push(
              `step ${step} [${history.join(' ')}] ${f}: lsp ${JSON.stringify(got)} build ${JSON.stringify(expected[f])}`
            )
          }
        }
      }
      history.push(
        FILES.map(f => `${f}=${VARIANTS[f].indexOf(state[f])}${open.has(f) ? 'o' : ''}`).join(',')
      )
      await compare(0)
      for (let k = 1; k <= STEPS; k++) {
        const f = pick(r, FILES)
        const v = pick(r, VARIANTS[f])
        const existed = state[f] !== null && state[f] !== undefined
        const wasOpen = open.has(f)
        const inEditor = v !== null && (wasOpen ? r() < 0.8 : r() < 0.4)
        apply(f, v, inEditor)
        history.push(`${f}=${VARIANTS[f].indexOf(v)}${inEditor ? 'o' : ''}`)
        if (v === null) {
          await s.handlers.onDidChangeWatchedFiles({ changes: [{ uri: uri(f), type: 3 }] })
        } else if (inEditor) {
          if (!existed) {
            await s.handlers.onDidChangeWatchedFiles({ changes: [{ uri: uri(f), type: 1 }] })
          }
          s.handlers.change({ document: s.textDocs.get(uri(f)) })
        } else {
          // (changed on disk: a closed file, or one the editor closed — the server reads it from
          // disk from now on)
          if (wasOpen) {
            s.handlers.close({ document: { uri: uri(f) } })
          }
          await s.handlers.onDidChangeWatchedFiles({
            changes: [{ uri: uri(f), type: existed ? 2 : 1 }],
          })
        }
        await s.settle()
        await compare(k)
      }
      // Hovers and completions: like a server started on the final files.
      const opened = [...open]
      if (opened.length > 0 && mismatches.length === 0) {
        const started = server(dir)
        for (const f of opened) {
          started.textDocs.set(uri(f), s.textDocs.get(uri(f))!)
        }
        await started.handlers['workspace/files'](FILES.filter(f => state[f] !== null).map(uri))
        await started.settle()
        const got = await answers(s, dir, opened)
        const want = await answers(started, dir, opened)
        expect([history.join(' '), got]).toEqual([history.join(' '), want])
      }
      expect(mismatches).toEqual([])
    })
  }
})

/**
 * A language server whose documents are the editor's (`TextDocuments`, fed through the
 * connection's notifications like the extension's server): `open`, `edit` and `close` send them.
 */
function editorServer(dir: string) {
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
  const documents = new TextDocuments(TextDocument)
  const repo = new VscodeAtscriptRepo(connection, documents)
  ;(repo as any).sharedConfig = { rootDir: dir, plugins: [tsPlugin()] }
  ;(repo as any).root = dir
  repo.checksDelay = 1
  const uri = (f: string) => uriOf(dir, f)
  const versions = new Map<string, number>()
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
  const open = async (f: string, text: string) => {
    versions.set(f, 1)
    handlers.onDidOpenTextDocument({
      textDocument: { uri: uri(f), languageId: 'atscript', version: 1, text },
    })
    await settle()
  }
  /** An edit in the editor, not saved. */
  const edit = async (f: string, text: string) => {
    const version = versions.get(f)! + 1
    versions.set(f, version)
    handlers.onDidChangeTextDocument({
      textDocument: { uri: uri(f), version },
      contentChanges: [{ text }],
    })
    await settle()
  }
  const close = async (f: string) => {
    handlers.onDidCloseTextDocument({ textDocument: { uri: uri(f) } })
    await settle()
  }
  /** Its diagnostics against a fresh build of the files on disk (`entries`). */
  const mismatches = async (entries: string[]) => {
    const r = await build({ rootDir: dir, entries, plugins: [tsPlugin()] })
    const diags = await r.diagnostics()
    return entries.flatMap(f => {
      const got = norm(sent.get(uri(f)) ?? [])
      const want = norm(diags.get(uri(f)) ?? [])
      return JSON.stringify(got) === JSON.stringify(want)
        ? []
        : [`${f}: lsp ${JSON.stringify(got)} build ${JSON.stringify(want)}`]
    })
  }
  return { repo, handlers, sent, settle, uri, open, edit, close, mismatches }
}

describe('language server: a document closed in the editor', () => {
  const B = 'export interface BT {\n  x: string\n}\n'
  const B2 = 'export interface BT {\n  y: string\n}\n'
  const A = "import { BT } from './b'\nexport interface AT {\n  c?: BT.x\n}\n"
  const setup = async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-lsp-close-'))
    dirs.push(dir)
    writeFileSync(path.join(dir, 'b.as'), B)
    writeFileSync(path.join(dir, 'a.as'), A)
    const s = editorServer(dir)
    await s.open('a.as', A)
    await s.open('b.as', B)
    await s.handlers['workspace/files']([s.uri('a.as'), s.uri('b.as')])
    await s.settle()
    expect(await s.mismatches(['a.as', 'b.as'])).toEqual([])
    return { dir, s }
  }

  it('with unsaved edits: they are discarded, the documents importing it read the disk', async () => {
    const { dir, s } = await setup()
    await s.edit('b.as', B2)
    // (the editor shows the unsaved text)
    expect(norm(s.sent.get(s.uri('a.as'))!)).toEqual(['1:2:Unknown member "x"'])
    await s.close('b.as')
    expect(await s.mismatches(['a.as', 'b.as'])).toEqual([])
    // the still open importer keeps checking against the disk
    const A2 = `${A}export interface Other {\n  o: BT\n}\n`
    writeFileSync(path.join(dir, 'a.as'), A2)
    await s.edit('a.as', A2)
    expect(await s.mismatches(['a.as', 'b.as'])).toEqual([])
    expect(norm(s.sent.get(s.uri('a.as'))!)).toEqual([])
  })

  it('deleted on disk while open: dropped, its importer reports the missing file', async () => {
    const { dir, s } = await setup()
    await s.edit('b.as', B2)
    unlinkSync(path.join(dir, 'b.as'))
    await s.handlers.onDidChangeWatchedFiles({ changes: [{ uri: s.uri('b.as'), type: 3 }] })
    await s.settle()
    await s.close('b.as')
    expect((s.repo as any).atscripts.has(s.uri('b.as'))).toBe(false)
    expect(s.sent.get(s.uri('b.as'))).toEqual([])
    expect(await s.mismatches(['a.as'])).toEqual([])
    expect(norm(s.sent.get(s.uri('a.as'))!).join('\n')).toContain('not found')
  })

  it('without unsaved edits: kept as parsed', async () => {
    const { s } = await setup()
    const before = (s.repo as any).atscripts.get(s.uri('b.as'))
    await s.close('b.as')
    expect((s.repo as any).atscripts.get(s.uri('b.as'))).toBe(before)
    expect(await s.mismatches(['a.as', 'b.as'])).toEqual([])
  })
})

// Whether a block is reachable depends on the documents using its target — reached through plain
// aliases in any file — and on what they import: a change of one of them (its text, or its
// imports, before or after) checks the block's document again (review A and B, round 21).
describe('language server: the warning of a block not reachable from the files using its target', () => {
  const USER = 'export interface User {\n  name: string\n}\n'
  const D0 = 'export interface D {\n  x: string\n}\n'
  const D1 = "import { User } from './a'\nexport interface D {\n  u: User\n}\n"
  const setup = async (files: Record<string, string>) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-lsp-reach-'))
    dirs.push(dir)
    for (const [f, text] of Object.entries(files)) {
      writeFileSync(path.join(dir, f), text)
    }
    const s = editorServer(dir)
    await s.open('d.as', files['d.as'])
    await s.handlers['workspace/files'](Object.keys(files).map(f => s.uri(f)))
    await s.settle()
    const entries = Object.keys(files)
    expect(await s.mismatches(entries)).toEqual([])
    /** `d.as` edited in the editor (and saved): the diagnostics against a build. */
    const editD = async (text: string) => {
      writeFileSync(path.join(dir, 'd.as'), text)
      await s.edit('d.as', text)
      return s.mismatches(entries)
    }
    const warning = (f: string) =>
      norm(s.sent.get(s.uri(f)) ?? []).find(m => m.includes('without importing this file'))
    return { dir, s, editD, warning }
  }

  it('a block through a plain alias of another file: a user appears and goes', async () => {
    const { editD, warning } = await setup({
      'a.as': USER,
      'b.as': "import { User } from './a'\nexport type UA = User\n",
      'c.as': "import { UA } from './b'\nannotate UA {\n  @meta.label 'c'\n  name\n}\n",
      'd.as': D0,
    })
    expect(await editD(D1)).toEqual([])
    expect(warning('c.as')).toContain('is used by ./b.as, ./d.as without')
    expect(await editD(D0)).toEqual([])
    expect(warning('c.as')).toContain('is used by ./b.as without')
  })

  it('a user stops importing the target', async () => {
    const { editD, warning } = await setup({
      'a.as': USER,
      'c.as': "import { User } from './a'\nannotate User {\n  @meta.label 'c'\n  name\n}\n",
      'd.as': D0,
    })
    expect(await editD(D1)).toEqual([])
    expect(warning('c.as')).toContain('is used by ./d.as without')
    expect(await editD(D0)).toEqual([])
    expect(warning('c.as')).toBeUndefined()
  })

  it("a file a user imports starts importing the block's file", async () => {
    const X0 = 'export interface X {\n  n: string\n}\n'
    const X1 = "import { Y } from './y'\nexport interface X {\n  y: Y\n}\n"
    const { dir, s, warning } = await setup({
      'a.as': USER,
      'c.as':
        "import { User } from './a'\nexport interface CX {\n  n: string\n}\nannotate User {\n  @meta.label 'c'\n  name\n}\n",
      'y.as': "import { CX } from './c'\nexport interface Y {\n  c: CX\n}\n",
      'x.as': X0,
      'd.as':
        "import { User } from './a'\nimport { X } from './x'\nexport interface D {\n  u: User\n  x: X\n}\n",
    })
    const entries = ['a.as', 'c.as', 'y.as', 'x.as', 'd.as']
    expect(warning('c.as')).toContain('is used by ./d.as without')
    // (edited in the editor: the same document, its imports changed)
    await s.open('x.as', X0)
    writeFileSync(path.join(dir, 'x.as'), X1)
    await s.edit('x.as', X1)
    expect(await s.mismatches(entries)).toEqual([])
    expect(warning('c.as')).toBeUndefined()
    writeFileSync(path.join(dir, 'x.as'), X0)
    await s.edit('x.as', X0)
    expect(await s.mismatches(entries)).toEqual([])
    expect(warning('c.as')).toContain('is used by ./d.as without')
  })

  it('a user loaded later, through the imports of another opened file (LSP-UW)', async () => {
    const files = {
      'a.as': 'export interface A {\n  x?: string\n}\n',
      'h.as': "import { A } from './a'\nexport interface M {\n  a?: A\n}\n",
      'k.as': "import { A } from './a'\nannotate A {\n  @meta.label 'kA'\n  x\n}\n",
      'c.as': "import { M } from './h'\nexport interface K {\n  m?: M\n}\n",
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-lsp-uw-'))
    dirs.push(dir)
    for (const [f, text] of Object.entries(files)) {
      writeFileSync(path.join(dir, f), text)
    }
    const s = editorServer(dir)
    // (k checked while a has no other user; opening c loads h, a user of A not importing k)
    await s.open('k.as', files['k.as'])
    await s.open('c.as', files['c.as'])
    await s.settle()
    const warning = norm(s.sent.get(s.uri('k.as')) ?? []).find(m =>
      m.includes('without importing this file')
    )
    expect(warning).toContain('is used by ./h.as without')
    expect(await s.mismatches(Object.keys(files))).toEqual([])
  })
})
