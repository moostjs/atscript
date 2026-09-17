import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { TTsPluginOptions } from './plugin'
import { tsPlugin } from './plugin'

// A project whose entry imports one relative module and one bare (packaged) module.
let root: string

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'atscript-module-extension-'))
  const pkg = path.join(root, 'node_modules', 'some-pkg')
  mkdirSync(pkg, { recursive: true })
  writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({ name: 'some-pkg', exports: { './x.as': { atscript: './x.as' } } })
  )
  writeFileSync(path.join(pkg, 'x.as'), 'export interface X {\n  id: string\n}\n')
  writeFileSync(path.join(root, 'b.as'), 'export interface B {\n  id: string\n}\n')
  writeFileSync(
    path.join(root, 'a.as'),
    'import { B } from "./b"\nimport { X } from "some-pkg/x"\n\nexport interface A {\n  b: B\n  x: X\n}\n'
  )
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

async function render(format: 'js' | 'dts', opts?: TTsPluginOptions): Promise<string> {
  const repo = await build({ rootDir: root, entries: ['a.as'], plugins: [tsPlugin(opts)] })
  const out = await repo.generate({ format })
  return out.find(o => o.fileName.startsWith('a.as.'))!.content
}

describe('tsPlugin moduleExtension', () => {
  it('keeps `.as` for relative and bare imports by default', async () => {
    const js = await render('js')
    expect(js).toContain('from "./b.as"')
    expect(js).toContain('from "some-pkg/x.as"')
  })

  it('applies the extension to relative imports only', async () => {
    const js = await render('js', { moduleExtension: '.as.mjs' })
    expect(js).toContain('from "./b.as.mjs"')
    expect(js).toContain('from "some-pkg/x.as"')
    expect(js).not.toContain('some-pkg/x.as.mjs')
  })

  it('accepts `.as.js`', async () => {
    const js = await render('js', { moduleExtension: '.as.js' })
    expect(js).toContain('from "./b.as.js"')
    expect(js).toContain('from "some-pkg/x.as"')
  })

  it('leaves the .d.ts render untouched', async () => {
    const dts = await render('dts', { moduleExtension: '.as.mjs' })
    expect(dts).toContain('from "./b.as"')
    expect(dts).toContain('from "some-pkg/x.as"')
    expect(dts).not.toContain('.as.mjs')
  })
})
