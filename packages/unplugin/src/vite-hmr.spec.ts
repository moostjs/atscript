import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { unplugin } from './index'

// A real Vite dev server (the one vitest runs on) editing the `.as` files of an import cycle
// whose modules defer their mutating annotates: the modules whose generated code changes with
// the edit are re-transformed, so the annotations apply after every edit.

/** Vite as vitest resolves it (not a dependency of this package). */
const viteEntry = createRequire(
  createRequire(import.meta.url).resolve('vitest/package.json')
).resolve('vite')
const UTILS = path.resolve(__dirname, '../../typescript/src/utils.ts')

const dirs: string[] = []
const closers: Array<() => Promise<unknown>> = []

afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close()
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

interface TModuleNode {
  file: string | null
}

interface TEnvironment {
  name: string
  moduleGraph: { invalidateModule: (mod: never) => void }
}

interface TScenario {
  files: Record<string, string>
  /** The `.as` module the entry imports (and probes). */
  probe: string
  /** The files each edit writes (`null`: deletes). */
  edits: Array<Record<string, string | null>>
}

/**
 * How the app is re-imported: a module runner (without HMR, like a server-side dev runner that
 * re-imports the app on changes), `ssrLoadModule`, or a module runner with Vite's HMR on and a
 * `hotUpdate` hook invalidating the modules of each update (see `updated`).
 */
type TMode = 'runner' | 'ssrLoadModule' | 'hotUpdate'

/** The `.as` files of the modules of each hot update (`hotUpdate` mode). */
const updated: string[][] = []
/** The `.as` modules transformed since the last edit (by file name). */
const transformed: string[] = []

/**
 * The probe (`expect.minLength` of `path` in the probed type) initially and after each edit,
 * the app re-imported like a server-side dev runner does.
 */
async function run(scenario: TScenario, mode: TMode): Promise<unknown[]> {
  updated.length = 0
  transformed.length = 0
  const vite = (await import(viteEntry)) as typeof import('vite')
  const root = mkdtempSync(path.join(__dirname, '.vite-hmr-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'src'))
  /** Writes (or deletes) `files`: the watcher events of the changes. */
  const write = (files: Record<string, string | null>) => {
    const events: Array<[string, string]> = []
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(root, 'src', name)
      if (content === null) {
        rmSync(file)
        events.push(['unlink', file])
      } else {
        events.push([existsSync(file) ? 'change' : 'add', file])
        writeFileSync(file, content)
      }
    }
    return events
  }
  write(scenario.files)
  writeFileSync(path.join(root, 'src/entry.ts'), scenario.probe)
  /** Resolves once Vite reported the next `count` changes to the plugins (see `edits`). */
  let reported = 0
  let expected = 0
  let onReported: (() => void) | undefined
  const nextChanges = (count: number) =>
    new Promise<void>(resolve => {
      reported = 0
      expected = count
      onReported = resolve
    })
  const changeReported = () => {
    if (++reported === expected) {
      onReported?.()
    }
  }
  // Its `watchChange` is asynchronous (it renders the modules depending on the file): Vite
  // handles the change once it settled.
  const atscript = unplugin.vite({ root }) as { watchChange: (...args: unknown[]) => unknown }
  const watchChange = atscript.watchChange
  let handled: unknown[] = []
  atscript.watchChange = function (this: unknown, ...args: unknown[]) {
    const result = watchChange.apply(this, args)
    handled.push(result)
    return result
  }
  const server = await vite.createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    resolve: { alias: { '@atscript/typescript/utils': UTILS } },
    // No file watching: the edits are reported to the watcher (see below).
    server: { middlewareMode: true, hmr: mode === 'hotUpdate', ws: false, watch: null },
    plugins: [
      atscript as never,
      { name: 'edits', watchChange: changeReported },
      {
        name: 'transforms',
        transform(_code: string, id: string) {
          if (id.endsWith('.as')) {
            transformed.push(path.basename(id))
          }
        },
      },
      {
        name: 'app-reload',
        hotUpdate(this: { environment: TEnvironment }, { modules }: { modules: TModuleNode[] }) {
          if (this.environment.name === 'ssr') {
            updated.push(modules.map(m => path.basename(m.file ?? '')).sort())
            for (const mod of modules) {
              this.environment.moduleGraph.invalidateModule(mod as never)
            }
            return []
          }
        },
      },
    ],
  })
  closers.push(() => server.close())
  const runner =
    mode === 'ssrLoadModule'
      ? undefined
      : vite.createServerModuleRunner(server.environments.ssr, { hmr: false })
  const entry = '/src/entry.ts'
  const load = async () => {
    if (runner) {
      const node = server.environments.ssr.moduleGraph.getModuleById(
        path.join(root, 'src/entry.ts')
      )
      if (node) {
        server.environments.ssr.moduleGraph.invalidateModule(node)
      }
      return runner.import(entry)
    }
    return server.ssrLoadModule(entry)
  }
  /** The probe, or the error loading the app reports. */
  const probed = async () => {
    try {
      return (await load()).probe()
    } catch (error) {
      return `error: ${(error as Error).message.split('\n')[0]}`
    }
  }
  const out = [await probed()]
  for (const edit of scenario.edits) {
    transformed.length = 0
    handled = []
    const events = write(edit)
    const done = nextChanges(events.length)
    for (const [event, file] of events) {
      server.watcher.emit(event, file)
    }
    await done
    await Promise.all(handled)
    // Vite handles the change once every plugin's `watchChange` returned.
    await new Promise<void>(resolve => {
      setImmediate(resolve)
    })
    out.push(await probed())
  }
  await runner?.close()
  return out
}

