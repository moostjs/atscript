import { spawnSync } from 'child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { setFlagsFromString } from 'v8'
import { runInNewContext } from 'vm'

import { AtscriptRepo, build, type BuildRepo } from '@atscript/core'
import { build as bundle } from 'rolldown'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

const dirs: string[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * The runtime (`../utils.ts`) bundled into one ES module, imported by the generated modules that a
 * plain `node` process loads (native ESM evaluation, no TypeScript loader).
 */
let utilsBundle = ''
let utilsDir = ''
beforeAll(async () => {
  utilsDir = mkdtempSync(path.join(tmpdir(), 'atscript-cycles-utils-'))
  utilsBundle = path.join(utilsDir, 'utils.mjs')
  await bundle({
    input: path.resolve(__dirname, '../utils.ts'),
    platform: 'node',
    logLevel: 'warn',
    output: { file: utilsBundle, format: 'esm' },
  })
})
afterAll(() => {
  rmSync(utilsDir, { recursive: true, force: true })
})

function mkdirP(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Writes `files` (relative paths; `.as` files are the entries) to a new directory (or `into`),
 * prepares it (`setup`), generates their modules next to them (through `patch`).
 */
async function generate(
  files: Record<string, string>,
  setup?: (dir: string) => void,
  patch: (code: string) => string = code => code,
  into?: string
): Promise<{ dir: string; js: Map<string, string> }> {
  const dir = into ?? mkdtempSync(path.join(tmpdir(), 'atscript-cycles-'))
  if (!into) {
    dirs.push(dir)
  }
  for (const [name, content] of Object.entries(files)) {
    mkdirP(path.dirname(path.join(dir, name)))
    writeFileSync(path.join(dir, name), content)
  }
  setup?.(dir)
  const entries = Object.keys(files).filter(name => name.endsWith('.as'))
  const repo = await build({ rootDir: dir, entries, plugins: [tsPlugin()] })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors).toEqual([])
  const js = new Map<string, string>()
  for (const out of await repo.generate({ format: 'js' })) {
    const name = path.relative(dir, out.source).replaceAll('\\', '/')
    js.set(name, out.content)
    if (!into) {
      writeFileSync(path.join(dir, `${name}.js`), patch(out.content))
    }
  }
  return { dir, js }
}

const minLength = (type: any, prop: string) =>
  type.type.props.get(prop).metadata.get('expect.minLength')?.length

describe('import cycles of mutating annotates', () => {
  it('a cycle of the .as files only (an import whose names are unused) defers nothing', async () => {
    // `a` annotates its own `C`; its import of `b` is unused (dropped from its module), so the
    // generated modules do not import each other: `a`'s annotate applies as it loads, without
    // `a` keeping `b` imported for its side effects (a bundler drops such an import of a
    // `"sideEffects": false` package, and the annotations waited for `b` forever).
    const { dir, js } = await generate({
      'a.as':
        "import { B } from './b'\nexport interface C {\n  y: string\n}\nannotate C {\n  @expect.minLength 3\n  y\n}\n",
      'b.as': "import { C } from './a'\nexport interface B {\n  c: C\n}\n",
    })
    expect(js.get('a.as')).not.toContain('./b.as')
    expect(js.get('a.as')).not.toContain('$m(')
    expect(js.get('a.as')).not.toContain('$mc(')
    expect(js.get('b.as')).not.toContain('$mc(')
    const { C } = await import(path.join(dir, 'a.as.js'))
    expect(minLength(C, 'y')).toBe(3)
    expect(C.validator().validate({ y: 'ab' }, true)).toBe(false)
  })

  it('bundled JSON schemas of a cycle assume its annotates (order found from the imports)', async () => {
    const { dir } = await generate({
      'a.as':
        "import { B } from './b'\n@emit.jsonSchema\nexport interface A {\n  b?: B\n  x: string\n}\nannotate B {\n  @expect.minLength 3\n  y\n}\n",
      'b.as':
        "import { A } from './a'\n@emit.jsonSchema\nexport interface B {\n  a?: A\n  y: string\n}\n",
    })
    const { B } = await import(path.join(dir, 'b.as.js'))
    expect(minLength(B, 'y')).toBe(3)
    expect(B.toJsonSchema().properties.y.minLength).toBe(3)
  })

  it('two cycles of modules named alike in different directories', async () => {
    const cycle = (n: number) => ({
      a: `import { B } from './b'\nexport interface A {\n  x: string\n  b?: B\n}\nannotate B {\n  @expect.minLength ${n}\n  y\n}\n`,
      b: "import { A } from './a'\nexport interface B {\n  y: string\n  a?: A\n}\n",
    })
    const one = cycle(2)
    const two = cycle(4)
    const { dir } = await generate({
      'package.json': '{ "name": "pkg-dirs" }',
      'one/a.as': one.a,
      'one/b.as': one.b,
      'two/a.as': two.a,
      'two/b.as': two.b,
    })
    // Loaded one after the other, then interleaved: each cycle's annotations apply to its own.
    const b1 = (await import(path.join(dir, 'one/b.as.js'))).B
    const b2 = (await import(path.join(dir, 'two/a.as.js'))).A.type.props.get('b')
    expect(minLength(b1, 'y')).toBe(2)
    expect(minLength(b2, 'y')).toBe(4)
  })

  it('cycles at the same paths of two packages (one importing the other)', async () => {
    // Package `y` (built on its own) and app `x` importing it each have `src/a.as` ↔
    // `src/b.as`: the same paths from their roots, two cycles evaluated interleaved.
    const label = (name: string, prop: string, value: string) =>
      `annotate ${name} {\n  @meta.label "${value}"\n  ${prop}\n}\n`
    const y = await generate({
      'package.json': '{ "name": "y", "type": "module" }',
      'src/a.as': `import { YB } from './b'\nexport interface YA {\n  b?: YB\n  name: string\n}\n${label('YA', 'name', 'YA')}`,
      'src/b.as': `import { YA } from './a'\nexport interface YB {\n  a?: YA\n  title: string\n}\n${label('YB', 'title', 'YB')}`,
    })
    const x = await generate(
      {
        'package.json': '{ "name": "x", "type": "module" }',
        'src/a.as': `import { B } from './b'\nimport { YA } from 'y/src/a'\nexport interface A {\n  b?: B\n  ya?: YA\n  name: string\n}\n${label('A', 'name', 'XA')}`,
        'src/b.as': `import { A } from './a'\nexport interface B {\n  a?: A\n  title: string\n}\n${label('B', 'title', 'XB')}`,
      },
      dir => symlinkSync(y.dir, path.join(mkdirP(path.join(dir, 'node_modules')), 'y'), 'dir'),
      // The test runner resolves `.as` imports next to their importer.
      code => code.replace('"y/src/a.as"', () => JSON.stringify(path.join(y.dir, 'src/a.as')))
    )
    const { A } = await import(path.join(x.dir, 'src/a.as.js'))
    const { B } = await import(path.join(x.dir, 'src/b.as.js'))
    const { YA } = await import(path.join(y.dir, 'src/a.as.js'))
    const { YB } = await import(path.join(y.dir, 'src/b.as.js'))
    const meta = (type: any, prop: string) => type.type.props.get(prop).metadata.get('meta.label')
    // Applied synchronously, once the modules are loaded.
    expect([meta(A, 'name'), meta(B, 'title'), meta(YA, 'name'), meta(YB, 'title')]).toEqual([
      'XA',
      'XB',
      'YA',
      'YB',
    ])
  })

  it('the same cycle of two projects without a named package, loaded together', async () => {
    const files = {
      'a.as':
        "import { B } from './b'\nexport interface A {\n  b?: B\n}\nannotate B {\n  @expect.minLength 2\n  y\n}\n",
      'b.as': "import { A } from './a'\nexport interface B {\n  y: string\n  a?: A\n}\n",
    }
    const one = await generate(files, dir => writeFileSync(path.join(dir, 'package.json'), '{}'))
    const other = await generate(files, dir => writeFileSync(path.join(dir, 'package.json'), '{}'))
    expect(minLength((await import(path.join(one.dir, 'b.as.js'))).B, 'y')).toBe(2)
    // The same cycle of two such projects, loaded together: each applies to its own types.
    expect(
      minLength((await import(path.join(other.dir, 'a.as.js'))).A.type.props.get('b'), 'y')
    ).toBe(2)
  })
})

describe('generated code of an import cycle, by cycle size', () => {
  const LARGE = !!process.env.ATSCRIPT_LARGE_TESTS
  const PER_MODULE = 600
  const PER_IMPORT = 40
  const TOPOLOGIES: Record<
    string,
    { sizes: number[]; imports: (i: number, n: number) => number[] }
  > = {
    ring: { sizes: LARGE ? [3, 64, 512] : [3, 32, 128], imports: (i, n) => [(i + 1) % n] },
    star: {
      sizes: LARGE ? [3, 64, 512] : [3, 32, 128],
      imports: (i, n) => (i === 0 ? Array.from({ length: n - 1 }, (_, k) => k + 1) : [0]),
    },
    full: {
      sizes: LARGE ? [3, 16, 64] : [3, 8, 24],
      imports: (i, n) => Array.from({ length: n }, (_, k) => k).filter(k => k !== i),
    },
  }

  /** The modules of a cycle: module 0 annotates a type of module 1 when `annotate`. */
  const files = (n: number, imports: (i: number) => number[], annotate: boolean) => {
    const out: Record<string, string> = { 'package.json': '{ "name": "pkg-size" }' }
    for (let i = 0; i < n; i++) {
      const deps = imports(i)
      const lines = deps.map(j => `import { T${j} } from './m${j}'`)
      lines.push(
        `export interface T${i} {`,
        '  v: string',
        ...deps.map(j => `  t${j}?: T${j}`),
        '}'
      )
      if (annotate && i === 0) {
        lines.push('annotate T1 {', '  @expect.minLength 2', '  v', '}')
      }
      out[`m${i}.as`] = `${lines.join('\n')}\n`
    }
    return out
  }

  for (const [name, topology] of Object.entries(TOPOLOGIES)) {
    it(
      `${name}: what the annotate adds to a module is bounded by its imports`,
      { timeout: 600_000 },
      async () => {
        const report: string[] = []
        for (const n of topology.sizes) {
          const imports = (i: number) => topology.imports(i, n)
          const plain = await generate(files(n, imports, false))
          const annotated = await generate(files(n, imports, true))
          let worst = 0
          for (let i = 0; i < n; i++) {
            const added = annotated.js.get(`m${i}.as`)!.length - plain.js.get(`m${i}.as`)!.length
            const bound = PER_MODULE + PER_IMPORT * imports(i).length
            expect([name, n, `m${i}`, added <= bound]).toEqual([name, n, `m${i}`, true])
            worst = Math.max(worst, added / bound)
          }
          // (the annotate applies, whichever module is imported first)
          await import(path.join(annotated.dir, `m${n - 1}.as.js`))
          const { T1 } = await import(path.join(annotated.dir, 'm1.as.js'))
          expect(minLength(T1, 'v')).toBe(2)
          report.push(`${n}: ${Math.round(worst * 100)}% of the bound`)
        }
        console.info(`[cycle bytes] ${name}: ${report.join(', ')}`)
      }
    )
  }
})

// A document parsed again with the same text (a dev server's load of a module its importer
// opened from disk, an editor opening it) has new nodes: what was derived from the old ones
// (the cycle's block ranks, the renderers of its modules) is derived again (H1).
describe('a document of an import cycle parsed again with the same text', () => {
  it('renders the same, also with bundled JSON schemas', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-reparse-'))
    dirs.push(dir)
    const A =
      "import { B } from './b'\nexport interface A {\n  b?: B\n  x: string\n  y: string\n}\n" +
      "annotate A {\n  @meta.label 'fromA-y'\n  y\n}\nannotate A {\n  @meta.label 'fromA'\n  x\n}\n"
    const B =
      "import { A } from './a'\nexport interface B {\n  a?: A\n}\nannotate A {\n  @meta.label 'fromB'\n  x\n}\n"
    writeFileSync(path.join(dir, 'a.as'), A)
    writeFileSync(path.join(dir, 'b.as'), B)
    for (const jsonSchema of [false, 'bundle'] as const) {
      const repo = new AtscriptRepo(dir, { rootDir: dir, plugins: [tsPlugin({ jsonSchema })] })
      const b = await repo.openDocument(`file://${path.join(dir, 'b.as')}`)
      await repo.checkDoc(b)
      const first = (await b.render('js'))![0].content
      b.update(B)
      await repo.checkDoc(b)
      expect((await b.render('js'))![0].content).toBe(first)
    }
  })
})

