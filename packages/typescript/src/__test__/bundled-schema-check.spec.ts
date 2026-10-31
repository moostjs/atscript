import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * A bundled JSON schema is used while the block modules the runtime applied are exactly those it
 * was built with (MODEL §12 Q10; their load order does not matter: blocks rank statically, §7);
 * otherwise the runtime's schema is (see `bundledSchemaOf`): equal either way.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const marker = (name: string) => `export interface ${name} {\n  m?: string\n}\n`

async function load(first: 'b1' | 'b2') {
  const second = first === 'b1' ? 'b2' : 'b1'
  const files: Record<string, string> = {
    't.as': 'export interface T {\n  name: string\n  tags: string[]\n}\n',
    'b1.as': `import { T } from './t'\nannotate T {\n  @expect.minLength 3\n  name\n}\n${marker('M1')}`,
    'b2.as': `import { T } from './t'\nannotate T {\n  @expect.minLength 1\n  tags\n}\n${marker('M2')}`,
    'u.as': [
      "import { T } from './t'",
      `import { ${first === 'b1' ? 'M1' : 'M2'} } from './${first}'`,
      `import { ${second === 'b1' ? 'M1' : 'M2'} } from './${second}'`,
      'export interface U {\n  t: T\n  m1?: M1\n  m2?: M2\n}',
      'export interface E extends T {\n  e?: string\n}',
    ].join('\n'),
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-bundled-check-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({ jsonSchema: 'bundle' })],
  })
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  vi.resetModules()
  const u = await import(path.join(dir, 'u.as.js'))
  const t = await import(path.join(dir, 't.as.js'))
  // (the runtime the generated modules loaded, after `resetModules`)
  const { bundledSchemaSource } = await import('../runtime/bundled-schema')
  const { buildJsonSchema } = await import('../runtime/json-schema')
  const out: Record<string, string | undefined> = {}
  for (const [name, type] of [
    ['T', t.T],
    ['U', u.U],
    ['E', u.E],
  ] as const) {
    expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
    out[name] = bundledSchemaSource(type)
  }
  return out
}

describe('bundled JSON schemas checked against the blocks the runtime applied', () => {
  it('bundled whatever order the block modules load in', async () => {
    // (the build's realm loads the build's modules in module order: b1, then b2)
    expect(await load('b1')).toEqual({ T: 'bundled', U: 'bundled', E: 'bundled' })
    // (U's module imports b2 first: the same blocks, ranked statically — it was the runtime's)
    expect(await load('b2')).toEqual({ T: 'bundled', U: 'bundled', E: 'bundled' })
  })
})
