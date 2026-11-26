import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { NAV_PROP_ANNOTATIONS } from '../flatten'

// The `@atscript/core/nav` entry of the built package (`dist`: rebuild it first) loads without
// the compiler: run by Node in a process of its own, inside the package (its name resolves to it
// through its `exports`).

const pkg = path.resolve(__dirname, '../..')

/** What `script` prints (JSON), run as `type` by Node in the package directory. */
function run(type: 'module' | 'commonjs', script: string): any {
  const r = spawnSync(process.execPath, [`--input-type=${type}`, '-e', script], {
    cwd: pkg,
    encoding: 'utf8',
  })
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout)
}

const LIST = ['db.rel.to', 'db.rel.from', 'db.rel.via', 'db.rel.store']

describe('@atscript/core/nav', () => {
  it('is the list the main entry exports', () => {
    expect([...NAV_PROP_ANNOTATIONS]).toEqual(LIST)
  })

  it('imports from ESM, the same list as the main entry', () => {
    const out = run(
      'module',
      `import { NAV_PROP_ANNOTATIONS as nav } from '@atscript/core/nav'
       import { NAV_PROP_ANNOTATIONS as main } from '@atscript/core'
       console.log(JSON.stringify({ list: nav, same: nav === main }))`
    )
    expect(out).toEqual({ list: LIST, same: true })
  })

  it('requires from CJS, loading no other file', () => {
    const out = run(
      'commonjs',
      `const { NAV_PROP_ANNOTATIONS } = require('@atscript/core/nav')
       console.log(JSON.stringify({ list: NAV_PROP_ANNOTATIONS, loaded: Object.keys(require.cache) }))`
    )
    expect(out).toEqual({ list: LIST, loaded: [realpathSync(path.join(pkg, 'dist/nav.cjs'))] })
  })

  it('built files import nothing; the types ship', () => {
    for (const file of ['dist/nav.mjs', 'dist/nav.cjs', 'dist/nav.d.ts']) {
      const code = readFileSync(path.join(pkg, file), 'utf8')
      expect(code, file).not.toMatch(
        /^\s*(import|export)\b[^;]*\bfrom\s*["']|^\s*import\s*["']|\bimport\s*\(|\brequire\s*\(/m
      )
    }
    expect(readFileSync(path.join(pkg, 'dist/nav.d.ts'), 'utf8')).toContain(
      `declare const NAV_PROP_ANNOTATIONS: readonly ${JSON.stringify(LIST).replaceAll(',', ', ')};`
    )
  })
})
