import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { AtscriptDoc } from '@atscript/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { unplugin, unpluginFactory } from './index'

// The mutating annotates of an import cycle apply once the modules their imports link are all
// evaluated: two module runners of one process loading the same cycle at once never mix their
// evaluations, a cold load warns about nothing, and a hot update renders again only the modules
// whose generated code can depend on the edited file.

const viteEntry = createRequire(
  createRequire(import.meta.url).resolve('vitest/package.json')
).resolve('vite')
const UTILS = path.resolve(__dirname, '../../typescript/src/utils.ts')

const dirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Where the test projects go (git-ignored, outside the sources). */
const TMP = path.resolve(__dirname, '../.tmp-tests')

function project(prefix: string, files: Record<string, string>): string {
  mkdirSync(TMP, { recursive: true })
  const root = mkdtempSync(path.join(TMP, prefix))
  dirs.push(root)
  mkdirSync(path.join(root, 'src'))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, name), content)
  }
  return root
}

const minLength = (type: any, prop: string) =>
  type.type.props.get(prop).metadata.get('expect.minLength')?.length ?? null

describe('two module runners of one process', () => {
  for (const both of [true, false]) {
    it(
      `load a cycle concurrently (${both ? 'both' : 'one'} annotating)`,
      { timeout: 30_000 },
      async () => {
        // The runtime helpers externalized: one instance of them for both runners.
        const root = project('.cycle-envs-', {
          'package.json': '{"name":"envs","type":"module"}',
          'src/a.as': `import { B } from './b'\nexport interface A { b?: B; x: string }\nannotate B {\n  @expect.minLength 3\n  y\n}\n`,
          'src/b.as': `import { A } from './a'\nexport interface B { a?: A; y: string }\n${both ? 'annotate A {\n  @expect.minLength 4\n  x\n}\n' : ''}`,
          'src/entry.ts': `import { A } from './a.as'\nimport { B } from './b.as'\nexport const A_ = A\nexport const B_ = B\n`,
        })
        mkdirSync(path.join(root, 'node_modules/@atscript'), { recursive: true })
        symlinkSync(
          path.resolve(__dirname, '../../typescript'),
          path.join(root, 'node_modules/@atscript/typescript')
        )
        const vite = (await import(viteEntry)) as typeof import('vite')
        const server = await vite.createServer({
          root,
          configFile: false,
          logLevel: 'silent',
          appType: 'custom',
          server: { middlewareMode: true, hmr: false, ws: false, watch: null },
          environments: {
            ssr: { resolve: { external: ['@atscript/typescript'] } },
            worker: {
              consumer: 'server',
              dev: {},
              resolve: { external: ['@atscript/typescript'] },
            },
          } as never,
          plugins: [unplugin.vite({ root }) as never],
        })
        const expected = [both ? 4 : null, 3]
        const probe = (m: any) => {
          const A = m.A ?? m.A_ ?? m.B.type.props.get('a')
          const B = m.B ?? m.B_ ?? m.A.type.props.get('b')
          return [
            minLength(A.type ? A : { type: A }, 'x'),
            minLength(B.type ? B : { type: B }, 'y'),
          ]
        }
        const bad: unknown[] = []
        /** Both runners import a module of the cycle (`i`: which ones) at once. */
        const once = async (i: number) => {
          const r1 = vite.createServerModuleRunner(server.environments.ssr, { hmr: false })
          const r2 = vite.createServerModuleRunner((server.environments as any).worker, {
            hmr: false,
          })
          const e1 = ['/src/a.as', '/src/b.as', '/src/entry.ts'][i % 3]
          const e2 = ['/src/b.as', '/src/entry.ts', '/src/a.as', '/src/a.as'][i % 4]
          try {
            const [m1, m2] = await Promise.all([r1.import(e1), r2.import(e2)])
            const now = [probe(m1), probe(m2)]
            if (JSON.stringify(now) !== JSON.stringify([expected, expected])) {
              bad.push({ i, e1, e2, now })
            }
          } catch (error) {
            bad.push({ i, e1, e2, error: String(error) })
          } finally {
            await r1.close()
            await r2.close()
          }
        }
        try {
          for (let i = 0; i < 12; i++) {
            await once(i)
          }
        } finally {
          await server.close()
        }
        expect(bad).toEqual([])
      }
    )
  }
})

