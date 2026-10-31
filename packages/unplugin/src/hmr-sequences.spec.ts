import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { unplugin } from './index'

/*
 * A real Vite dev server (the one vitest runs on) under random sequences of edits of a small
 * project's `.as` files — mutating `annotate` blocks of imported types (a module annotating a
 * type of a module it imports, one that does not import it back), import cycles appearing and
 * disappearing, `annotate … as` aliases, aliases, `extends` — in the three ways an app is
 * reloaded (a module runner without HMR, `ssrLoadModule`, a module runner with HMR invalidating
 * the modules of each hot update): after every edit, the app is the app a cold start on the
 * same files loads (every type's metadata at every path, and validator verdicts). A block
 * changed or removed leaves no annotation behind: the module of the type it annotates (and the
 * modules importing it) are evaluated again.
 *
 * `ATSCRIPT_LARGE_TESTS=1`: more and longer sequences.
 */

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
  const root = mkdtempSync(path.join(__dirname, '.vite-hmr-seq-'))
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
  /** Resolves once Vite reported the next change to the plugins (see `edits`). */
  const changes: Array<() => void> = []
  const nextChange = () =>
    new Promise<void>(resolve => {
      changes.push(resolve)
    })
  // Its `watchChange` is asynchronous (it renders the modules depending on the file): Vite
  // handles the change once it settled.
  const atscript = unplugin.vite({ root }) as { watchChange: (...args: unknown[]) => unknown }
  const watchChange = atscript.watchChange
  let handledAll: unknown[] = []
  atscript.watchChange = function (this: unknown, ...args: unknown[]) {
    const h = watchChange.apply(this, args)
    handledAll.push(h)
    return h
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
      { name: 'edits', watchChange: () => changes.shift()?.() },
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
  const load = () => {
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
      const app = await load()
      return app.probe()
    } catch (error) {
      return `error: ${(error as Error).message.split('\n')[0]}`
    }
  }
  const out = [await probed()]
  for (const edit of scenario.edits) {
    const done = nextChange()
    transformed.length = 0
    for (const [event, file] of write(edit)) {
      server.watcher.emit(event, file)
    }
    await done
    await new Promise<void>(resolve => {
      setTimeout(resolve, 300)
    })
    await Promise.all(handledAll)
    handledAll = []
    // Vite handles the change once every plugin's `watchChange` returned.
    await new Promise<void>(resolve => {
      setImmediate(resolve)
    })
    out.push(await probed())
  }
  await runner?.close()
  return out
}

