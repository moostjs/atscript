import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The build's load check (MODEL CYCLE-GUARD-6, -7, -8) in real bundler builds of the built
// plugin (`dist`: rebuild it first), each in a process of its own. The build-time realm's runtime
// is made to fail every load of an import cycle's module (its `$end` throws): a build that checks
// fails, one that does not passes.

const pkg = path.resolve(__dirname, '..')
const dirs: string[] = []
let runtime = ''
let dir = ''
let configured = ''
// (the bundlers the repository has: Vite and esbuild through vitest's dependencies)
const fromVitest = createRequire(createRequire(import.meta.url).resolve('vitest/package.json'))
const vite = fromVitest.resolve('vite')
const esbuild = fromVitest.resolve('esbuild')

beforeAll(() => {
  const base = mkdtempSync(path.join(pkg, 'test', '.tmp-load-check-'))
  dirs.push(base)
  const source = readFileSync(
    process.env.ATSCRIPT_REALM_RUNTIME ?? path.resolve(pkg, '../typescript/dist/realm-runtime.js'),
    'utf8'
  )
  const patched = source.replace(
    /function \$end\([^)]*\)\s*\{/,
    m => `${m} throw new Error("load check ran");`
  )
  expect(patched).not.toBe(source)
  runtime = path.join(base, 'realm-runtime.js')
  writeFileSync(runtime, patched)
  dir = path.join(base, 'proj')
  execFileSync('mkdir', ['-p', dir])
  writeFileSync(
    path.join(dir, 'a.as'),
    `import { B } from './b'\nexport interface A {\n  b?: B\n  x: string\n}\n`
  )
  writeFileSync(
    path.join(dir, 'b.as'),
    `import { A } from './a'\nexport interface B {\n  a?: A\n  y: string\n}\n`
  )
  writeFileSync(path.join(dir, 'main.js'), `export { A } from './a.as'\n`)
  // (the same project with a config file: its `tsPlugin` is the ESM copy of
  // `@atscript/typescript`, the plugin loaded through `require` uses the CommonJS one)
  configured = path.join(base, 'configured')
  execFileSync('cp', ['-R', dir, configured])
  writeFileSync(
    path.join(configured, 'atscript.config.mjs'),
    `import { tsPlugin } from '@atscript/typescript'\nexport default { plugins: [tsPlugin()] }\n`
  )
})

afterAll(() => {
  for (const d of dirs) {
    rmSync(d, { recursive: true, force: true })
  }
})

function buildWith(bundler: string, options: Record<string, unknown> = {}, project = dir): string {
  const out = execFileSync(
    process.execPath,
    [
      path.join(pkg, 'test/load-check-run.mjs'),
      bundler,
      project,
      JSON.stringify(options),
      vite,
      esbuild,
    ],
    { cwd: pkg, env: { ...process.env, ATSCRIPT_REALM_RUNTIME: runtime }, encoding: 'utf8' }
  )
  return out.trim().split('\n').at(-1)!
}

describe('the build load check in real bundler builds', () => {
  it('runs in one-shot Rollup (the plugin loaded through `require`), Rolldown and Vite builds', () => {
    expect(buildWith('rollup-cjs')).toMatch(/^FAILED .*fails to load/)
    expect(buildWith('rollup-cjs', {}, configured)).toMatch(/^FAILED .*fails to load/)
    expect(buildWith('rolldown')).toMatch(/^FAILED .*fails to load/)
    expect(buildWith('vite-build')).toMatch(/^FAILED .*fails to load/)
  })

  it('does not run in watch builds nor on the Vite dev server', () => {
    expect(buildWith('vite-watch')).toBe('OK')
    expect(buildWith('rollup-watch')).toBe('OK')
    expect(buildWith('vite-serve')).toBe('OK')
  })

  it('other bundlers: only with `loadCheck: true`; `loadCheck` forces it either way', () => {
    expect(buildWith('esbuild')).toBe('OK')
    expect(buildWith('esbuild', { loadCheck: true })).toMatch(/^FAILED .*fails to load/)
    expect(buildWith('rollup-cjs', { loadCheck: false })).toBe('OK')
    expect(buildWith('vite-serve', { loadCheck: true })).toMatch(/^FAILED .*fails to load/)
  })
})