// A merged prop whose type shares a node of a class of the other module of an import cycle: the
// merged prop may be linked before that shared slot's node is there (CommonJS evaluation of the
// cycle) — it is merged once the node is, not over the slot's placeholder (an `any` left behind).
describe('a merged prop sharing a node of a class an import cycle has not built yet', () => {
  // (r26 s6) The merge `S0 & T0` (m1.as) merges `S0.a: S0 | string` with `T0.a: { … }`: a union
  // holding objects merged with an object is unmergeable, `never` (MODEL §5, §12 Q5/Q6 — core's
  // rule), so the merge does not recurse through it and has no union member on a recursion cycle
  // (s5 expected the §6 error, from `S0 | string` counted as no union). It builds; the import cycle
  // is evaluated as native ESM only (MODEL §11 Q1 revised).
  it('builds, and holds every shared node once both modules are evaluated (native ESM)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-cycle-share-'))
    dirs.push(dir)
    const fixtures = path.join(__dirname, 'fixtures', 'cycle-share')
    for (const file of ['m0.as', 'm1.as']) {
      copyFileSync(path.join(fixtures, file), path.join(dir, file))
    }
    const repo = await build({ rootDir: dir, entries: ['m0.as', 'm1.as'], plugins: [tsPlugin()] })
    const errors = [...(await repo.diagnostics()).entries()].flatMap(([id, msgs]) =>
      msgs.filter(m => m.severity === 1).map(m => `${path.basename(id)}: ${m.message}`)
    )
    expect(errors).toEqual([])
    // (the nodes left untyped: none)
    const read = `(() => { const out = []; const seen = new Set(); const walk = (n, p) => { if (!n || seen.has(n)) return; seen.add(n); const t = n.type; if (!t || (t.kind === '' && t.designType === 'any')) out.push(p); else if (t.kind === 'object') for (const [k, v] of t.props) walk(v, p + '.' + k); else if (t.kind === 'array') walk(t.of, p + '[]'); else if (t.items) t.items.forEach((v, i) => walk(v, p + '<' + i + '>')) }; for (const [n, t] of Object.entries(m)) walk(t, n); return out })()`
    expect(await loadCycleBothModes(dir, repo, read)).toEqual(inEveryLoad([]))
  })
})

