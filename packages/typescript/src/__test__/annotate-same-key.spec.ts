import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * Two mutating blocks of different files setting the same single-value annotation on the same
 * prop with different values: the block loaded last wins (no error, no canonical order — load
 * order decides), everywhere: the annotated type, and every type built from it — an alias
 * (`type AL = T`), `extends`, `annotate … as`, a merged intersection — holds the type's own node
 * (types are referenced, never copied). Pinned for both load orders, so that a change of this
 * behaviour is a deliberate one (see the docs: set each annotation in one place).
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const block = (label: string) =>
  `import { T } from './t'\nannotate T {\n  @meta.label '${label}'\n  name\n}\nexport interface M${label} {\n  m?: string\n}\n`

async function load(first: 'a' | 'z') {
  const second = first === 'a' ? 'z' : 'a'
  const files: Record<string, string> = {
    't.as': 'export interface T {\n  name: string\n}\n',
    'a.as': block('A'),
    'z.as': block('Z'),
    'p.as': [
      "import { T } from './t'",
      `import { M${first.toUpperCase()} } from './${first}'`,
      `import { M${second.toUpperCase()} } from './${second}'`,
      `export type U1 = M${first.toUpperCase()}`,
      `export type U2 = M${second.toUpperCase()}`,
      'export interface E extends T {\n  e?: string\n}',
      'export type AL = T',
      'export annotate T as X {}',
      'export type IM = T & { e?: string }',
    ].join('\n'),
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-same-key-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({ rootDir: dir, entries: Object.keys(files), plugins: [tsPlugin()] })
  const problems = [...(await repo.diagnostics()).values()]
    .flat()
    .filter(m => m.severity <= 2)
    .map(m => m.message)
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  vi.resetModules()
  const p = await import(path.join(dir, 'p.as.js'))
  const t = await import(path.join(dir, 't.as.js'))
  const label = (type: any) => type.type.props.get('name').metadata.get('meta.label')
  return {
    problems,
    T: label(t.T),
    AL: label(p.AL),
    E: label(p.E),
    X: label(p.X),
    IM: label(p.IM),
  }
}

describe('two blocks setting the same annotation', () => {
  it('the block loaded last wins, on the type and on every type built from it', async () => {
    // (no error, no warning)
    expect(await load('a')).toEqual({
      problems: [],
      T: 'Z',
      AL: 'Z',
      E: 'Z',
      X: 'Z',
      IM: 'Z',
    })
    // MODEL §7: same-key conflicts resolve by static rank (import depth, module id), not load
    // order: a.as and z.as are both depth 1, so z.as (the higher module id) wins in every order
    expect(await load('z')).toEqual({
      problems: [],
      T: 'Z',
      AL: 'Z',
      E: 'Z',
      X: 'Z',
      IM: 'Z',
    })
  })
})