/** A seeded random number generator (mulberry32) returning values in `[0, 1)`. */
function rng(seed: number): () => number {
  // oxlint-disable unicorn/prefer-math-trunc
  return () => {
    seed = (seed + 0x6d_2b_79_f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  // oxlint-enable unicorn/prefer-math-trunc
}
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]

/**
 * The variants of each file (a small project where cycles, aliases and annotates of imported
 * types appear and disappear).
 */
const V1: Record<string, string[]> = {
  'b.as': [
    'export interface BT {\n  @expect.minLength 1\n  x: string\n  y?: string\n}\n',
    'export interface BT {\n  @expect.minLength 2\n  x: string\n  y?: string\n}\n',
    "import { AT } from './a'\nexport interface BT {\n  @expect.minLength 3\n  x: string\n  y?: string\n  a?: AT\n}\nannotate AT {\n  @meta.label 'fromB'\n  @expect.maxLength 6\n  z\n}\n",
  ],
  'a.as': [
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\n",
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\nannotate BT {\n  @expect.maxLength 4\n  y\n}\nexport type AL = BT\n",
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\nexport annotate BT as BA {\n  @meta.label 'BA'\n  @expect.maxLength 5\n  x\n}\nexport type AL = BA\n",
  ],
  'c.as': [
    "import { AT } from './a'\nexport interface CT extends AT {\n  c?: string\n}\n",
    "import { AT } from './a'\nexport interface CT extends AT {\n  c?: string\n}\nannotate AT {\n  @meta.label 'fromC'\n  @expect.minLength 2\n  z\n}\n",
    "import { AT } from './a'\nimport { BT } from './b'\nexport interface CT extends AT {\n  c?: string\n  bb?: BT.x\n}\nannotate AT {\n  @expect.minLength 3\n  b.x\n}\n",
  ],
}
const V2: Record<string, string[]> = {
  'b.as': [
    'export interface BT {\n  @expect.minLength 1\n  x: string\n  y?: string\n}\n',
    'export interface BT {\n  @expect.minLength 2\n  x: string\n  y?: string\n}\nannotate BT {\n  @expect.maxLength 4\n  y\n}\n',
    "import { AT } from './a'\nexport interface BT {\n  @expect.minLength 3\n  x: string\n  y?: string\n  a?: AT\n}\nannotate AT {\n  @meta.label 'fromB'\n  @expect.maxLength 6\n  z\n}\n",
    "import { AT } from './a'\nexport interface BT {\n  @expect.minLength 2\n  x: string\n  y?: string\n  a?: AT\n}\nannotate AT {\n  @expect.minLength 2\n  b.x\n}\n",
  ],
  'a.as': [
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\n",
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\nannotate AT {\n  @expect.maxLength 4\n  b.y\n}\nexport type AL = BT\n",
    "import { BT } from './b'\nexport interface AT {\n  b?: BT\n  z: string\n}\nexport annotate BT as BA {\n  @meta.label 'BA'\n  @expect.maxLength 5\n  x\n}\nexport type AL = BA\nexport interface AE extends BT {\n  e?: string\n}\n",
  ],
  'c.as': [
    "import { AT } from './a'\nexport interface CT extends AT {\n  c?: string\n}\n",
    "import { AT } from './a'\nexport type CA = AT\nexport interface CT {\n  t: AT\n  c?: AT.z\n}\nannotate CT {\n  @expect.minLength 2\n  t.z\n}\n",
    "import { AT } from './a'\nimport { BT } from './b'\nexport interface CT extends AT {\n  c?: string\n  bb?: BT.x\n}\nexport annotate AT as CX {\n  @expect.minLength 3\n  b.x\n}\n",
  ],
}
const VARIANTS: Record<string, string[]> = Object.fromEntries(
  Object.keys(V1).map(f => [f, [...new Set([...V1[f], ...V2[f]])]])
)
const FILES = Object.keys(VARIANTS)
const VALUES = [
  { t: { z: 'a' }, c: 'abc' },
  { t: { z: 'abc' } },
  { z: 'abcdefg' },
  { z: 'a' },
  { z: 'ab', b: { x: 'a', y: 'abcde' } },
  { z: 'abc', b: { x: 'abcdefg', y: 'y' } },
  { x: 'a' },
  { x: 'abc', y: 'abcde' },
  { x: 'abcdef' },
  { z: 'abc', c: 'c', bb: 'a' },
]
const PROBE =
  `import * as A from './a.as'\nimport * as B from './b.as'\nimport * as C from './c.as'\n` +
  `const meta = t => { const out = {}; const v = (n, at, st) => { out[at || '.'] = JSON.stringify([...n.metadata].sort()); const ty = n.type; if (st.includes(ty) || st.length > 4) return; if (ty.kind === 'object') for (const [k, p] of ty.props) v(p, at + '.' + k, [...st, ty]); else if (ty.kind === 'array') v(ty.of, at + '[]', [...st, ty]); else if (ty.items) ty.items.forEach((x, i) => v(x, at + '<' + i + '>', [...st, ty])) }; v(t, '', []); return out }\n` +
  `export const probe = () => { const out = {}; for (const [f, m] of [['a', A], ['b', B], ['c', C]]) for (const [k, t] of Object.entries(m)) if (t && t.__is_atscript_annotated_type) out[f + ':' + k] = { meta: meta(t), v: ${JSON.stringify(VALUES)}.map(x => t.validator().validate(structuredClone(x), true)) }; return JSON.stringify(out) }\n`

const LARGE = !!process.env.ATSCRIPT_LARGE_TESTS
const SEQUENCES = LARGE ? 24 : 4
const STEPS = LARGE ? 6 : 4

/** The variant numbers of `state`'s files. */
const variantsOf = (state: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(FILES.map(f => [f, VARIANTS[f].indexOf(state[f])])))

/** What differs between two probes (by type: verdicts and the paths whose metadata differ). */
const parseProbe = (x: unknown) =>
  typeof x === 'string' && x.startsWith('{') ? (JSON.parse(x) as Record<string, any>) : x

function differences(dev: unknown, cold: unknown): string[] {
  const parse = parseProbe
  const d = parse(dev)
  const c = parse(cold)
  if (typeof d !== 'object' || typeof c !== 'object' || !d || !c) {
    return [`dev=${String(dev).slice(0, 200)} cold=${String(cold).slice(0, 200)}`]
  }
  const out: string[] = []
  for (const key of new Set([...Object.keys(d), ...Object.keys(c)])) {
    if (JSON.stringify(d[key]) === JSON.stringify(c[key])) {
      continue
    }
    const dm = d[key]?.meta ?? {}
    const cm = c[key]?.meta ?? {}
    const paths = [...new Set([...Object.keys(dm), ...Object.keys(cm)])]
      .filter(p => dm[p] !== cm[p])
      .map(p => `${p} dev=${dm[p]} cold=${cm[p]}`)
    out.push(
      `${key}: v dev=${JSON.stringify(d[key]?.v)} cold=${JSON.stringify(c[key]?.v)} ${paths.join('; ')}`
    )
  }
  return out
}

describe.each<TMode>(['runner', 'ssrLoadModule', 'hotUpdate'])(
  'edit sequences, against a cold start (%s)',
  mode => {
    for (let seq = 0; seq < SEQUENCES; seq++) {
      it(`sequence ${seq}`, { timeout: 300_000 }, async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const r = rng(seq * 7919 + 13)
        const state: Record<string, string> = {}
        for (const f of FILES) {
          state[f] = pick(r, VARIANTS[f])
        }
        const files = { ...state }
        const edits: Array<Record<string, string>> = []
        const states: Array<Record<string, string>> = [{ ...state }]
        for (let k = 0; k < STEPS; k++) {
          const edit: Record<string, string> = {}
          for (let j = 1 + Math.floor(r() * 2); j > 0; j--) {
            const f = pick(r, FILES)
            edit[f] = pick(r, VARIANTS[f])
          }
          Object.assign(state, edit)
          edits.push(edit)
          states.push({ ...state })
        }
        const dev = await run({ files, probe: PROBE, edits }, mode)
        const mismatches: string[] = []
        for (const [k, at] of states.entries()) {
          const [cold] = await run({ files: at, probe: PROBE, edits: [] }, mode)
          if (dev[k] !== cold) {
            mismatches.push(
              `step ${k} state ${variantsOf(at)}\n    ${differences(dev[k], cold).join('\n    ')}`
            )
          }
        }
        warn.mockRestore()
        expect([`sequence ${seq}`, ...mismatches]).toEqual([`sequence ${seq}`])
      })
    }
  }
)