describe('an `as` copy whose path reaches a bare alias of the other module of an import cycle', () => {
  // (r26 s6, pins `fixed:cycle-alias-element`, oracle/fails/3992-g4: r25 left `X0.kids[]`
  // undefined — 'Unknown type "undefined"' — when `P1 = I3`, a bare alias of the other module of
  // the cycle, typed the array; the next format: a bare alias IS its target, MODEL §10 D3)
  it('types the element by the target, with the copy’s entry on it, in every load order', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-cycle-alias-element-'))
    dirs.push(dir)
    writeFileSync(
      path.join(dir, 'm0.as'),
      "import { I3 } from './m1'\n\nexport type P1 = I3\nexport type S0 = string\n"
    )
    writeFileSync(
      path.join(dir, 'm1.as'),
      [
        "import { P1, S0 } from './m0'",
        'export interface I3 {\n  a: string\n}',
        'export type M0 = I2 & I0',
        'export annotate I0 as X0 {\n  @expect.maxLength 3\n  b\n  @expect.maxLength 5\n  kids.a\n}',
        'export interface I2 {\n  b: string\n}',
        'export interface I0 {\n  b: S0\n  kids?: P1[]\n}',
      ].join('\n')
    )
    const repo = await build({ rootDir: dir, entries: ['m0.as', 'm1.as'], plugins: [tsPlugin()] })
    const read = `(() => { const el = m.X0.type.props.get('kids').type.of; const v = m.X0.validator(); return [el.type.kind, el.id, el.type.props.get('a').metadata.get('expect.maxLength')?.length, v.validate({ b: 'x', kids: [{ a: '123456' }] }, true), v.validate({ b: 'x', kids: [{ a: '12345' }] }, true)] })()`
    expect(await loadCycleBothModes(dir, repo, read)).toEqual(
      inEveryLoad(['object', 'I3', 5, false, true])
    )
  })
})