const probe = (module: string, type: string, prop: string) =>
  `import { ${type} } from './${module}.as'\n` +
  `export const probe = () => ${type}.type.props.get('${prop}').metadata.get('expect.minLength')?.length ?? null\n`

const annotate = (type: string, prop: string, n: number) =>
  `annotate ${type} {\n  @expect.minLength ${n}\n  ${prop}\n}\n`

describe.each<TMode>(['runner', 'ssrLoadModule', 'hotUpdate'])(
  'hot updates of an import cycle (%s)',
  mode => {
    it('apply a changed annotate of a cycle module', { timeout: 30_000 }, async () => {
      const a = (n: number) =>
        `import { B } from './b'\nexport interface A { b: B; x: string }\n${annotate('B', 'y', n)}`
      const b = `import { A } from './a'\nexport interface B { y: string; a?: A }\n`
      const result = await run(
        {
          files: { 'a.as': a(3), 'b.as': b },
          probe: probe('b', 'B', 'y'),
          edits: [{ 'a.as': a(1) }, { 'a.as': a(5) }],
        },
        mode
      )
      expect(result).toEqual([3, 1, 5])
    })

    it('apply an annotate added to a cycle without one', { timeout: 30_000 }, async () => {
      const a = `import { B } from './b'\nexport interface A { b: B; x: string }\n`
      const b = `import { A } from './a'\nexport interface B { y: string; a?: A }\n`
      const result = await run(
        {
          files: { 'a.as': a, 'b.as': b },
          probe: probe('b', 'B', 'y'),
          edits: [{ 'a.as': `${a}${annotate('B', 'y', 3)}` }, { 'a.as': a }],
        },
        mode
      )
      expect(result).toEqual([null, 3, null])
      if (mode === 'hotUpdate') {
        // (MODEL §9 U2: a change to a module with blocks — before or after — is a full reload:
        // no module-level hot update, every module evaluated again)
        expect(updated.splice(0)).toEqual([[], []])
      }
    })

    it(
      'apply the annotates of a cycle that grows and shrinks back',
      { timeout: 30_000 },
      async () => {
        const b = `import { A } from './a'\nexport interface B { y: string; a?: A }\n${annotate('A', 'x', 3)}`
        const a0 = `import { B } from './b'\nexport interface A { b?: B; x: string }\n`
        const a1 = `import { B } from './b'\nimport { C } from './c'\nexport interface A { b?: B; x: string; c?: C }\n`
        const c = `import { B } from './b'\nexport interface C { b?: B }\n`
        const result = await run(
          {
            files: { 'a.as': a0, 'b.as': b, 'c.as': c },
            probe: probe('a', 'A', 'x'),
            edits: [{ 'a.as': a1 }, { 'a.as': a0 }],
          },
          mode
        )
        expect(result).toEqual([3, 3, 3])
      }
    )

    it(
      'apply the annotates of a module deleted and created again',
      { timeout: 30_000 },
      async () => {
        // `a` annotates `B` of `b`: deleted, `a` fails (its annotate names a type that is gone);
        // created again, `a` (whose import of `b` did not resolve meanwhile) works again.
        const a = `import { B } from './b'\nexport interface A { b: B; x: string }\n${annotate('B', 'y', 3)}`
        const b = `import { A } from './a'\nexport interface B { y: string; a?: A }\n`
        const result = await run(
          {
            files: { 'a.as': a, 'b.as': b },
            probe: probe('b', 'B', 'y'),
            edits: [{ 'b.as': null }, { 'b.as': b }],
          },
          mode
        )
        expect(result[0]).toBe(3)
        expect(String(result[1])).toMatch(/^error: /)
        expect(result[2]).toBe(3)
      }
    )

    it(
      're-transforms only the modules whose generated code changed',
      { timeout: 60_000 },
      async () => {
        // 300 modules referencing `Base`, 5 extending it: none's code changes with it (an
        // extending type holds Base's props themselves), they are evaluated again.
        const N = 300
        const files: Record<string, string> = {}
        const base = (n: number) =>
          `export interface Base {\n  @expect.minLength ${n}\n  x: string\n}\n`
        files['base.as'] = base(3)
        let entry = ''
        for (let i = 0; i < N; i++) {
          files[`m${i}.as`] =
            i < 5
              ? `import { Base } from './base'\nexport interface M${i} extends Base {\n  f: string\n}\n`
              : `import { Base } from './base'\nexport interface M${i} {\n  b: Base\n}\n`
          entry += `import { M${i} } from './m${i}.as'\n`
        }
        // Every module used (an unused import would be dropped).
        entry += `export const all = [${Array.from({ length: N }, (_, i) => `M${i}`).join(', ')}]\n`
        entry += `export const probe = () => [M0.type.props.get('x').metadata.get('expect.minLength')?.length, M${N - 1}.type.props.get('b').type.props.get('x').metadata.get('expect.minLength')?.length]\n`
        const started = Date.now()
        const result = await run({ files, probe: entry, edits: [{ 'base.as': base(5) }] }, mode)
        expect(result).toEqual([
          [3, 3],
          [5, 5],
        ])
        expect(transformed.sort()).toEqual(['base.as'])
        if (mode === 'hotUpdate') {
          expect(updated.at(-1)).toEqual(['base.as'])
        }
        expect(Date.now() - started).toBeLessThan(30_000)
      }
    )
  }
)

