#!/usr/bin/env

import 'zx/globals'
import { writeFileSync } from 'fs'
import path from 'path'

import { dye } from '@prostojs/dye'
import dyePlugin from '@prostojs/dye/rolldown'
import { rolldown } from 'rolldown'
import { rollup } from 'rollup'
import dtsPlugin from 'rollup-plugin-dts'
import swcPlugin from 'unplugin-swc'

import pkg from '../package.json' with { type: 'json' }
import { getBuildOptions, getExternals, getWorkspaceFolders } from './utils.js'

const swc = swcPlugin.rolldown()
const _dye = dyePlugin()

let i = 1

const info = dye('blue').attachConsole()
const step = dye('cyan')
  .prefix(() => `\n${i++}. `)
  .attachConsole()
const done = dye('green')
  .prefix(() => ` ✅ `)
  .attachConsole()
const file = dye('blue', 'bold')

const target = process.argv[2]

// $.verbose = true
const workspaces = target ? getWorkspaceFolders().filter(t => t === target) : getWorkspaceFolders()
if (!workspaces.length) {
  console.error(`No workspaces found`)
  process.exit(1)
}
const externals = new Map()
for (const ws of workspaces) {
  externals.set(ws, getExternals(ws))
}

async function run() {
  console.log()
  let types = true
  if (target) {
    info(`Target: ${dye('bold')(target)}`)
    console.log()
    types = false
    for (const build of getBuildOptions(target)) {
      if (build.dts !== false) {
        types = true
        break
      }
    }
  }
  if (types) {
    await generateTypes()
  }
  await generateBundles()
}
run()

async function generateTypes() {
  step('Generating Types')
  await $`npx tsc`.nothrow()

  for (const ws of workspaces) {
    const builds = getBuildOptions(ws)
    for (const { entries, dts } of builds) {
      if (!dts) {
        continue
      }
      for (const entry of entries) {
        const p = entry.split('/').slice(0, -1).join('/')
        const source = path.join('./.types', ws, p)
        const target = path.join('./packages', ws, 'dist', p)
        await $`mkdir -p ./packages/${ws}/dist && rsync -a ${source}/ ${target}/ --delete`
      }
    }
  }
  for (const ws of workspaces) {
    await rollupTypes(ws)
  }

  await $`rm -rf ./.types`
}

const FORMATS = {
  esm: {
    ext: '.mjs',
    format: 'esm',
  },
  cjs: {
    ext: '.cjs',
    format: 'cjs',
  },
}

async function rollupTypes(ws) {
  const builds = getBuildOptions(ws)
  const files = []
  for (const { entries, dts } of builds) {
    if (!dts) {
      continue
    }
    for (const entry of entries) {
      const fileName = entry
        .split('/')
        .pop()
        .replace(/\.\w+$/u, '')
      const p = entry.split('/').slice(0, -1).join('/')
      const input = path.join('packages', ws, 'dist', p, `${fileName}.d.ts`)
      const inputOptions = {
        input,
        plugins: [dtsPlugin()],
        external: externals.get(ws),
      }
      const bundle = await rollup(inputOptions)
      const { output } = await bundle.generate({ format: FORMATS.esm.format })
      const target = `./packages/${ws}/dist/${fileName}.d.ts`
      files.push({
        name: target,
        code: output[0].code,
      })
    }
  }
  await $`rm -rf ./packages/${ws}/dist`
  await $`mkdir -p ./packages/${ws}/dist`
  for (const f of files) {
    writeFileSync(f.name, f.code)
    done(`Created ${file(f.name)}`)
  }
}

async function generateBundles() {
  step('Rolldown Bundles')
  for (const ws of workspaces) {
    rolldownPackages(ws)
  }
}

async function rolldownPackages(ws) {
  const builds = getBuildOptions(ws)
  for (const { entries, formats, external } of builds) {
    // Build input map: { name: path } for code-splitting across entries
    const input = {}
    for (const entry of entries) {
      const name = entry.split('/').pop().replace(/\.\w+$/u, '')
      input[name] = path.join(`packages/${ws}`, entry)
    }
    const inputOptions = {
      input,
      external: [...(external || externals.get(ws)), '@atscript/typescript/utils'],
      define: {
        __VERSION__: JSON.stringify(pkg.version),
      },
      resolve: {
        preserveSymlinks: false,
        conditions: ['import', 'module', 'default'],
        extensions: ['.ts', '.mjs', '.js', '.json'],
      },
      plugins: [_dye, swc],
    }
    const bundle = await rolldown(inputOptions)
    const created = []
    for (const f of formats) {
      const { ext, format } = FORMATS[f]
      const { output } = await bundle.generate({ format, comments: 'preserve-legal' })
      for (const chunk of output) {
        if (chunk.type !== 'chunk') { continue }
        const chunkTarget = `./packages/${ws}/dist/${chunk.fileName.replace(/\.js$/, ext)}`
        // Rewrite chunk import paths from .js to the target extension
        const code = ext === '.js' ? chunk.code : chunk.code.replace(
          /((?:from|import)\s*\(?["']\.\/[^"']+)\.js(["'])/g, `$1${ext}$2`
        ).replace(
          /(require\(["']\.\/[^"']+)\.js(["'])/g, `$1${ext}$2`
        )
        writeFileSync(chunkTarget, code)
        if (chunk.isEntry) { created.push(chunkTarget) }
      }
    }
    done(created.join(' \t'))
  }
}