describe('a path override shell over an annotated-alias reference of the other module of an import cycle', () => {
  // (r26 s7, v4/41: the shell was made before the reference's `$alias` statement ran and kept
  // the placeholder's id/ref; a shell reads them through its base, like its def — MODEL §4)
  it('carries the alias id and its reference in every load order', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-cycle-shell-alias-ref-'))
    dirs.push(dir)
    writeFileSync(
      path.join(dir, 'm0.as'),
      [
        "import { I1 } from './m1'",
        "@meta.label 'L3'\nexport type P0 = (I1)",
        'export interface I2 {\n  home: P0\n}',
      ].join('\n')
    )
    writeFileSync(
      path.join(dir, 'm1.as'),
      [
        "import { I2 } from './m0'",
        'export interface I1 {\n  a: string\n}',
        'export interface I0 {\n  kids?: I2[]\n}',
        "annotate I0 {\n  @meta.label 'X'\n  kids.home.a\n}",
      ].join('\n')
    )
    const repo = await build({ rootDir: dir, entries: ['m0.as', 'm1.as'], plugins: [tsPlugin()] })
    const read = `(() => { const h = m.I0.type.props.get('kids').type.of.type.props.get('home'); return [h.id, typeof h.ref?.type, h.metadata.get('meta.label'), h.type.props.get('a').metadata.get('meta.label'), m.I2.type.props.get('home').type.props.get('a').metadata.get('meta.label') ?? null] })()`
    expect(await loadCycleBothModes(dir, repo, read)).toEqual(
      inEveryLoad(['P0', 'function', 'L3', 'X', null])
    )
  })
})

