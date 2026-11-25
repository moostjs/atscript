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

import { AnnotationSpec } from './annotations'
import { build } from './build'
import type { TAtscriptConfig, TAtscriptConfigOutput } from './config'
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

/** Records the hooks it sees called, in order (`resolve` / `load` / `onDocument` by file name). */
function recorder(events: string[]) {
  return createAtscriptPlugin({
    name: 'recorder',
    config: () => {
      events.push('config')
      return undefined
    },
    buildStart: () => {
      events.push('buildStart')
    },
    resolve: id => {
      events.push(`resolve ${path.basename(id)}`)
      return undefined
    },
    load: id => {
      events.push(`load ${path.basename(id)}`)
      return undefined
    },
    onDocument: doc => {
      events.push(`onDocument ${path.basename(doc.id)}`)
    },
  })
}

describe('buildStart', () => {
  it('lets a plugin write a .as file the build then discovers and compiles', async () => {
    const root = makeProject({})
    const generator = createAtscriptPlugin({
      name: 'generator',
      buildStart: config => {
        writeFileSync(
          path.join(config.rootDir, 'gen.as'),
          'export interface Gen {\n  id: string\n}\n'
        )
      },
    })

    const builder = await build({
      rootDir: root,
      plugins: [generator, emitPlugin(name => ({ fileName: `${name}.out`, content: name }))],
    })

    expect(builder.getDoc(`file://${path.join(root, 'gen.as')}`)?.exports.has('Gen')).toBe(true)
    const out = await builder.generate({ format: 'js' } as TAtscriptConfigOutput)
    expect(out.map(o => o.target)).toEqual([path.join(root, 'gen.as.out')])
  })

  it('runs after the config hooks, before any document is resolved, loaded or parsed', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    const events: string[] = []

    await build({ rootDir: root, plugins: [recorder(events)] })

    expect(events).toEqual(['config', 'buildStart', 'resolve a.as', 'load a.as', 'onDocument a.as'])
  })

  it('receives the final config: every plugin config hook merged, rootDir absolute', async () => {
    const root = makeProject({})
    let seen: TAtscriptConfig | undefined
    const reader = createAtscriptPlugin({
      name: 'reader',
      buildStart: config => {
        seen = config
      },
    })
    const contributor = createAtscriptPlugin({
      name: 'contributor',
      config: () => ({
        annotations: { gen: { source: new AnnotationSpec({ description: 'generated' }) } },
      }),
    })

    // (a relative `rootDir`: resolved against the working directory)
    await build({ rootDir: path.relative(process.cwd(), root), plugins: [reader, contributor] })

    expect(seen?.rootDir).toBe(root)
    expect((seen?.annotations?.gen as { source?: unknown } | undefined)?.source).toBeInstanceOf(
      AnnotationSpec
    )
  })

  it('runs the plugins in array order, each awaited', async () => {
    const root = makeProject({})
    const events: string[] = []
    const slow = createAtscriptPlugin({
      name: 'slow',
      buildStart: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 20)
        })
        events.push('slow')
      },
    })
    const fast = createAtscriptPlugin({
      name: 'fast',
      buildStart: () => {
        events.push('fast')
      },
    })

    await build({ rootDir: root, plugins: [slow, fast] })

    expect(events).toEqual(['slow', 'fast'])
  })

  it('rejects the build when a plugin throws, before any document is opened', async () => {
    const root = makeProject({ 'a.as': 'export interface A { id: string }\n' })
    const events: string[] = []
    const failing = createAtscriptPlugin({
      name: 'failing',
      buildStart: () => {
        throw new Error('cannot generate')
      },
    })

    await expect(build({ rootDir: root, plugins: [recorder(events), failing] })).rejects.toThrow(
      'cannot generate'
    )
    expect(events).toEqual(['config', 'buildStart'])
  })
})
