import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The CLI build checks its generated modules' loads (MODEL CYCLE-GUARD-6, -8), with or without a
// config file (whose `tsPlugin` is another copy of this package than the CLI's bundle): the built
// CLI (`dist`: rebuild it first), run in a process of its own. The build-time realm's runtime is
// made to fail every load of an import cycle's module (its `$end` throws).

const pkg = path.resolve(__dirname, '../..')
let base = ''
let failing = ''

beforeAll(() => {
  // (inside the package: a config's `@atscript/typescript` resolves to it)
  base = mkdtempSync(path.join(pkg, 'test', '.tmp-cli-load-check-'))
  const source = readFileSync(path.join(pkg, 'dist/realm-runtime.js'), 'utf8')
  const patched = source.replace(
    /function \$end\([^)]*\)\s*\{/,
    m => `${m} throw new Error("load check ran");`
  )
  expect(patched).not.toBe(source)
  failing = path.join(base, 'realm-runtime.js')
  writeFileSync(failing, patched)
})

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

function project(name: string, config: boolean): string {
  const dir = path.join(base, name)
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  writeFileSync(
    path.join(dir, 'src/a.as'),
    `import { B } from './b'\nexport interface A {\n  b?: B\n  x: string\n}\n`
  )
  writeFileSync(
    path.join(dir, 'src/b.as'),
    `import { A } from './a'\nexport interface B {\n  a?: A\n  y: string\n}\n`
  )
  if (config) {
    writeFileSync(
      path.join(dir, 'atscript.config.mjs'),
      `import { tsPlugin } from '@atscript/typescript'\nexport default { rootDir: 'src', include: ['**/*.as'], plugins: [tsPlugin()] }\n`
    )
  }
  return dir
}

function asc(dir: string, runtime?: string) {
  const env = { ...process.env }
  if (runtime) {
    env.ATSCRIPT_REALM_RUNTIME = runtime
  } else {
    delete env.ATSCRIPT_REALM_RUNTIME
  }
  const r = spawnSync(process.execPath, [path.join(pkg, 'dist/cli.cjs'), '-f', 'js'], {
    cwd: dir,
    env,
    encoding: 'utf8',
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('the CLI build load check', () => {
  it.each([
    ['without a config file', false],
    ['with a config file', true],
  ])('%s: a module that does not load fails the build, nothing is written', (name, config) => {
    const dir = project(`p-${config}`, config)
    const failed = asc(dir, failing)
    expect(failed.status).toBe(1)
    expect(failed.out).toContain('the generated code fails to load')
    expect(existsSync(path.join(dir, 'src/a.as.js'))).toBe(false)
    // (the same build with the real runtime: built)
    const ok = asc(dir)
    expect(ok.status).toBe(0)
    expect(existsSync(path.join(dir, 'src/a.as.js'))).toBe(true)
  })

  it('`withLoadCheck` of one copy of the package checks the renders of another (CommonJS and ESM)', () => {
    const dir = project('api', false)
    const script = `
      const { createRequire } = await import('node:module')
      const require = createRequire(${JSON.stringify(path.join(pkg, 'package.json'))})
      const { withLoadCheck } = require(${JSON.stringify(path.join(pkg, 'dist/index.cjs'))})
      const { tsPlugin } = await import(${JSON.stringify(path.join(pkg, 'dist/index.mjs'))})
      const { build } = await import('@atscript/core')
      const repo = await build({ rootDir: ${JSON.stringify(path.join(dir, 'src'))}, plugins: [tsPlugin()] })
      await repo.generate({ format: 'js' })
      console.log('unwrapped: OK')
      try { await withLoadCheck(() => repo.generate({ format: 'js' })); console.log('wrapped: OK') }
      catch (e) { console.log('wrapped: FAILED ' + e.message.replace(/^.*?: /, '').slice(0, 80)) }
    `
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: pkg,
      env: { ...process.env, ATSCRIPT_REALM_RUNTIME: failing },
      encoding: 'utf8',
    })
    expect(r.stdout.trim().split('\n')).toEqual([
      'unwrapped: OK',
      expect.stringMatching(/^wrapped: FAILED .*the generated code fails to load/),
    ])
  })
})