/**
 * The evaluation modes import cycles are guaranteed under: native ESM only (MODEL §11 Q1 revised:
 * no CommonJS cycle test; it was `['esm', 'cjs']`).
 */
const cycleModes = ['esm'] as const

/**
 * Writes the generated modules of a two-module import cycle once per evaluation mode, into
 * `dir/esm` (importing the bundled runtime) and `dir/cjs` (importing the runtime's sources), then
 * loads them in both orders: native ESM in a plain `node` process, and CommonJS under `tsx` (which
 * evaluates the `.js` files of a directory without a package.json as CommonJS). `read` is
 * JavaScript that reads `m` (both modules' exports) and evaluates to the value to compare.
 * Returns that value per mode and first module; asserts each run really used its mode.
 */
async function loadCycleBothModes(dir: string, repo: BuildRepo, read: string) {
  const outs = await repo.generate({ format: 'js' })
  const root = path.resolve(__dirname, '../../../..')
  const results: Record<string, unknown> = {}
  for (const mode of cycleModes) {
    const modeDir = mkdirP(path.join(dir, mode))
    const utils = mode === 'esm' ? utilsBundle : path.resolve(__dirname, '../utils.ts')
    for (const out of outs) {
      writeFileSync(
        path.join(modeDir, `${path.basename(out.source)}.js`),
        out.content
          .replaceAll('"@atscript/typescript/utils"', JSON.stringify(utils))
          .replace(/from "\.\/(m\d)\.as"/g, 'from "./$1.as.js"')
      )
    }
    for (const first of ['m0', 'm1']) {
      const second = first === 'm0' ? 'm1' : 'm0'
      const loader = path.join(modeDir, `load-${first}.mjs`)
      writeFileSync(
        loader,
        [
          "import { realpathSync } from 'fs'",
          "import { createRequire } from 'module'",
          "import { pathToFileURL } from 'url'",
          "for (const k of ['BLUE','BOLD','BOLD_OFF','COLOR_OFF','CYAN','DIM','DIM_OFF','GREEN','RED','RESET','UNDERSCORE','UNDERSCORE_OFF','YELLOW']) globalThis['__DYE_' + k + '__'] ??= ''",
          `const files = ${JSON.stringify([first, second].map(m => path.join(modeDir, `${m}.as.js`)))}`,
          'const a = await import(pathToFileURL(files[0]).href)',
          'const b = await import(pathToFileURL(files[1]).href)',
          // (modules evaluated as CommonJS are in the require cache, by real path; ES modules are not)
          'const cache = createRequire(import.meta.url).cache',
          'const cached = files.filter(f => realpathSync(f) in cache).length',
          "const evaluated = cached === 2 ? 'cjs' : cached ? 'mixed' : 'esm'",
          'const m = { ...a, ...b }',
          `console.log(JSON.stringify({ evaluated, value: ${read} }))`,
        ].join('\n')
      )
      const run =
        mode === 'esm'
          ? spawnSync(process.execPath, [loader], { encoding: 'utf8', cwd: root })
          : spawnSync(
              path.join(root, 'node_modules/.bin/tsx'),
              ['--tsconfig', path.join(root, 'tsconfig.base.json'), loader],
              { encoding: 'utf8', cwd: root }
            )
      const label = `${mode} ${first}`
      expect(run.stderr, label).not.toMatch(/Error/)
      const line = JSON.parse(run.stdout.trim().split('\n').at(-1)!)
      expect(line.evaluated, label).toBe(mode)
      results[label] = line.value
    }
  }
  return results
}

