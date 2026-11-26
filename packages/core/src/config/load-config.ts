/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
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

/**
 * The folder of the bundled copies of a config in `configDir`: `.atscript-temp` in the nearest
 * `node_modules` (packages resolve from there as from `configDir`; linters, formatters and git skip
 * it, so a copy left by a killed load stays out of sight), else `configDir`.
 */
function copiesDir(configDir: string): string {
  for (let dir = configDir; ; dir = path.dirname(dir)) {
    const nodeModules = path.join(dir, 'node_modules')
    if (existsSync(nodeModules)) {
      return path.join(nodeModules, '.atscript-temp')
    }
    if (path.dirname(dir) === dir) {
      return configDir
    }
  }
}

/**
 * Bundles `configFile` with the local modules it imports into a copy of its own (see
 * `copiesDir`): the path of the copy. Packages stay external.
 */
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
  const configDir = path.dirname(configFile)
  const outputDir = copiesDir(configDir)
  // (a copy of its own for each load: a module that failed is never imported again — a load after
  // a failure evaluates the config again — and two loads at once do not share a file)
  const name = `atscript.config.[hash].${process.pid}.${bundleSeq++}`
  await removeLeftoverCopies(outputDir)
  if (outputDir !== configDir) {
    // (copies left beside the config before 0.2.22)
    await removeLeftoverCopies(configDir)
  }
  const result = await bundle
    .write({
      dir: outputDir,
      format: forceFormat || 'esm',
      sourcemap: 'inline',
      entryFileNames: forceFormat === 'cjs' ? `${name}.cjs` : `${name}.mjs`,
      // (one file, removed after the load: a local module imported with `import()` is inlined
      // instead of written as a chunk of its own)
      codeSplitting: false,
    })
    // (a long-running host, the editor, bundles the config again for each load)
    .finally(() => bundle.close())
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
  const fileName = result.output.find(
    (chunk): chunk is OutputChunk => chunk.type === 'chunk' && chunk.isEntry
  )!.fileName
  return path.join(outputDir, fileName)
}

const SUPPORTED_JS_CONFIG_FORMATS = ['.js', '.mjs', '.cjs']
const SUPPORTED_TS_CONFIG_FORMATS = ['.ts', '.mts', '.cts']
/** The config file extensions, in the order a directory is searched for them. */
const SUPPORTED_CONFIG_FORMATS = [...SUPPORTED_JS_CONFIG_FORMATS, ...SUPPORTED_TS_CONFIG_FORMATS]

const DEFAULT_CONFIG_BASE = 'atscript.config'

/**
 * The nearest config file of document `docUri` (or of a folder): the first `atscript.config.*`
 * walking up from its folder, as a filesystem path, until the folder `root` (when given, checked
 * too) or the filesystem root. Both may be paths or `file://` URIs (percent-encoded, as an editor
 * sends them). A folder that cannot be read has no config.
 */
export async function resolveConfigFile(
  docUri: string,
  root?: string
): Promise<string | undefined> {
  const start = path.resolve(fileUriToPath(docUri))
  const stop = root ? path.resolve(fileUriToPath(root)) : undefined
  let dir = start.endsWith('.as') ? path.dirname(start) : start
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    const candidate = await findConfigFileName(dir)
    if (candidate) {
      return path.join(dir, candidate)
    }
    const parent = path.dirname(dir)
    if (dir === stop || parent === dir) {
      return undefined
    }
    dir = parent
  }
}

async function findConfigFileName(dir: string): Promise<string | undefined> {
  const names = new Set(await readdir(dir).catch(() => [] as string[]))
  for (const extension of SUPPORTED_CONFIG_FORMATS) {
    const fileName = `${DEFAULT_CONFIG_BASE}${extension}`
    if (names.has(fileName)) {
      return fileName
    }
  }
}

/**
 * Loads `.ts` config `configFile` from a bundled copy of its own (see `bundleTsConfig`), removed
 * after the import: each load evaluates the file and the local modules it imports as they are now.
 */
export async function loadTsConfig(
  configFile: string,
  forceFormat?: 'cjs' | 'esm'
): Promise<TAtscriptConfig> {
  const file = await bundleTsConfig(configFile, forceFormat)
  try {
    // (a config that throws while it is evaluated fails the load)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member, @typescript-eslint/no-unsafe-return
    return (await import(/* @vite-ignore */ pathToFileURL(file).href)).default
  } finally {
    // (removed before the load returns: nothing is left behind)
    await rm(file, { force: true }).catch(() => {})
  }
}

/** Numbers the imports of `.js` configs of this process (see `importJsConfig`). */
let importSeq = 0

/**
 * Imports `.js` / `.mjs` / `.cjs` config `file` as Node loads it, evaluated again on each call:
 * under a URL of its own (Node caches an ES module by URL) and out of the CommonJS cache (keyed by
 * file name). The modules it imports stay cached: a local one is read once per process.
 */
async function importJsConfig(file: string): Promise<TAtscriptConfig> {
  const require = createRequire(file)
  delete require.cache[require.resolve(file)]
  const url = `${pathToFileURL(file).href}?atscript-load=${importSeq++}`
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member, @typescript-eslint/no-unsafe-return
  return (await import(/* @vite-ignore */ url)).default
}

/**
 * Loads the config file `configPath`, fresh on every call: a `.js` one imported as Node loads it
 * (see `importJsConfig`), a `.ts` one bundled (see `loadTsConfig`). Its `rootDir` is absolute: a
 * relative one resolved against the file's directory, a missing one that directory — the same
 * project root for every host.
 */
export async function loadConfig(
  configPath: string,
  forceFormat?: 'cjs' | 'esm'
): Promise<TAtscriptConfig & { rootDir: string }> {
  if (!configPath) {
    throw new Error('loadConfig: no config path provided (resolveConfigFile returned undefined).')
  }
  const file = path.resolve(configPath)
  const ext = path.extname(file)
  try {
    if (!SUPPORTED_CONFIG_FORMATS.includes(ext)) {
      throw new Error(
        `Unsupported config format. Expected: \`${SUPPORTED_CONFIG_FORMATS.join(
          ','
        )}\` but got \`${ext}\``
      )
    }
    const config =
      SUPPORTED_JS_CONFIG_FORMATS.includes(ext) && !forceFormat
        ? await importJsConfig(file)
        : await loadTsConfig(file, forceFormat)
    if (!config || typeof config !== 'object') {
      throw new TypeError(`${file} has no default export of a config object`)
    }
    return { ...config, rootDir: path.resolve(path.dirname(file), config.rootDir ?? '.') }
  } catch (error) {
    console.error(error)
    throw new Error('Error happened while loading config.', { cause: error })
  }
}