/**
 * A probe of every export of modules `names` (as `PROBE` does for a.as, b.as, c.as), after
 * loading `loaded` (its blocks apply; it may fail to load).
 */
const probeOf = (names: string[], loaded?: string) => {
  const imports = names.map((n, i) => `import * as M${i} from './${n}'\n`).join('')
  const load = loaded ? `try { await import('./${loaded}') } catch {}\n` : ''
  const meta = PROBE.split('\n')
    .filter(line => line.startsWith('const meta'))
    .join('\n')
  const modules = names.map((n, i) => `['${n}', M${i}]`).join(', ')
  return `${imports}${load}${meta}\nexport const probe = () => { const out = {}; for (const [f, m] of [${modules}]) for (const [k, t] of Object.entries(m)) if (t && t.__is_atscript_annotated_type) out[f + ':' + k] = { meta: meta(t) }; return JSON.stringify(out) }\n`
}

describe.each<TMode>(['runner', 'ssrLoadModule', 'hotUpdate'])(
  'a module with blocks evaluated again (%s)',
  mode => {
    // (round 22, HMR-A: the module of the annotated type was kept with the block applied — still
    // applied after the block's module failed to load, or applied again after the blocks loaded
    // later)
    const P = 'export interface P {\n  z: string\n}\n'
    const T = 'export interface T {\n  a: string\n}\n'
    const Q = (y: string) =>
      `import { P } from './p'\nimport { T } from './t'\nexport interface Q {\n  y: ${y}\n}\nannotate P {\n  @meta.label 'Q'\n  z\n}\n`
    const cases: Record<string, { files: Record<string, string>; edit: Record<string, string> }> = {
      // its import deleted: it fails to load (only the plugin's probe of `p.as` stays)
      'that fails to load now (an import deleted)': {
        files: { 'p.as': P, 't.as': T, 'q.as': Q('T') },
        edit: { 't.as': 'export interface X {\n  a: string\n}\n' },
      },
      'that fails to load now (a member it uses gone)': {
        files: { 'p.as': P, 't.as': T, 'q.as': Q('T.a') },
        edit: { 't.as': 'export interface T {\n  b: string\n}\n' },
      },
      'whose import changed, with a block loaded later on the same prop': {
        files: {
          't.as': T,
          'p.as': `import { T } from './t'\nimport { Q } from './q'\nexport interface P {\n  t?: T\n  q?: Q\n}\nannotate T {\n  @meta.label 'P2'\n  a\n}\n`,
          'q.as': 'export interface Q {\n  w: string\n}\n',
          'r.as': `import { T } from './t'\nannotate T {\n  @meta.label 'R'\n  a\n}\n`,
        },
        edit: { 'q.as': 'export interface Q {\n  w: number\n}\n' },
      },
    }
    // (round 23, the reviewer's fuzz5 seed 6: a block of a plain alias is its target's; the alias
    // made `annotate … as`, the block is the alias's own — the target's module, a candidate whose
    // generated code is the same, was not evaluated again, and kept the block)
    it('whose alias is no longer plain, retargeting the block', { timeout: 120_000 }, async () => {
      const files = {
        'a.as': 'export interface User {\n  name: string\n  age?: number\n}\n',
        'b.as': "import { User } from './a'\nexport type UA = User\n",
        'c.as':
          "import { UA } from './b'\nexport annotate UA as CX {\n  @meta.label 'cx'\n  name\n}\n",
        'd.as': "import { User } from './a'\nexport interface D {\n  u: User\n}\n",
      }
      const edits = [
        { 'c.as': "import { UA } from './b'\nannotate UA {\n  @expect.minLength 3\n  name\n}\n" },
        {
          'a.as':
            "export interface User {\n  name: string\n}\nannotate User {\n  @meta.label 'a-own'\n  name\n}\n",
        },
        { 'd.as': "import { User } from './a'\nexport interface D {\n  n: User.name\n}\n" },
        {
          'b.as':
            "import { User } from './a'\nexport annotate User as UA {\n  @meta.description 'as'\n  name\n}\n",
        },
      ]
      const probe = probeOf(Object.keys(files).sort())
      const dev = await run({ files, probe, edits }, mode)
      const [cold] = await run(
        { files: Object.assign({}, files, ...edits), probe, edits: [] },
        mode
      )
      expect(differences(dev[edits.length], cold)).toEqual([])
    })
    for (const [name, { files, edit }] of Object.entries(cases)) {
      it(name, { timeout: 120_000 }, async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // (the load errors the plugin reports)
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})
        const fails = name.includes('fails')
        const names = Object.keys(files).filter(n => n !== 'q.as' || !fails)
        const probe = probeOf(names.sort(), fails ? 'q.as' : undefined)
        const dev = await run({ files, probe, edits: [edit] }, mode)
        const [cold] = await run({ files: { ...files, ...edit }, probe, edits: [] }, mode)
        warn.mockRestore()
        log.mockRestore()
        expect(differences(dev[1], cold)).toEqual([])
      })
    }
  }
)
