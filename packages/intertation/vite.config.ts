/* eslint-disable import/no-default-export */
import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    target: 'es2019',
    minify: false,
    lib: {
      entry: 'src/index.ts',
      name: 'intertation',
      fileName: (format, entryName) =>
        entryName === 'src/index.ts' ? 'index.js' : `index.${format === 'cjs' ? 'cjs' : 'mjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external:
        process.env.NODE_ENV === 'production'
          ? [
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
              ...Object.keys(JSON.parse(readFileSync('./package.json').toString()).dependencies),
              'path',
              /^node:/u,
            ]
          : [],
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
    }),
  ],
})
