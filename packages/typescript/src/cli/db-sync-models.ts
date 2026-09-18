import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'node:url'
import path from 'path'

import type {
  TAtscriptConfig,
  TAtscriptConfigOutput,
  TDbConfigDeclarative,
  TOutput,
} from '@atscript/core'
import { DB_ENTITY_ANNOTATIONS, build, fileUriToPath } from '@atscript/core'

import { tsPlugin } from '../plugin'
import { isAnnotatedType } from '../runtime/annotated-type'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import type { TDiagnosticsSummary } from './diagnostics'
import { collectDiagnostics } from './diagnostics'

export interface TDbModelFailure {
  /** Generated module path, relative to the temp compile directory. */
  file: string
  error: unknown
}

export interface TDbModelsResult {
  /** Complete inventory — only trustworthy when `failures` and `modelsError` are empty. */
  types: TAtscriptAnnotatedType[]
  /** Generated modules that could not be imported. */
  failures: TDbModelFailure[]
  diagnostics: TDiagnosticsSummary
  /** How many models were contributed by `config.models`. */
  packaged: number
  /** Whatever `config.models` threw, if it threw. */
  modelsError?: unknown
}

export interface TLoadDbModelsOptions {
  config: TAtscriptConfig
  /**
   * Base directory for the temp compile output. Must stay inside the project
   * so that bare imports (`@atscript/typescript/utils`, packaged `.as`
   * modules) resolve through the project's `node_modules`.
   */
  cwd?: string
}

/**
 * Compiles the project's `.as` files and loads every `@db.table` / `@db.view`
 * model, plus the models contributed by `config.models`.
 *
 * The result is only a complete inventory when `diagnostics.errors` is 0 and
 * both `failures` and `modelsError` are empty — a caller that plans a sync
 * from a partial inventory would propose dropping the tables it failed to see.
 */
export async function loadDbModels(options: TLoadDbModelsOptions): Promise<TDbModelsResult> {
  const { config, cwd = process.cwd() } = options
  const buildConfig = toBuildConfig(config)
  const builder = await build(buildConfig)
  // `build()` resolves `rootDir` on the config it receives
  const rootDir = buildConfig.rootDir!

  const diagnostics = await collectDiagnostics(builder)
  if (diagnostics.errors > 0) {
    return { types: [], failures: [], diagnostics, packaged: 0 }
  }

  const outputs = await builder.generate(buildConfig as TAtscriptConfigOutput)
  const { types, failures } = await importGeneratedModules(outputs, rootDir, cwd)

  const result: TDbModelsResult = { types, failures, diagnostics, packaged: 0 }
  if (failures.length > 0 || !config.models) {
    return result
  }

  try {
    const models = flattenModels(await config.models())
    types.push(...models)
    result.packaged = models.length
  } catch (error) {
    result.modelsError = error
  }

  return result
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Collects every `@db.table` / `@db.view` model out of whatever `config.models`
 * returned — an annotated type, an array, a module namespace object, or any
 * nesting of those. Deduplicated by identity.
 */
export function flattenModels(value: unknown): TAtscriptAnnotatedType[] {
  const out: TAtscriptAnnotatedType[] = []
  walkModels(value, out, new Set<unknown>())
  return out
}

// ── internals ──────────────────────────────────────────────────────────

function toBuildConfig(config: TAtscriptConfig): TAtscriptConfig {
  const buildConfig: TAtscriptConfig = { ...config }
  if (typeof config.db === 'object' && 'adapter' in config.db) {
    const dbConfig = config.db as TDbConfigDeclarative
    if (dbConfig.include) {
      buildConfig.include = dbConfig.include
    }
    if (dbConfig.exclude) {
      buildConfig.exclude = dbConfig.exclude
    }
  }
  buildConfig.format = 'js'
  // Relative `.as` imports are emitted as `.as.mjs` so Node can load the
  // compiled models straight from the temp directory; other plugins stay.
  const syncTs = tsPlugin({ moduleExtension: '.as.mjs' })
  const plugins = (config.plugins ?? []).map(p => (p.name === 'typescript' ? syncTs : p))
  if (!plugins.includes(syncTs)) {
    plugins.push(syncTs)
  }
  buildConfig.plugins = plugins
  return buildConfig
}

interface TGeneratedFile {
  abs: string
  rel: string
}

async function importGeneratedModules(
  outputs: TOutput[],
  rootDir: string,
  cwd: string
): Promise<{ types: TAtscriptAnnotatedType[]; failures: TDbModelFailure[] }> {
  const modules = outputs
    .filter(o => o.fileName.endsWith('.js'))
    .map(o => ({
      srcDir: path.dirname(fileUriToPath(o.source)),
      fileName: o.fileName.replace(/\.js$/, '.mjs'),
      content: o.content,
    }))
  const base = commonAncestor([rootDir, ...modules.map(m => m.srcDir)])

  // Under cwd so bare specifiers resolve through node_modules
  const tmpDir = mkdtempSync(path.join(cwd, '.atscript-db-sync-'))
  const cleanup = () => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
  process.on('exit', cleanup)

  try {
    const files: TGeneratedFile[] = []
    const dirs = new Set<string>()
    for (const m of modules) {
      const rel = path.join(path.relative(base, m.srcDir), m.fileName)
      const abs = path.join(tmpDir, rel)
      const dir = path.dirname(abs)
      if (!dirs.has(dir)) {
        dirs.add(dir)
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(abs, m.content)
      files.push({ abs, rel })
    }

    const types: TAtscriptAnnotatedType[] = []
    const failures: TDbModelFailure[] = []
    const seen = new Set<unknown>()
    for (const file of files) {
      try {
        const mod: unknown = await import(/* @vite-ignore */ pathToFileURL(file.abs).href)
        walkModels(mod, types, seen)
      } catch (error) {
        failures.push({ file: file.rel, error })
      }
    }
    return { types, failures }
  } finally {
    cleanup()
    process.off('exit', cleanup)
  }
}

/**
 * Directory the temp layout mirrors: the common ancestor of `rootDir` and
 * every source directory — `rootDir` itself when every source lives under it —
 * so that no `..` segment ever escapes the temp directory.
 */
function commonAncestor(dirs: string[]): string {
  const parts = dirs.map(d => path.resolve(d).split(path.sep))
  const first = parts[0]
  let i = 0
  while (i < first.length && parts.every(p => p[i] === first[i])) {
    i++
  }
  return first.slice(0, i).join(path.sep) || path.sep
}

/**
 * Runtime side of `DB_ENTITY_ANNOTATIONS` — the same rule as `DbSpace.get()`
 * in `@atscript/db`: a type carrying only `@db.view.for` is a managed view, so
 * it belongs in the inventory too (leaving it out would plan the view as a drop).
 *
 * Lives here rather than in `@atscript/typescript/utils`: `utils` is the
 * runtime entry every generated `.as.js` module imports (browsers included)
 * and carries no `@atscript/core` import, which is externalized in the build.
 */
export function isDbEntityType(value: unknown): value is TAtscriptAnnotatedType {
  if (!isAnnotatedType(value)) {
    return false
  }
  return DB_ENTITY_ANNOTATIONS.some(name => value.metadata?.has(name))
}

/** `seen` deduplicates by identity and guarantees termination on cyclic graphs. */
function walkModels(value: unknown, out: TAtscriptAnnotatedType[], seen: Set<unknown>) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)
  if (isAnnotatedType(value)) {
    if (isDbEntityType(value)) {
      out.push(value)
    }
    return
  }
  const items = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)
  for (const item of items) {
    walkModels(item, out, seen)
  }
}
