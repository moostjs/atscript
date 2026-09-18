import path from 'path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `__DYE_*` are compile-time defines of the dye bundler plugin — specs run the sources
    setupFiles: ['./packages/typescript/test/dye-stub.ts'],
  },
  plugins: [
    {
      name: 'atscript-resolve',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id.endsWith('.as') && importer) {
          const dir = path.dirname(importer)
          return `${path.resolve(dir, id)}.js`
        }
      },
    },
  ],
})
