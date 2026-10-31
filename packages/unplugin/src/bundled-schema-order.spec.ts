import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { unplugin } from './index'

/*
 * Bundled JSON schemas (`jsonSchema: 'bundle'`) are what the runtime builds (`buildJsonSchema`)
 * from the loaded types, whatever order the app loads the modules in — the module declaring a
 * type, the modules annotating it (mutating blocks of another file's type), the modules using
 * it — in dev (a module runner, `ssrLoadModule`: each module transformed when first imported)
 * and in a build: every load order of the modules × the three ways. A module transformed
 * before the blocks of another file of its type were seen bundles a schema without them; the
 * runtime has them once their modules load.
 */

/** Vite as vitest resolves it (not a dependency of this package). */
const viteEntry = createRequire(
  createRequire(import.meta.url).resolve('vitest/package.json')
).resolve('vite')
const UTILS = path.resolve(__dirname, '../../typescript/src/utils.ts')
const TS_PLUGIN = path.resolve(__dirname, '../../typescript/src/index.ts')

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

const marker = (name: string) => `export interface ${name} {\n  m?: string\n}\n`

/** The `.as` files: a type, two files annotating it, a file using it (importing both). */
const FILES: Record<string, string> = {
  't.as': 'export interface T {\n  name: string\n  tags: string[]\n  note?: string\n}\n',
  'b1.as': `import { T } from './t'\nannotate T {\n  @expect.minLength 3\n  name\n}\n${marker('M1')}`,
  'b2.as': `import { T } from './t'\n@meta.description 'annotated'\nannotate T {\n  @expect.maxLength 5\n  name\n  @expect.minLength 1\n  tags\n  @expect.pattern '^n'\n  note\n}\n${marker('M2')}`,
  'u.as': [
    "import { T } from './t'",
    "import { M1 } from './b1'",
    "import { M2 } from './b2'",
    'export interface U {\n  t: T\n  m1?: M1\n  m2?: M2\n}',
    'export interface E extends T {\n  e?: string\n}',
    'export type AL = T',
  ].join('\n'),
}

/** The modules the entry imports, in every order. */
const MODULES = ['t', 'b1', 'b2', 'u']

function permutations<T>(items: T[]): T[][] {
  return items.length <= 1
    ? [items]
    : items.flatMap((item, i) =>
        permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest])
      )
}

/** The entry: imports the modules in `order`; `probe()` compares every type's schemas. */
function entry(order: string[]): string {
  return [
    "import { buildJsonSchema } from '@atscript/typescript/utils'",
    ...order.map(m => `import * as ${m} from './${m}.as'`),
    `const modules = { ${order.join(', ')} }`,
    'export const probe = () => {',
    '  const out = {}',
    '  for (const [file, mod] of Object.entries(modules)) {',
    '    for (const [name, type] of Object.entries(mod)) {',
    '      if (!type?.__is_atscript_annotated_type) continue',
    '      const bundled = JSON.stringify(type.toJsonSchema())',
    '      const runtime = JSON.stringify(buildJsonSchema(type))',
    '      out[file + "." + name] = bundled === runtime ? "same" : "bundled " + bundled + " runtime " + runtime',
    '    }',
    '  }',
    '  return out',
    '}',
  ].join('\n')
}

type TMode = 'runner' | 'ssrLoadModule' | 'build'

async function probe(order: string[], mode: TMode): Promise<Record<string, string>> {
  const vite = (await import(viteEntry)) as typeof import('vite')
  const root = mkdtempSync(path.join(__dirname, '.vite-bundled-schema-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'src'))
  for (const [name, content] of Object.entries(FILES)) {
    writeFileSync(path.join(root, 'src', name), content)
  }
  writeFileSync(path.join(root, 'src/entry.ts'), entry(order))
  writeFileSync(
    path.join(root, 'atscript.config.mjs'),
    `import ts from ${JSON.stringify(pathToFileURL(TS_PLUGIN).href)}\nexport default { rootDir: 'src', plugins: [ts({ jsonSchema: 'bundle' })] }\n`
  )
  const config = {
    root,
    configFile: false as const,
    logLevel: 'silent' as const,
    resolve: { alias: { '@atscript/typescript/utils': UTILS } },
    plugins: [unplugin.vite({ root }) as never],
  }
  if (mode === 'build') {
    const outDir = path.join(root, 'dist')
    await vite.build({
      ...config,
      build: {
        ssr: path.join(root, 'src/entry.ts'),
        outDir,
        minify: false,
        rollupOptions: { output: { format: 'es', entryFileNames: 'entry.mjs' } },
      },
    })
    const app = await import(pathToFileURL(path.join(outDir, 'entry.mjs')).href)
    return app.probe()
  }
  const server = await vite.createServer({
    ...config,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  closers.push(() => server.close())
  if (mode === 'ssrLoadModule') {
    return (await server.ssrLoadModule('/src/entry.ts')).probe()
  }
  const runner = vite.createServerModuleRunner(server.environments.ssr, { hmr: false })
  closers.push(() => runner.close())
  return (await runner.import('/src/entry.ts')).probe()
}

describe('bundled JSON schemas whatever the load order', () => {
  for (const mode of ['runner', 'ssrLoadModule', 'build'] as const) {
    it(`every load order (${mode})`, { timeout: 600_000 }, async () => {
      const problems: string[] = []
      let types = 0
      for (const order of permutations(MODULES)) {
        const out = await probe(order, mode)
        for (const [name, verdict] of Object.entries(out)) {
          types++
          if (verdict !== 'same') {
            problems.push(`${order.join(' ')}: ${name}: ${verdict}`)
          }
        }
      }
      expect(types).toBe(24 * 6)
      expect(problems.slice(0, 10)).toEqual([])
    })
  }
})
