/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import fs from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { OutputChunk } from 'rolldown'
import { rolldown } from 'rolldown'

import { fileUriToPath } from '../parser/utils'
import type { TAtscriptConfig } from './types'

/** Numbers the bundled copies of this process (see `bundleTsConfig`). */
let bundleSeq = 0

/** The name of a bundled copy of a `.ts` config (see `bundleTsConfig`): its process id. */
const BUNDLED_COPY = /^atscript\.config\.[\w-]+\.(\d+)\.\d+\.[cm]js$/u

/** Whether process `pid` is gone (a live process of another user counts as alive). */
function isGone(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

/**
 * Removes the bundled copies in `dir` of processes that are gone (killed while they loaded the
 * config, before they removed their copy); the copies of live processes are theirs.
 */
async function removeLeftoverCopies(dir: string) {
  const names = await readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names.map(async name => {
      const pid = Number(BUNDLED_COPY.exec(name)?.[1])
      if (pid && pid !== process.pid && isGone(pid)) {
        await rm(path.join(dir, name), { force: true }).catch(() => {})
      }
    })
  )
}

async function bundleTsConfig(configFile: string, forceFormat?: 'cjs' | 'esm'): Promise<string> {
  const dirnameVarName = 'injected_original_dirname'
  const filenameVarName = 'injected_original_filename'
  const importMetaUrlVarName = 'injected_original_import_meta_url'
  const bundle = await rolldown({
    input: configFile,
    platform: 'node',
    // Don't auto-discover the user's tsconfig — atscript config files are simple TS modules
    // and the user's tsconfig may be broken (missing extends target, etc.), which would
    // otherwise abort the bundle and prevent the config from loading.
    tsconfig: false,
    resolve: {
      mainFields: ['main'],
    },
    transform: {
      define: {
        '__dirname': dirnameVarName,
        '__filename': filenameVarName,
        'import.meta.url': importMetaUrlVarName,
        'import.meta.dirname': dirnameVarName,
        'import.meta.filename': filenameVarName,
      },
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
  // (a copy of its own for each load: a module that failed is never imported again — a load after
  // a failure evaluates the config again — and two loads at once do not share a file)
  const name = `atscript.config.[hash].${process.pid}.${bundleSeq++}`
  await removeLeftoverCopies(outputDir)
  const result = await bundle.write({
    dir: outputDir,
    format: forceFormat || 'esm',
    sourcemap: 'inline',
    entryFileNames: forceFormat === 'cjs' ? `${name}.cjs` : `${name}.mjs`,
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

const DEFAULT_CONFIG_BASE = 'atscript.config'

/**
 * Resolves nearest config file
 */
export async function resolveConfigFile(
  docUri: string,
  _root?: string
): Promise<string | undefined> {
  const startDir = docUri.endsWith('.as') ? path.dirname(docUri) : docUri
  const root = _root || startDir
  let currentDir = startDir

  const rootId = `file://${root}`

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const candidate = await findConfigFileName(currentDir)
    if (candidate) {
      return path.join(currentDir, candidate).replace(/^file:/, '')
    }
    // Stop if we've hit workspace root or actual filesystem root
    const parentDir = path.dirname(currentDir)
    if (currentDir === rootId || parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  return undefined
}

async function findConfigFileName(d: string): Promise<string | undefined> {
  const filesInWorkingDirectory = new Set(await readdir(fileUriToPath(d)))
  for (const extension of SUPPORTED_CONFIG_FORMATS) {
    const fileName = `${DEFAULT_CONFIG_BASE}${extension}`
    if (filesInWorkingDirectory.has(fileName)) {
      return fileName
    }
  }
}

export async function loadTsConfig(
  configFile: string,
  forceFormat?: 'cjs' | 'esm'
): Promise<TAtscriptConfig> {
  const file = await bundleTsConfig(configFile, forceFormat)
  try {
    // (a config that throws while it is evaluated fails the load, like a `.js` one)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member, @typescript-eslint/no-unsafe-return
    return (await import(/* @vite-ignore */ pathToFileURL(file).href)).default
  } finally {
    fs.unlink(file, () => {})
  }
}

export async function loadConfig(
  configPath: string,
  forceFormat?: 'cjs' | 'esm'
): Promise<TAtscriptConfig> {
  if (!configPath) {
    throw new Error('loadConfig: no config path provided (resolveConfigFile returned undefined).')
  }
  const ext = path.extname(configPath)
  try {
    if (SUPPORTED_JS_CONFIG_FORMATS.includes(ext)) {
      return forceFormat
        ? await loadTsConfig(path.resolve(configPath), forceFormat)
        : (await import(/* @vite-ignore */ pathToFileURL(configPath).href)).default
    } else if (SUPPORTED_TS_CONFIG_FORMATS.includes(ext)) {
      const rawConfigPath = path.resolve(configPath)
      return await loadTsConfig(rawConfigPath, forceFormat)
    } else {
      throw new Error(
        `Unsupported config format. Expected: \`${SUPPORTED_CONFIG_FORMATS.join(
          ','
        )}\` but got \`${ext}\``
      )
    }
  } catch (error) {
    console.error(error)
    throw new Error('Error happened while loading config.', { cause: error })
  }
}