// ── several files at once, files created again, evaluations across tasks ──

/** `name` extending `base` of module `from` with a `extra` string prop. */
const extending = (name: string, from: string, base: string, extra: string) =>
  `import { ${base} } from './${from}'\nexport interface ${name} extends ${base} {\n  ${extra}: string\n}\n`

const minLengthBase = (n: number) =>
  `export interface Base {\n  @expect.minLength ${n}\n  x: string\n}\n`

const midWithH = `import { Base } from './base'\nexport interface Mid extends Base {\n  f: string\n  h: string\n}\n`

/** `Top`'s inherited `x` constraint, and whether it inherits `h`. */
const topProbe =
  "import { Top } from './top.as'\n" +
  "export const probe = () => [Top.type.props.get('x').metadata.get('expect.minLength')?.length, Top.type.props.has('h')]\n"

describe.each<TMode>(['runner', 'ssrLoadModule', 'hotUpdate'])(
  'edits of the definitions modules inline (%s)',
  mode => {
    for (const order of ['mid-first', 'base-first']) {
      it(`two files changed at once (${order})`, { timeout: 30_000 }, async () => {
        const edit: Record<string, string> =
          order === 'mid-first'
            ? { 'mid.as': midWithH, 'base.as': minLengthBase(5) }
            : { 'base.as': minLengthBase(5), 'mid.as': midWithH }
        const top = extending('Top', 'mid', 'Mid', 'g')
        const result = await run(
          {
            files: {
              'base.as': minLengthBase(3),
              'mid.as': extending('Mid', 'base', 'Base', 'f'),
              'top.as': top,
            },
            probe: topProbe,
            edits: [edit, { 'top.as': `${top}\n` }],
          },
          mode
        )
        expect(result).toEqual([
          [3, false],
          [5, true],
          [5, true],
        ])
      })
    }

    it(
      'a deleted file created again together with an edit of its import',
      { timeout: 30_000 },
      async () => {
        // The importer of the file created again is rendered from the file (not from the
        // document closed when it was deleted).
        const result = await run(
          {
            files: {
              'base.as': minLengthBase(3),
              'mid.as': extending('Mid', 'base', 'Base', 'f'),
              'top.as': extending('Top', 'mid', 'Mid', 'g'),
            },
            probe: topProbe,
            edits: [
              { 'mid.as': null },
              { 'mid.as': midWithH, 'base.as': minLengthBase(5) },
              { 'base.as': minLengthBase(6) },
            ],
          },
          mode
        )
        expect(result).toEqual([[3, false], expect.stringMatching(/^error/), [5, true], [6, true]])
      }
    )
  }
)