/** `expected` for every mode and first module. */
const inEveryLoad = (expected: unknown) =>
  Object.fromEntries(
    cycleModes.flatMap(mode => ['m0', 'm1'].map(first => [`${mode} ${first}`, expected]))
  )

// Chain references to a field typed by a class of the other module of an import cycle (CH-TDZ,
// round 23): the field is a reference in its dead zone while the cycle loads — the chain binds
// once it can be read (each module first; native ESM and CommonJS evaluation).
describe('chain references across an import cycle', () => {
  it('load in every order, with the field’s annotations and type', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-cycle-chain-'))
    dirs.push(dir)
    writeFileSync(
      path.join(dir, 'm0.as'),
      "import { WP } from './m1'\nexport interface I0 {\n  @meta.label 'I0.n'\n  n?: 2\n}\nexport interface CH0 {\n  @meta.label 'CH0.r'\n  r?: WP.s\n  q?: WP.s\n}\n@meta.label 'I0-class'\nannotate I0 {}\n"
    )
    writeFileSync(
      path.join(dir, 'm1.as'),
      "import { I0 } from './m0'\nexport interface WP {\n  @meta.label 'WP.s'\n  s?: I0\n}\n@meta.label 'CL0'\nexport type CL0 = WP.s\n"
    )
    const repo = await build({ rootDir: dir, entries: ['m0.as', 'm1.as'], plugins: [tsPlugin()] })
    const results = await loadCycleBothModes(
      dir,
      repo,
      "(() => { const r = m.CH0.type.props.get('r'); const label = n => n.metadata.get('meta.label') ?? '-'; return [label(r), label(m.CL0), label(m.CH0.type.props.get('q')), label(r.type.props.get('n')), label(m.CL0.type.props.get('n')), m.CH0.validator().validate({ r: { n: 3 } }, true), m.CH0.validator().validate({ r: { n: 2 } }, true), m.CL0.validator().validate({ n: 3 }, true)] })()"
    )
    expect(results).toEqual(
      inEveryLoad([
        // (their own annotations over the field's, whatever loads first)
        'CH0.r',
        'CL0',
        'WP.s',
        'I0.n',
        'I0.n',
        false,
        true,
        false,
      ])
    )
  }, 90_000)

  it('each module’s chain to a field of the other (a foreign key both ways) builds both', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-cycle-chain2-'))
    dirs.push(dir)
    writeFileSync(
      path.join(dir, 'm0.as'),
      "import { B } from './m1'\nexport interface A {\n  @meta.label 'A.id'\n  id: number\n  @meta.label 'A.bId'\n  bId?: B.id\n}\n"
    )
    writeFileSync(
      path.join(dir, 'm1.as'),
      "import { A } from './m0'\nexport interface B {\n  @expect.maxLength 3\n  id: string\n  aId?: A.id\n}\n"
    )
    const repo = await build({ rootDir: dir, entries: ['m0.as', 'm1.as'], plugins: [tsPlugin()] })
    const results = await loadCycleBothModes(
      dir,
      repo,
      "(() => { const a = m.A.type.props.get('bId'); const b = m.B.type.props.get('aId'); return [a.type.designType, a.metadata.get('meta.label'), a.metadata.get('expect.maxLength')?.length, a.optional, b.type.designType, b.metadata.get('meta.label'), a.ref.field, m.A.validator().validate({ id: 1, bId: 'abcd' }, true), m.B.validator().validate({ id: 'a', aId: 2 }, true)] })()"
    )
    expect(results).toEqual(
      inEveryLoad(['string', 'A.bId', 3, true, 'number', 'A.id', 'id', false, true])
    )
  }, 90_000)
})

