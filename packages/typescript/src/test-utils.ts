import { writeFileSync } from 'fs'
import path from 'path'

import { build } from '@atscript/core'
import type { TAtscriptPlugin } from '@atscript/core'

import { tsPlugin } from './plugin'

export interface PrepareFixturesOptions {
  /** Absolute directory containing the `.as` fixture files. */
  rootDir: string
  /** Additional plugins. `tsPlugin()` is auto-injected; do not pass it here. */
  plugins?: TAtscriptPlugin[]
  /** Glob includes; defaults to `['**\/*.as']` when `entries` is not set. */
  include?: string[]
  /** Explicit entry filenames relative to `rootDir`; takes precedence over `include`. */
  entries?: string[]
  /** Output formats to generate; defaults to `['js', 'dts']`. */
  formats?: Array<'js' | 'dts'>
}

/**
 * Compiles `.as` fixture files under `rootDir` and writes the generated
 * artifacts (`.as.js` and/or `.as.d.ts`) next to their sources.
 *
 * `tsPlugin()` is injected automatically — callers pass only extra plugins.
 * Writes are unconditional; artifacts are treated as test-run outputs.
 */
export async function prepareFixtures(options: PrepareFixturesOptions): Promise<void> {
  const { rootDir, plugins = [], entries, include, formats = ['js', 'dts'] } = options

  const repo = await build({
    rootDir,
    plugins: [tsPlugin(), ...plugins],
    ...(entries ? { entries } : { include: include ?? ['**/*.as'] }),
  })

  const results = await Promise.all(formats.map(format => repo.generate({ outDir: '.', format })))

  for (const files of results) {
    for (const file of files) {
      const target = file.target ?? path.join(rootDir, file.fileName)
      writeFileSync(target, file.content)
    }
  }
}
