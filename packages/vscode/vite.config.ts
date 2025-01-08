/* eslint-disable import/no-default-export */
import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'

// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
const external = Object.keys(JSON.parse(readFileSync('./package.json').toString()).dependencies)

export default defineConfig({
  build: {
    target: 'es2019',
    minify: false,
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: ['client/extension.ts', 'server/server.ts'],
      name: 'intertation',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [...external, 'vscode', 'path', 'fs', ...external.map(s => `${s}/node`)], // External dependencies
    },
  },
})