describe('a lazy alias read before it is bound', () => {
  // `type P0 = I0` in one module of an import cycle, `work: P0` in the other: a reference bound
  // to P0 before P0's own `$alias` ran shares its unfilled def — a block's path through it
  // (`next.work.work.b`) threw `Cannot read properties of undefined (reading 'metadata')` at
  // load when the alias's module loaded first (oracle seed 377). Native ESM and CommonJS evaluation.
  it('settles it before a path or a follower reads it, in every order', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-cycle-lazy-alias-'))
    dirs.push(dir)
    writeFileSync(path.join(dir, 'm0.as'), "import { I0 } from './m1'\n\nexport type P0 = I0\n")
    writeFileSync(
      path.join(dir, 'm1.as'),
      "import { P0 } from './m0'\n\nexport interface I0 {\n  work: {\n    b: string\n  }\n}\nexport interface I1 {\n  next?: I1\n  work: P0\n}\nexport type M0 = I1 & {\n  work?: {\n    c: string\n  }\n}\nannotate M0 {\n  @expect.pattern '^[^k]*$'\n  next.work.work.b\n}\n"
    )
    const repo = await build({ rootDir: dir, entries: ['m0.as', 'm1.as'], plugins: [tsPlugin()] })
    const results = await loadCycleBothModes(
      dir,
      repo,
      "(() => { const at = (n, p) => p.split('.').reduce((x, k) => x.type.props.get(k), n); const pattern = n => JSON.stringify(n.metadata.get('expect.pattern') ?? '-'); const value = b => ({ work: { work: { b: 'a' }, c: 'a' }, next: { work: { work: { b } } } }); return [pattern(at(m.M0, 'next.work.work.b')), pattern(at(m.M0, 'work.work.b')), pattern(at(m.P0, 'work.b')), m.M0.validator().validate(value('ak'), true), m.M0.validator().validate(value('ab'), true)] })()"
    )
    expect(results).toEqual(inEveryLoad(['[{"pattern":"^[^k]*$"}]', '"-"', '"-"', false, true]))
  }, 90_000)
})

