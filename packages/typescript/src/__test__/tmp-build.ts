import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import type { TAtscriptPlugin } from '@atscript/core'
import { afterAll, expect } from 'vitest'

import { tsPlugin } from '../plugin'

/**
 * Builds `.as` sources in a temporary directory (removed after the spec), checks they have no
 * error diagnostics, writes the generated JS and returns its text by file name.
 */
export function tmpBuilder(prefix: string) {
  const dirs: string[] = []
  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  return async (files: Record<string, string>, plugins: TAtscriptPlugin[] = []) => {
    const dir = mkdtempSync(path.join(tmpdir(), prefix))
    dirs.push(dir)
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(path.join(dir, name), content)
    }
    const repo = await build({
      rootDir: dir,
      entries: Object.keys(files),
      plugins: [tsPlugin({ jsonSchema: false }), ...plugins],
    })
    const diagnostics = await repo.diagnostics()
    const errors = [...diagnostics.values()].flat().filter(m => m.severity === 1)
    expect(errors.map(m => m.message)).toEqual([])
    const js: Record<string, string> = {}
    for (const file of await repo.generate({ format: 'js' })) {
      const name = path.basename(file.source)
      writeFileSync(path.join(dir, `${name}.js`), file.content)
      js[name] = file.content
    }
    return { dir, js, load: (name: string) => import(path.join(dir, `${name}.js`)) }
  }
}
