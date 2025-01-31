/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import fs from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { OutputChunk } from 'rolldown'
import { rolldown } from 'rolldown'

import type { TAnscriptConfig } from './types'

async function bundleTsConfig(configFile: string): Promise<string> {
  const dirnameVarName = 'injected_original_dirname'
  const filenameVarName = 'injected_original_filename'
  const importMetaUrlVarName = 'injected_original_import_meta_url'
  const bundle = await rolldown({
    input: configFile,
    platform: 'node',
    resolve: {
      mainFields: ['main'],
    },
    define: {
      '__dirname': dirnameVarName,
      '__filename': filenameVarName,
      'import.meta.url': importMetaUrlVarName,
      'import.meta.dirname': dirnameVarName,
      'import.meta.filename': filenameVarName,
    },
    treeshake: false,
    external: [/^[\w@][^:]/u],
    plugins: [
      {
        name: 'inject-file-scope-variables',
        transform: {
          filter: { id: /\.[cm]?[jt]s$/u },
          handler(code, id) {
            const injectValues =
              `const ${dirnameVarName} = ${JSON.stringify(path.dirname(id))};` +
              `const ${filenameVarName} = ${JSON.stringify(id)};` +
              `const ${importMetaUrlVarName} = ${JSON.stringify(pathToFileURL(id).href)};`
            return { code: injectValues + code, map: null }
          },
        },
      },
    ],
  })
  const outputDir = path.dirname(configFile)
  const result = await bundle.write({
    dir: outputDir,
    format: 'esm',
    sourcemap: 'inline',
    entryFileNames: 'anscript.config.[hash].js',
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
  const fileName = result.output.find(
    (chunk): chunk is OutputChunk => chunk.type === 'chunk' && chunk.isEntry
  )!.fileName
  return path.join(outputDir, fileName)
}

const SUPPORTED_JS_CONFIG_FORMATS = ['.js', '.mjs', '.cjs']
const SUPPORTED_TS_CONFIG_FORMATS = ['.ts', '.mts', '.cts']
const SUPPORTED_CONFIG_FORMATS = [...SUPPORTED_JS_CONFIG_FORMATS, ...SUPPORTED_TS_CONFIG_FORMATS]

const DEFAULT_CONFIG_BASE = 'anscript.config'

/**
 * Resolves nearest config file
 */
export async function resolveConfigFile(docUri: string, root: string): Promise<string | undefined> {
  const startDir = path.dirname(docUri)
  let currentDir = startDir

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const candidate = await findConfigFileName(currentDir)
    if (candidate) {
      return candidate
    }
    // Stop if we've hit workspace root or actual filesystem root
    const parentDir = path.dirname(currentDir)
    if (currentDir === root || parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  return undefined
}

async function findConfigFileName(d: string): Promise<string | undefined> {
  const p = d.startsWith('file://') ? d.slice(7) : d
  const filesInWorkingDirectory = new Set(await readdir(decodeURIComponent(p)))
  for (const extension of SUPPORTED_CONFIG_FORMATS) {
    const fileName = `${DEFAULT_CONFIG_BASE}${extension}`
    if (filesInWorkingDirectory.has(fileName)) {
      return fileName
    }
  }
}

export async function loadTsConfig(configFile: string): Promise<TAnscriptConfig> {
  const file = await bundleTsConfig(configFile)
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member, @typescript-eslint/no-unsafe-return
    return (await import(pathToFileURL(file).href)).default
  } finally {
    console.error('Could not load config file', file)
    fs.unlink(file, () => {}) // Ignore errors
    return {}
  }
}

export async function loadConfig(configPath: string): Promise<TAnscriptConfig> {
  // eslint-disable-next-line no-param-reassign
  const ext = path.extname(configPath)

  try {
    if (SUPPORTED_JS_CONFIG_FORMATS.includes(ext)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member
      return (await import(pathToFileURL(configPath).href)).default
    } else if (SUPPORTED_TS_CONFIG_FORMATS.includes(ext)) {
      const rawConfigPath = path.resolve(configPath)
      return await loadTsConfig(rawConfigPath)
    } else {
      throw new Error(
        `Unsupported config format. Expected: \`${SUPPORTED_CONFIG_FORMATS.join(
          ','
        )}\` but got \`${ext}\``
      )
    }
  } catch (error) {
    console.error(error)
    throw new Error('Error happened while loading config.')
  }
}
