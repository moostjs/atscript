import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { rolldown } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import atscript from './adapters/rolldown'
import { unpluginFactory } from './index'

// Regression: declaration bundlers (rolldown-plugin-dts / tsdown) resolve the
// imports of generated .d.ts modules through the same plugin container. Serving
// the JS render there bound re-exported .as symbols to a JS chunk, shipping
// them untyped (e.g. `import { t as AsWfStateRecord } from "./chunk.mjs"`).

describe('dts bundling of .as re-exports', () => {
  let dir: string
  const cwd = process.cwd()

  beforeAll(() => {
    // A directory whose ancestry contains NO atscript.config.* file.
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-dts-'))
    process.chdir(dir)
    writeFileSync(
      path.join(dir, 'user.as'),
      'export interface User {\n  id: string\n  name: string\n}\n'
    )
    writeFileSync(path.join(dir, 'index.ts'), "export { User } from './user.as'\n")
  })

  afterAll(() => {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('resolves .as imports to .as.d.ts ids only for declaration importers', () => {
    const plugin = unpluginFactory(undefined, {} as never)
    const resolveId = plugin.resolveId as (id: string, importer?: string) => unknown
    expect(resolveId.call(plugin, './user.as', path.join(dir, 'index.d.ts'))).toBe(
      path.join(dir, 'user.as.d.ts')
    )
    expect(resolveId.call(plugin, './user.as', path.join(dir, 'index.d.mts'))).toBe(
      path.join(dir, 'user.as.d.ts')
    )
    expect(resolveId.call(plugin, './user.as', path.join(dir, 'index.ts'))).toBe(
      path.join(dir, 'user.as')
    )
  })

  it('serves a fresh dts render for .as.d.ts ids, without the .as reference directive', async () => {
    const plugin = unpluginFactory(undefined, {} as never)
    const load = plugin.load as (id: string) => Promise<{ code: string; moduleType?: string }>
    const result = await load.call(plugin, path.join(dir, 'user.as.d.ts'))
    expect(result.code).toContain('export declare class User')
    expect(result.code).not.toContain('<reference path=')
    expect(result.moduleType).toBeUndefined()
  })

  it('bundles the declaration instead of a type-import against the JS chunk', async () => {
    const bundle = await rolldown({
      input: [path.join(dir, 'index.ts')],
      plugins: [atscript(), dts({ oxc: true })],
    })
    const { output } = await bundle.generate({ format: 'es' })

    const dtsCode = output
      .filter(c => c.type === 'chunk' && c.fileName.endsWith('.d.ts'))
      .map(c => (c as { code: string }).code)
      .join('\n')
    // The bundler re-renders `export declare class User` as a declaration plus
    // a separate `export { User }` statement.
    expect(dtsCode).toContain('declare class User')
    expect(dtsCode).toContain('id: string')
    expect(dtsCode).toMatch(/export\s*\{[^}]*\bUser\b[^}]*\}/)
    // The original symptom: a type-position import against an untyped JS chunk.
    expect(dtsCode).not.toMatch(/from\s*["'][^"']*\.[cm]?js["']/)

    const jsCode = output
      .filter(c => c.type === 'chunk' && !c.fileName.endsWith('.d.ts'))
      .map(c => (c as { code: string }).code)
      .join('\n')
    expect(jsCode).toContain('User')
  })
})
