import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

import { build, fileUriToPath } from '@atscript/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import { getConfig } from './config'

/*
 * The config of an `asc` run from a subfolder of the config file's folder: its `rootDir` is
 * relative to the config file (a missing one is the file's folder), as in the editor and the
 * bundler plugin — not to the working directory.
 */

const dirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const logger = { log: () => {}, error: () => {} }

/** A new temporary directory, named `prefix` and a random suffix (removed after the test). */
function tmpDir(prefix = 'atscript-cli-config-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

/**
 * A project with `src/a.as` and `sub/b.as`, its config (`rootDir` when given) in its folder,
 * `asc` run from `sub`: the project's folder.
 */
function project(rootDir?: string): string {
  const dir = tmpDir()
  mkdirSync(path.join(dir, 'src'))
  mkdirSync(path.join(dir, 'sub'))
  writeFileSync(path.join(dir, 'src', 'a.as'), 'export interface A {\n  id: string\n}\n')
  writeFileSync(path.join(dir, 'sub', 'b.as'), 'export interface B {\n  id: string\n}\n')
  writeFileSync(
    path.join(dir, 'atscript.config.mjs'),
    `export default ${JSON.stringify(rootDir ? { rootDir } : {})}\n`
  )
  vi.spyOn(process, 'cwd').mockReturnValue(path.join(dir, 'sub'))
  return dir
}

/** The `.as` files `build()` of `config` compiles, relative to `dir`. */
async function built(dir: string, config: Parameters<typeof build>[0]): Promise<string[]> {
  const repo = await build(config)
  const diagnostics = await repo.diagnostics()
  return [...diagnostics.keys()].map(id => path.relative(dir, fileUriToPath(id))).sort()
}

describe('asc run from a subfolder of the config file’s folder', () => {
  it('a relative rootDir: relative to the config file', async () => {
    const dir = project('src')

    const config = await getConfig(undefined, logger)

    expect(config.rootDir).toBe(path.join(dir, 'src'))
    expect(await built(dir, config)).toEqual([path.join('src', 'a.as')])
  })

  it('a missing rootDir: the config file’s folder', async () => {
    const dir = project()

    const config = await getConfig(undefined, logger)

    expect(config.rootDir).toBe(dir)
    expect(await built(dir, config)).toEqual([path.join('src', 'a.as'), path.join('sub', 'b.as')])
  })

  it('a config given with -c: relative to the file, the path relative or absolute', async () => {
    const dir = project('src')

    const src = path.join(dir, 'src')
    await expect(getConfig('../atscript.config.mjs', logger)).resolves.toMatchObject({
      rootDir: src,
    })
    await expect(getConfig(path.join(dir, 'atscript.config.mjs'), logger)).resolves.toMatchObject({
      rootDir: src,
    })
  })

  it('no config file: the working directory', async () => {
    const dir = tmpDir()
    writeFileSync(path.join(dir, 'b.as'), 'export interface B {\n  id: string\n}\n')
    vi.spyOn(process, 'cwd').mockReturnValue(dir)

    const config = await getConfig(undefined, logger)

    expect(config.rootDir).toBeUndefined()
    expect(await built(dir, config)).toEqual(['b.as'])
  })
})

describe('asc in a folder whose path is percent-encoded in a file URL', () => {
  // (a `%` or `#` in the folder: see the next test — vitest's module runner does not import a
  // config file from such a folder, plain Node does)
  for (const name of ['atscript cli space-', 'atscript-cli-модели-']) {
    it(`${name}: one document per file, outputs beside the sources`, async () => {
      const dir = tmpDir(name)
      writeFileSync(path.join(dir, 'atscript.config.mjs'), 'export default {}\n')
      writeFileSync(
        path.join(dir, 'a.as'),
        "import { B } from './b'\nexport interface A {\n  b: B\n}\n"
      )
      writeFileSync(path.join(dir, 'b.as'), 'export interface B {\n  id: string\n}\n')
      vi.spyOn(process, 'cwd').mockReturnValue(dir)
      const config = await getConfig(undefined, logger)
      config.plugins = [tsPlugin()]

      const repo = await build(config)
      const diagnostics = await repo.diagnostics()
      const out = await repo.write({ format: 'js' })

      // (the entry `a.as` and the import of `./b` from it: the same id, one document each)
      expect([...diagnostics.keys()].sort()).toEqual(
        ['a.as', 'b.as'].map(f => pathToFileURL(path.join(dir, f)).href).sort()
      )
      expect([...diagnostics.values()].flat()).toEqual([])
      expect(out.map(o => o.target).sort()).toEqual(
        [path.join(dir, 'a.as.js'), path.join(dir, 'b.as.js')].sort()
      )
      expect(existsSync(path.join(dir, 'a.as.js'))).toBe(true)
      expect(readFileSync(path.join(dir, 'a.as.js'), 'utf8')).toContain('from "./b.as"')
    })
  }

  it('a `%` and a `#` in the folder (build() without a config file): one document per file', async () => {
    const dir = tmpDir('atscript-cli-100%-#-')
    writeFileSync(
      path.join(dir, 'a.as'),
      "import { B } from './b'\nexport interface A {\n  b: B\n}\n"
    )
    writeFileSync(path.join(dir, 'b.as'), 'export interface B {\n  id: string\n}\n')

    const repo = await build({ rootDir: dir, plugins: [tsPlugin()] })
    const out = await repo.write({ format: 'js' })
    const diagnostics = await repo.diagnostics()

    expect([...diagnostics.keys()].sort()).toEqual(
      ['a.as', 'b.as'].map(f => pathToFileURL(path.join(dir, f)).href).sort()
    )
    expect(out.map(o => o.target).sort()).toEqual(
      [path.join(dir, 'a.as.js'), path.join(dir, 'b.as.js')].sort()
    )
  })

  it('a file named with a space or non-ASCII: its outputs and references named after it', async () => {
    const dir = tmpDir()
    writeFileSync(
      path.join(dir, 'my user.as'),
      "import { B } from './модель'\nexport interface A {\n  b: B\n}\n"
    )
    writeFileSync(path.join(dir, 'модель.as'), 'export interface B {\n  id: string\n}\n')

    const repo = await build({ rootDir: dir, plugins: [tsPlugin()] })
    const out = await repo.write({ format: 'dts' })

    expect(
      out
        .map(o => o.target)
        .filter(t => t.endsWith('.as.d.ts'))
        .sort()
    ).toEqual([path.join(dir, 'my user.as.d.ts'), path.join(dir, 'модель.as.d.ts')].sort())
    expect(readFileSync(path.join(dir, 'my user.as.d.ts'), 'utf8')).toContain(
      '/// <reference path="./my user.as" />'
    )
  })

  it('an error location prints the decoded path; an ordinary one as before', async () => {
    for (const name of ['atscript cli модели-', 'atscript-cli-plain-']) {
      const dir = mkdtempSync(path.join(tmpdir(), name))
      dirs.push(dir)
      writeFileSync(path.join(dir, 'a.as'), '@x.mark\nexport interface A {\n  id: string\n}\n')

      const repo = await build({ rootDir: dir })
      const doc = repo.getDoc(pathToFileURL(path.join(dir, 'a.as')).href)!
      const [message] = doc.getDiagMessages()

      expect(doc.renderDiagMessage(message)).toContain(`in file://${path.join(dir, 'a.as')}:1:1`)
    }
  })

  it('an ordinary path: the ids are `file://` and the path, as before', async () => {
    const dir = project()
    vi.spyOn(process, 'cwd').mockReturnValue(dir)

    const repo = await build(await getConfig(undefined, logger))
    const diagnostics = await repo.diagnostics()

    expect([...diagnostics.keys()].sort()).toEqual(
      [path.join(dir, 'src', 'a.as'), path.join(dir, 'sub', 'b.as')].map(f => `file://${f}`)
    )
  })
})
