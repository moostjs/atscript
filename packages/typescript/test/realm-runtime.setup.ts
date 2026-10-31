// Global setup: the specs run the sources, so the build-time realm's runtime (`dist/realm-runtime.js`
// in a build, see `src/codegen/realm.ts`) is bundled here from the sources, like the package build
// does, and passed to the workers by `ATSCRIPT_REALM_RUNTIME`.
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import { rolldown } from 'rolldown'

export default async function setup() {
  const root = path.resolve(__dirname, '../../..')
  const bundle = await rolldown({
    input: path.join(root, 'packages/typescript/src/realm-runtime.ts'),
    resolve: { extensions: ['.ts', '.mjs', '.js', '.json'] },
    logLevel: 'silent',
  })
  const { output } = await bundle.generate({ format: 'iife', name: '__atscriptRealm' })
  const dir = path.join(root, 'node_modules/.cache/atscript-realm')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `realm-runtime-${process.pid}.js`)
  writeFileSync(file, output[0].code)
  process.env.ATSCRIPT_REALM_RUNTIME = file
}