describe.each<TMode>(['runner', 'ssrLoadModule', 'hotUpdate'])(
  'cycles evaluated again across tasks (%s)',
  mode => {
    it('mutual annotates, one edited, then both: no warning', { timeout: 30_000 }, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const a = (n: number) =>
        `import { B } from './b'\nimport { D } from './d'\nexport interface A { b?: B; d?: D; x: string }\n${annotate('B', 'y', n)}`
      const b = (n: number) =>
        `import { A } from './a'\nexport interface B { y: string; a?: A }\n${annotate('A', 'x', n)}`
      const result = await run(
        {
          files: { 'a.as': a(3), 'b.as': b(4), 'd.as': 'export interface D { z: string }\n' },
          probe:
            "import { A } from './a.as'\nimport { B } from './b.as'\n" +
            "export const probe = () => [A.type.props.get('x').metadata.get('expect.minLength')?.length, B.type.props.get('y').metadata.get('expect.minLength')?.length]\n",
          edits: [{ 'b.as': b(5) }, { 'a.as': a(6) }, { 'a.as': a(7), 'b.as': b(8) }],
        },
        mode
      )
      const warns = warn.mock.calls.map(c => String(c[0]))
      warn.mockRestore()
      expect({ result, warns }).toEqual({
        result: [
          [4, 3],
          [5, 3],
          [5, 6],
          [8, 7],
        ],
        warns: [],
      })
    })

    it('a 3-module cycle evaluated again module by module', { timeout: 30_000 }, async () => {
      // `b` is evaluated again before `a` and `c` (across tasks, by the module runner): its
      // annotate waits for them (it used to run at once, against `a`'s binding not evaluated
      // yet: "Cannot read properties of undefined (reading 'type')").
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const a = `import { B } from './b'\nexport interface A { b?: B; x: string }\n`
      const b0 = `import { C } from './c'\nimport { A } from './a'\nexport interface B { c?: C; a?: A; y: string }\n${annotate('A', 'x', 4)}`
      const b1 = `import { C } from './c'\nimport { E } from './e'\nimport { A } from './a'\nexport interface B { c?: C; e?: E; a?: A; y: string }\n${annotate('A', 'x', 5)}`
      const c = `import { A } from './a'\nexport interface C { a?: A; z: string }\n`
      const result = await run(
        {
          files: { 'a.as': a, 'b.as': b0, 'c.as': c },
          probe: probe('a', 'A', 'x'),
          edits: [
            { 'e.as': 'export interface E { q: string }\n', 'b.as': b1 },
            { 'b.as': b1.replace('minLength 5', 'minLength 6') },
            { 'c.as': `${c}\n` },
          ],
        },
        mode
      )
      const warns = warn.mock.calls.map(call => String(call[0]))
      warn.mockRestore()
      expect({ result, warns }).toEqual({ result: [4, 5, 6, 6], warns: [] })
    })
  }
)
