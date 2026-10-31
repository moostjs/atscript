import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { build as buildAtscript } from '@atscript/core'
import { tsPlugin } from '@atscript/typescript'
import { rolldown } from 'rolldown'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import atscript from './adapters/rolldown'

// A package of prebuilt `.as.js` modules marked `"sideEffects": false`, its `.as` files a
// cycle (`b` imports `a` without using it): the bundler drops what the bundle does not use —
// an annotate of `b` must not wait for `a`, never part of the bundle.
describe('a prebuilt "sideEffects": false package with a cycle of its .as files', () => {
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'unplugin-atscript-lib-'))
    const lib = path.join(dir, 'node_modules', 'lib')
    mkdirSync(lib, { recursive: true })
    writeFileSync(
      path.join(lib, 'package.json'),
      '{ "name": "lib", "type": "module", "sideEffects": false }'
    )
    writeFileSync(
      path.join(lib, 'a.as'),
      "import { B } from './b'\nexport interface A {\n  b: B\n  x: string\n}\n"
    )
    writeFileSync(
      path.join(lib, 'b.as'),
      "import { A } from './a'\nexport interface B {\n  y: string\n}\nannotate B {\n  @expect.minLength 3\n  y\n}\n"
    )
    const repo = await buildAtscript({
      rootDir: lib,
      entries: ['a.as', 'b.as'],
      plugins: [tsPlugin({ moduleExtension: '.as.js' })],
    })
    for (const out of await repo.generate({ format: 'js' })) {
      writeFileSync(`${out.source}.js`, out.content)
    }
    writeFileSync(
      path.join(dir, 'entry.js'),
      "import { B } from 'lib/b.as.js'\nexport const probe = () => B.type.props.get('y').metadata.get('expect.minLength')\n"
    )
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('applies the annotate in the bundle', async () => {
    const utils = createRequire(import.meta.url).resolve('@atscript/typescript/utils')
    const bundle = await rolldown({
      input: path.join(dir, 'entry.js'),
      cwd: dir,
      plugins: [atscript({ root: dir })],
      resolve: { alias: { '@atscript/typescript/utils': utils } },
      treeshake: true,
    })
    await bundle.write({ dir: path.join(dir, 'dist'), format: 'es', entryFileNames: 'entry.mjs' })
    await bundle.close()
    const { probe } = await import(path.join(dir, 'dist', 'entry.mjs'))
    expect(probe()).toEqual({ length: 3 })
  })
})
