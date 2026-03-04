import path from 'path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
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
