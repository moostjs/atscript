import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import { build } from './build'
import type { TAtscriptConfigOutput } from './config'
import { createAtscriptPlugin } from './plugin'

const dirs: string[] = []

function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'atscript-build-'))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

/** Emits one file per document with the content the test asks for. */
function emitPlugin(render: (name: string) => { fileName: string; content: string }) {
  return createAtscriptPlugin({
    name: 'test-emit',
    render: doc => [render(doc.name ?? 'doc')],
  })
}

function tmpSiblings(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith('.tmp'))
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('BuildRepo.write', () => {
  it('writes the complete content and leaves no temp files behind', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    // large enough that a non-awaited / non-atomic write would be visibly partial
    const content = `${'x'.repeat(2_000_000)}\nEND`
    const builder = await build({
      rootDir: root,
      include: ['**/*.as'],
      plugins: [emitPlugin(name => ({ fileName: `${name}.out`, content }))],
    })

    const out = await builder.write({ format: 'js' } as TAtscriptConfigOutput)

    expect(out).toHaveLength(1)
    const target = path.join(root, 'a.as.out')
    expect(out[0].target).toBe(target)
    const written = readFileSync(target, 'utf8')
    expect(written).toHaveLength(content.length)
    expect(written.endsWith('\nEND')).toBe(true)
    expect(tmpSiblings(root)).toEqual([])
  })

  it('replaces an existing file atomically', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    writeFileSync(path.join(root, 'a.as.out'), 'previous content')

    const builder = await build({
      rootDir: root,
      include: ['**/*.as'],
      plugins: [emitPlugin(name => ({ fileName: `${name}.out`, content: 'next content' }))],
    })
    await builder.write({ format: 'js' } as TAtscriptConfigOutput)

    expect(readFileSync(path.join(root, 'a.as.out'), 'utf8')).toBe('next content')
    expect(tmpSiblings(root)).toEqual([])
  })

  it('leaves the previous output intact when rendering throws', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    writeFileSync(path.join(root, 'a.as.out'), 'previous content')

    const builder = await build({
      rootDir: root,
      include: ['**/*.as'],
      plugins: [
        createAtscriptPlugin({
          name: 'test-failing-render',
          render: () => {
            throw new Error('render exploded')
          },
        }),
      ],
    })

    await expect(builder.write({ format: 'js' } as TAtscriptConfigOutput)).rejects.toThrow(
      'render exploded'
    )
    expect(readFileSync(path.join(root, 'a.as.out'), 'utf8')).toBe('previous content')
    expect(tmpSiblings(root)).toEqual([])
  })

  it('cleans up the temp file when the rename fails', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    // a directory cannot be replaced by a file — rename() must fail
    mkdirSync(path.join(root, 'a.as.out'))

    const builder = await build({
      rootDir: root,
      include: ['**/*.as'],
      plugins: [emitPlugin(name => ({ fileName: `${name}.out`, content: 'next content' }))],
    })

    await expect(builder.write({ format: 'js' } as TAtscriptConfigOutput)).rejects.toThrow()
    expect(existsSync(path.join(root, 'a.as.out'))).toBe(true)
    expect(tmpSiblings(root)).toEqual([])
  })

  it('does not rewrite an output whose content is unchanged', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    const target = path.join(root, 'a.as.out')
    writeFileSync(target, 'same content')
    const old = new Date('2000-01-01T00:00:00Z')
    utimesSync(target, old, old)

    const builder = await build({
      rootDir: root,
      include: ['**/*.as'],
      plugins: [emitPlugin(name => ({ fileName: `${name}.out`, content: 'same content' }))],
    })
    const out = await builder.write({ format: 'js' } as TAtscriptConfigOutput)

    expect(out).toHaveLength(1)
    expect(statSync(target).mtime.getTime()).toBe(old.getTime())
    expect(readFileSync(target, 'utf8')).toBe('same content')
    expect(tmpSiblings(root)).toEqual([])
  })

  it('lands outputs sharing a directory and in a nested directory', async () => {
    const root = makeProject({
      'a.as': 'export interface A { id: string }\n',
      'b.as': 'export interface B { id: string }\n',
      'nested/c.as': 'export interface C { id: string }\n',
    })

    const builder = await build({
      rootDir: root,
      include: ['**/*.as'],
      plugins: [emitPlugin(name => ({ fileName: `${name}.out`, content: `content of ${name}` }))],
    })
    const out = await builder.write({ format: 'js', outDir: 'out' } as TAtscriptConfigOutput)

    expect(out.map(o => o.target).sort()).toEqual([
      path.join(root, 'out', 'a.as.out'),
      path.join(root, 'out', 'b.as.out'),
      path.join(root, 'out', 'nested', 'c.as.out'),
    ])
    for (const o of out) {
      expect(readFileSync(o.target, 'utf8')).toBe(o.content)
    }
    expect(tmpSiblings(path.join(root, 'out'))).toEqual([])
    expect(tmpSiblings(path.join(root, 'out', 'nested'))).toEqual([])
  })
})