// A block on an `as` copy of a declaration whose root is a union (`N0 = I2 | null`, `annotate N0
// as X0 {}`, `annotate X0 { work.e }`): the copy has its target's structure, so the path goes
// through the root's non-null item. Its step was dropped: the module threw "type not built yet"
// at load, and in an import cycle the block was silently never applied (oracle seed 7517).
describe('a block on an `as` copy of a union root', () => {
  const types =
    "export interface I1 {\n  @expect.pattern '^[^z]*$'\n  e: string\n}\nexport interface I2 {\n  c: string\n  work: I1\n}\n"
  const block = "annotate X0 {\n  @expect.pattern '^[^q]*$'\n  work.e\n}\n"
  const read = `(() => { const obj = n => n.type.kind === 'object' ? n : n.type.items.find(i => i.type.kind === 'object'); const e = n => obj(n).type.props.get('work').type.props.get('e'); const patterns = n => (e(n).metadata.get('expect.pattern') ?? []).map(p => p.pattern).join(' '); const ok = (n, s) => n.validator().validate({ c: 'a', work: { e: s } }, true); return [patterns(m.X0), patterns(m.I2), patterns(m.N0), ok(m.X0, 'q'), ok(m.X0, 'z'), ok(m.X0, 'a'), m.X0.validator().validate(null, true), ok(m.N0, 'q')] })()`
  const expected = ['^[^z]*$ ^[^q]*$', '^[^z]*$', '^[^z]*$', false, false, true, true, true]

  it.each([
    ['the union itself', 'export type N0 = I2 | null\nexport annotate N0 as X0 {}\n'],
    [
      'an alias of it',
      'export type N0 = I2 | null\nexport type M1 = N0\nexport annotate M1 as X0 {}\n',
    ],
    [
      'a merge of it',
      'export type N0 = I2 | null\nexport type M1 = N0 & N0\nexport annotate M1 as X0 {}\n',
    ],
  ])('copy of %s: the block applies at load', async (_, decls) => {
    const { dir } = await generate({ 'm.as': `${types}${decls}${block}` })
    const m = await import(path.join(dir, 'm.as.js'))
    expect(runInNewContext(read, { m })).toEqual(expected)
  })

  it('a copy of a copy (`X0 as Y0`): the block on Y0 applies at load, X0 keeps its own', async () => {
    const { dir } = await generate({
      'm.as': `${types}export type N0 = I2 | null\nexport annotate N0 as W0 {}\nexport annotate W0 as X0 {}\n${block}`,
    })
    const m = await import(path.join(dir, 'm.as.js'))
    expect(runInNewContext(read, { m })).toEqual(expected)
    expect(runInNewContext(read, { m: { ...m, X0: m.W0 } })[0]).toBe('^[^z]*$')
  })

  it('the block of the other module of an import cycle applies in every load order', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-cycle-as-union-root-'))
    dirs.push(dir)
    writeFileSync(
      path.join(dir, 'm0.as'),
      `import { N0 } from './m1'\n${types}export type M1 = N0 & N0\nexport annotate M1 as X0 {\n  @meta.label 'L17'\n  c\n}\n`
    )
    writeFileSync(
      path.join(dir, 'm1.as'),
      `import { I2, X0 } from './m0'\nexport type N0 = I2 | null\n${block}`
    )
    const repo = await build({ rootDir: dir, entries: ['m0.as', 'm1.as'], plugins: [tsPlugin()] })
    expect(await loadCycleBothModes(dir, repo, read)).toEqual(inEveryLoad(expected))
  }, 90_000)
})
