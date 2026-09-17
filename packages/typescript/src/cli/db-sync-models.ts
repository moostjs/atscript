import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'node:url'
import path from 'path'

import type { TAtscriptConfig, TAtscriptConfigOutput, TDbConfigDeclarative } from '@atscript/core'
import { build, fileUriToPath } from '@atscript/core'

import { isAnnotatedType } from '../runtime/annotated-type'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'

export interface TDbModelFailure {
  /** Generated module path, relative to the temp compile directory. */
  file: string
  error: unknown
}

export interface TDbModelDiagnostics {
  errors: number
  warnings: number
  /** Rendered diagnostic lines, same format as the default `asc` command. */
  messages: string[]
}

export interface TDbModelsResult {
  /** Complete inventory — only trustworthy when `failures` and `modelsError` are empty. */
  types: TAtscriptAnnotatedType[]
  /** Generated modules that could not be imported. */
  failures: TDbModelFailure[]
  diagnostics: TDbModelDiagnostics
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
  logger?: { log: (message: string) => void }
}

/** Depth cap for `config.models` — deep enough for nested arrays and namespaces. */
const MAX_MODELS_DEPTH = 6

/** Keeps two runs in the same process (and the same millisecond) apart. */
let runSeq = 0

/**
 * Compiles the project's `.as` files and loads every `@db.table` / `@db.view`
 * model, plus the models contributed by `config.models`.
 *
 * The result is only a complete inventory when `diagnostics.errors` is 0 and
 * both `failures` and `modelsError` are empty — a caller that plans a sync
 * from a partial inventory would propose dropping the tables it failed to see.
 */
export async function loadDbModels(options: TLoadDbModelsOptions): Promise<TDbModelsResult> {
  const { config, cwd = process.cwd(), logger } = options
  const buildConfig = toBuildConfig(config)

  logger?.log(`Compiling .as files...`)
  const builder = await build(buildConfig)

  const diagnostics = await collectDiagnostics(builder)
  if (diagnostics.errors > 0) {
    return { types: [], failures: [], diagnostics, packaged: 0 }
  }

  const outputs = await builder.generate(buildConfig as TAtscriptConfigOutput)
  const { types, failures } = await importGeneratedModules(outputs, buildConfig.rootDir || cwd, cwd)

  const result: TDbModelsResult = { types, failures, diagnostics, packaged: 0 }
  if (failures.length > 0 || !config.models) {
    return result
  }

  try {
    const seen = new Set<unknown>(types)
    for (const model of flattenModels(await config.models())) {
      if (!seen.has(model)) {
        seen.add(model)
        types.push(model)
        result.packaged++
      }
    }
  } catch (error) {
    result.modelsError = error
  }

  return result
}

/** Abort message printed when some generated modules could not be imported. */
export function partialInventoryMessage(count: number): string {
  return (
    `Could not load ${count} compiled model module(s); aborting before planning — ` +
    `a partial inventory would propose dropping tables.`
  )
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
  walkModels(value, out, new Set<unknown>(), 0)
  return out
}

/** Rewrites the emitted `.as` specifiers to the `.mjs` files we just wrote. */
export function patchAsImports(content: string): string {
  return content.replace(/(from\s+["'][^"']+)\.as(["'])/g, '$1.as.mjs$2')
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
  return buildConfig
}

async function collectDiagnostics(
  builder: Awaited<ReturnType<typeof build>>
): Promise<TDbModelDiagnostics> {
  const diagnostics: TDbModelDiagnostics = { errors: 0, warnings: 0, messages: [] }
  const diagMap = await builder.diagnostics()
  for (const [docId, messages] of diagMap) {
    const doc = builder.getDoc(docId)
    for (const m of messages) {
      if (m.severity === 1) {
        diagnostics.errors++
      } else if (m.severity === 2) {
        diagnostics.warnings++
      }
      if (doc) {
        diagnostics.messages.push(doc.renderDiagMessage(m, true, true))
      }
    }
  }
  return diagnostics
}

interface TGeneratedFile {
  abs: string
  rel: string
}

async function importGeneratedModules(
  outputs: Array<{ fileName: string; content: string; source?: string }>,
  rootDir: string,
  cwd: string
): Promise<{ types: TAtscriptAnnotatedType[]; failures: TDbModelFailure[] }> {
  const jsOutputs: Array<{ fileName: string; content: string; source: string }> = []
  for (const o of outputs) {
    if (o.fileName.endsWith('.js') && o.source) {
      jsOutputs.push({ fileName: o.fileName, content: o.content, source: o.source })
    }
  }
  const base = resolveLayoutBase(
    rootDir,
    jsOutputs.map(o => path.dirname(fileUriToPath(o.source)))
  )

  // Unique per run, under cwd so bare specifiers resolve through node_modules
  const tmpDir = path.join(cwd, `.atscript-db-sync-${process.pid}-${Date.now()}-${runSeq++}`)
  const cleanup = () => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
  process.on('exit', cleanup)

  try {
    const files: TGeneratedFile[] = []
    for (const o of jsOutputs) {
      const srcDir = path.dirname(fileUriToPath(o.source))
      const rel = path.join(path.relative(base, srcDir), o.fileName.replace(/\.js$/, '.mjs'))
      const abs = path.join(tmpDir, rel)
      mkdirSync(path.dirname(abs), { recursive: true })
      writeFileSync(abs, patchAsImports(o.content))
      files.push({ abs, rel })
    }

    const types: TAtscriptAnnotatedType[] = []
    const failures: TDbModelFailure[] = []
    const seen = new Set<unknown>()
    for (const file of files) {
      try {
        const mod = (await import(/* @vite-ignore */ pathToFileURL(file.abs).href)) as Record<
          string,
          unknown
        >
        collectFromModule(mod, types, seen)
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

function collectFromModule(
  mod: Record<string, unknown>,
  types: TAtscriptAnnotatedType[],
  seen: Set<unknown>
) {
  for (const exp of Object.values(mod)) {
    if (isDbModel(exp) && !seen.has(exp)) {
      seen.add(exp)
      types.push(exp)
    }
  }
}

/**
 * Directory the temp layout mirrors. Normally `rootDir`; when a source lives
 * outside it, the common ancestor of `rootDir` and every source, so that no
 * `..` segment ever escapes the temp directory.
 */
function resolveLayoutBase(rootDir: string, sourceDirs: string[]): string {
  const root = path.resolve(rootDir)
  const escapes = sourceDirs.some(dir => {
    const rel = path.relative(root, path.resolve(dir))
    return rel === '..' || rel.startsWith(`..${path.sep}`)
  })
  return escapes ? commonAncestor([root, ...sourceDirs]) : root
}

function commonAncestor(dirs: string[]): string {
  const parts = dirs.map(d => path.resolve(d).split(path.sep))
  const first = parts[0]
  let i = 0
  while (i < first.length && parts.every(p => p[i] === first[i])) {
    i++
  }
  return first.slice(0, i).join(path.sep) || path.sep
}

function isDbModel(value: unknown): value is TAtscriptAnnotatedType {
  return (
    isAnnotatedType(value) &&
    Boolean(value.metadata?.has('db.table') || value.metadata?.has('db.view'))
  )
}

function walkModels(
  value: unknown,
  out: TAtscriptAnnotatedType[],
  seen: Set<unknown>,
  depth: number
) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)
  if (isAnnotatedType(value)) {
    if (isDbModel(value)) {
      out.push(value)
    }
    return
  }
  if (depth >= MAX_MODELS_DEPTH) {
    return
  }
  const items = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)
  for (const item of items) {
    walkModels(item, out, seen, depth + 1)
  }
}
