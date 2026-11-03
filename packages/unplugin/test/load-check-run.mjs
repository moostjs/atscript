// A bundler build of fixture project `dir` with the built `@atscript/unplugin` (load-check.spec.ts,
// run in a process of its own: the build-time realm's runtime comes from ATSCRIPT_REALM_RUNTIME).
// node load-check-run.mjs <bundler> <dir> <options JSON> <vite> <esbuild> : prints `OK` or `FAILED <message>`
import { createRequire } from 'node:module'
import path from 'node:path'

const [bundler, dir, optionsJson, vitePath, esbuildPath] = process.argv.slice(2)
const options = { root: dir, ...JSON.parse(optionsJson) }
const require = createRequire(import.meta.url)
const entry = path.join(dir, 'main.js')

async function run() {
  switch (bundler) {
    case 'rollup-cjs': {
      // (a CommonJS bundler config: the plugin's CommonJS build)
      const plugin = require('unplugin-atscript/rollup')
      const { rollup } = require('rollup')
      const b = await rollup({
        input: entry,
        external: [/^@atscript/],
        plugins: [(plugin.default ?? plugin)(options)],
      })
      await b.generate({ format: 'esm' })
      return
    }
    case 'rollup-watch': {
      const plugin = (await import('unplugin-atscript/rollup')).default
      const { watch } = await import('rollup')
      await new Promise((resolve, reject) => {
        const w = watch({
          input: entry,
          external: [/^@atscript/],
          plugins: [plugin(options)],
          output: { dir: path.join(dir, 'out-w') },
        })
        w.on('event', e => {
          if (e.code === 'END') {
            Promise.resolve(w.close()).catch(() => {})
            resolve()
          }
          if (e.code === 'ERROR') {
            Promise.resolve(w.close()).catch(() => {})
            reject(e.error)
          }
        })
      })
      return
    }
    case 'rolldown': {
      const plugin = (await import('unplugin-atscript/rolldown')).default
      const { rolldown } = await import('rolldown')
      const b = await rolldown({
        input: entry,
        external: [/^@atscript/],
        plugins: [plugin(options)],
        logLevel: 'silent',
      })
      await b.generate({ format: 'esm' })
      return
    }
    case 'vite-build':
    case 'vite-watch': {
      const plugin = (await import('unplugin-atscript/vite')).default
      const vite = await import(vitePath)
      const out = await vite.build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin(options)],
        build: {
          write: false,
          lib: { entry, formats: ['es'], fileName: 'main' },
          rollupOptions: { external: [/^@atscript/] },
          ...(bundler === 'vite-watch' ? { watch: {} } : {}),
        },
      })
      if (bundler === 'vite-watch') {
        await new Promise((resolve, reject) => {
          out.on('event', e => {
            if (e.code === 'END') {
              Promise.resolve(out.close()).catch(() => {})
              resolve()
            }
            if (e.code === 'ERROR') {
              Promise.resolve(out.close()).catch(() => {})
              reject(e.error)
            }
          })
        })
      }
      return
    }
    case 'vite-serve': {
      const plugin = (await import('unplugin-atscript/vite')).default
      const vite = await import(vitePath)
      const server = await vite.createServer({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin(options)],
        server: { middlewareMode: true, hmr: false },
      })
      try {
        const r = await server.transformRequest('/a.as', { ssr: true })
        if (!r?.code) {
          throw new Error('no code')
        }
      } finally {
        await server.close()
      }
      return
    }
    case 'esbuild': {
      const plugin = require('unplugin-atscript/esbuild')
      const esbuild = await import(esbuildPath)
      await (esbuild.default ?? esbuild).build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        external: ['@atscript/*'],
        logLevel: 'silent',
        plugins: [(plugin.default ?? plugin)(options)],
      })
      return
    }
    default: {
      throw new Error(`unknown bundler ${bundler}`)
    }
  }
}

try {
  await run()
  console.log('OK')
} catch (error) {
  console.log(
    `FAILED ${String(error?.message ?? error)
      .replace(/\s+/g, ' ')
      .slice(0, 4000)}`
  )
}
