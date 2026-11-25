import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import { build } from '../build'

// The warning of a mutating `annotate` block whose target is used by files that do not import
// the block's file: files of the block's own package can import it; files of another package
// (a dependency, a linked workspace package) cannot — they get advice of their own, and are
// named by package instead of by a relative path.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeTree(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'atscript-block-pkg-')))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), content)
  }
  return root
}

const pkg = (name: string) => JSON.stringify({ name })
const T = 'export interface T {\n  a: string\n}\n'
const BLOCK = (from: string) =>
  `import { T } from '${from}'\nannotate T {\n  @meta.label 'r'\n  a\n}\n`
const USES = (name: string, from: string) =>
  `import { T } from '${from}'\nexport interface ${name} {\n  t: T\n}\n`

/** The warnings of `file` after building `entries` of `rootDir`. */
async function warnings(rootDir: string, entries: string[], file: string) {
  const repo = await build({ rootDir, entries })
  const diagnostics = await repo.diagnostics()
  const messages = diagnostics.get(`file://${path.join(rootDir, file)}`) ?? []
  return messages.filter(m => m.severity === 2).map(m => m.message)
}

/** A dependency installed the pnpm way: its files under `.pnpm`, linked from `node_modules`. */
function installLib(root: string, files: Record<string, string>) {
  const real = path.join(root, 'node_modules/.pnpm/lib-a@1.0.0/node_modules/lib-a')
  mkdirSync(real, { recursive: true })
  writeFileSync(path.join(real, 'package.json'), pkg('lib-a'))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(real, name), content)
  }
  symlinkSync(real, path.join(root, 'node_modules/lib-a'), 'dir')
}

const LOCAL = (declared: string, users: string, importFrom: string) =>
  `"T" (declared in ${declared}) is used by ${users} without importing this file (directly or not): this annotate applies only in builds including this file — import it from ${importFrom}`

const OTHER = (declared: string, users: string) =>
  `"T" (declared in ${declared}) is used by files of other packages (${users}), which cannot import this file: their packages' own builds never include this annotate, and at runtime it applies to those files only if this file is loaded before they first use "T" — to change only your own types, annotate a type of your own (interface X extends T, or annotate T as X)`

describe('the warning of a block not reachable from the files using its target', () => {
  it('files of the same package: import the block from them or from the declaring file', async () => {
    const root = makeTree({
      'package.json': pkg('app'),
      't.as': T,
      'p.as': USES('P', './t'),
      'r.as': BLOCK('./t'),
    })
    expect(await warnings(root, ['p.as', 'r.as'], 'r.as')).toEqual([
      LOCAL('./t.as', './p.as', './t.as or from the files using "T"'),
    ])
  })

  it('files of a dependency: named by package, with advice they can follow', async () => {
    const root = makeTree({
      'package.json': pkg('app'),
      'main.as': "import { U } from 'lib-a/u'\nexport interface M {\n  u: U\n}\n",
      'r.as': BLOCK('lib-a/t'),
    })
    installLib(root, { 't.as': T, 'u.as': USES('U', './t') })
    const out = await warnings(root, ['main.as', 'r.as'], 'r.as')
    expect(out).toEqual([OTHER('lib-a/t.as', 'lib-a/u.as')])
    // (never the `.pnpm` chain the file really sits in)
    expect(out[0]).not.toContain('node_modules')
  })

  it('a linked workspace package (not under node_modules) is another package', async () => {
    const root = makeTree({
      'app/package.json': pkg('app'),
      'app/main.as': "import { U } from '../lib/u'\nexport interface M {\n  u: U\n}\n",
      'app/r.as': BLOCK('../lib/t'),
      'lib/package.json': pkg('lib'),
      'lib/t.as': T,
      'lib/u.as': USES('U', './t'),
    })
    expect(await warnings(path.join(root, 'app'), ['main.as', 'r.as'], 'r.as')).toEqual([
      OTHER('lib/t.as', 'lib/u.as'),
    ])
  })

  it("a type of the block's own package used by another package: import from the declaring file", async () => {
    const root = makeTree({
      'lib/package.json': pkg('lib'),
      'lib/t.as': T,
      'lib/r.as': BLOCK('./t'),
      'app/package.json': pkg('app'),
      'app/x.as': USES('X', '../lib/t'),
    })
    expect(await warnings(root, ['lib/r.as', 'app/x.as'], 'lib/r.as')).toEqual([
      LOCAL('./t.as', 'app/x.as', './t.as or from the files using "T"'),
    ])
  })

  it('a block file without a named package.json: files of a named dependency are another package', async () => {
    const root = makeTree({
      'main.as': "import { U } from 'lib-a/u'\nexport interface M {\n  u: U\n}\n",
      'r.as': BLOCK('lib-a/t'),
      'node_modules/lib-a/package.json': pkg('lib-a'),
      'node_modules/lib-a/t.as': T,
      'node_modules/lib-a/u.as': USES('U', './t'),
    })
    expect(await warnings(root, ['main.as', 'r.as'], 'r.as')).toEqual([
      OTHER('lib-a/t.as', 'lib-a/u.as'),
    ])
  })

  it('a nested package.json without a name is not a package of its own', async () => {
    const root = makeTree({
      'package.json': pkg('app'),
      'main.as': "import { U } from 'lib-a/sub/u'\nexport interface M {\n  u: U\n}\n",
      'r.as': BLOCK('lib-a/sub/t'),
      'node_modules/lib-a/package.json': pkg('lib-a'),
      'node_modules/lib-a/sub/package.json': JSON.stringify({ type: 'module' }),
      'node_modules/lib-a/sub/t.as': T,
      'node_modules/lib-a/sub/u.as': USES('U', './t'),
    })
    expect(await warnings(root, ['main.as', 'r.as'], 'r.as')).toEqual([
      OTHER('lib-a/sub/t.as', 'lib-a/sub/u.as'),
    ])
  })

  it('files of both: one warning each, a dependency type imported from its users only', async () => {
    const root = makeTree({
      'package.json': pkg('app'),
      'main.as': "import { U } from 'lib-a/u'\nexport interface M {\n  u: U\n}\n",
      'p.as': USES('P', 'lib-a/t'),
      'r.as': BLOCK('lib-a/t'),
    })
    installLib(root, { 't.as': T, 'u.as': USES('U', './t') })
    expect(await warnings(root, ['main.as', 'p.as', 'r.as'], 'r.as')).toEqual([
      LOCAL('lib-a/t.as', './p.as', 'the files using "T"'),
      OTHER('lib-a/t.as', 'lib-a/u.as'),
    ])
  })
})