describe('a cold load of a cycle', () => {
  for (const mode of ['runner', 'ssrLoadModule']) {
    it(`warns about nothing (${mode})`, { timeout: 30_000 }, async () => {
      const warn = vi.spyOn(console, 'warn')
      const root = project('.cycle-cold-', {
        'package.json': '{"name":"cold"}',
        'src/a.as': `import { B } from './b'\nimport { D } from './d'\nexport interface A { b?: B; d?: D; x: string }\nannotate B {\n  @expect.minLength 3\n  y\n}\n`,
        'src/b.as': `import { A } from './a'\nexport interface B { a?: A; y: string }\n`,
        'src/d.as': `export interface D { z: string }\n`,
        'src/entry.ts': `import { A } from './a.as'\nexport const probe = () => A.type.props.get('b').type.props.get('y').metadata.get('expect.minLength')?.length ?? null\n`,
      })
      const vite = (await import(viteEntry)) as typeof import('vite')
      const server = await vite.createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        resolve: { alias: { '@atscript/typescript/utils': UTILS } },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        plugins: [unplugin.vite({ root }) as never],
      })
      try {
        const runner = vite.createServerModuleRunner(server.environments.ssr, { hmr: false })
        const m: any =
          mode === 'ssrLoadModule'
            ? await server.ssrLoadModule('/src/entry.ts')
            : await runner.import('/src/entry.ts')
        await new Promise<void>(resolve => {
          setTimeout(resolve, 50)
        })
        expect({ probe: m.probe(), warns: warn.mock.calls.map(c => String(c[0])) }).toEqual({
          probe: 3,
          warns: [],
        })
        await runner.close()
      } finally {
        await server.close()
      }
    })
  }
})

describe('a hot update of a large import cycle', () => {
  it('renders again only the modules that can depend on the edited file', async () => {
    const N = 200
    const source = (i: number, extra = '') => {
      const j = (i + 1) % N
      const k = (i * 7 + 3) % N
      const other = k !== i && k !== j
      const imports = `import { M${j} } from './m${j}'\n${other ? `import { M${k} } from './m${k}'\n` : ''}`
      const body = `export interface M${i} {\n  id: string\n${extra}  next?: M${j}\n${other ? `  other?: M${k}[]\n` : ''}}\n`
      return `${imports}${body}${i === 0 ? `annotate M${j} {\n  @expect.minLength 3\n  id\n}\n` : ''}`
    }
    const root = project('.cycle-perf-', { 'package.json': '{"name":"perf"}' })
    for (let i = 0; i < N; i++) {
      writeFileSync(path.join(root, `m${i}.as`), source(i))
    }
    const plugin = unpluginFactory({ root }, { framework: 'vite' } as never) as any
    const invalidated: unknown[] = []
    const graph = {
      getModulesByFile: (file: string) => new Set([file]),
      invalidateModule: (mod: unknown) => invalidated.push(mod),
    }
    plugin.vite.configureServer({
      environments: { ssr: { moduleGraph: graph } },
      moduleGraph: graph,
    })
    const ctx = { addWatchFile() {} }
    for (let i = 0; i < N; i++) {
      await plugin.load.call(ctx, path.join(root, `m${i}.as`), { ssr: true })
    }
    const render = vi.spyOn(AtscriptDoc.prototype, 'render')
    // A prop added to `M5`: its importers refer to it, inline nothing of it.
    writeFileSync(path.join(root, 'm5.as'), source(5, '  added?: string\n'))
    await plugin.watchChange(path.join(root, 'm5.as'), { event: 'update' })
    // `M5` itself and the modules importing it (all the others are in its cycle).
    expect(render.mock.calls.length).toBeLessThan(10)
    expect(invalidated).toEqual([])
    // An import changed: the cycle may change, every module of it is rendered again.
    render.mockClear()
    writeFileSync(
      path.join(root, 'm5.as'),
      `import { M0 } from './m0'\n${source(5, '  zero?: M0\n')}`
    )
    await plugin.watchChange(path.join(root, 'm5.as'), { event: 'update' })
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(N - 1)
  })
})
