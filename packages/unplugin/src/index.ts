import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import path from 'path'

import type { AtscriptDoc, TAtscriptConfig, TAtscriptConfigInput } from '@atscript/core'
import {
  AtscriptRepo,
  blockTargetDocuments,
  fileUriToPath,
  hasMutatingAnnotates,
  loadConfig,
  recordDocumentReads,
  resolveConfigFile,
} from '@atscript/core'
import {
  importCycle,
  JS_COMPILED_FORMAT,
  JS_INTERPRETED_FORMAT,
  tsPlugin as ts,
} from '@atscript/typescript'
import type { UnpluginBuildContext, UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'

export interface atscriptPluginOptions {
  /**
   * When strict: true, atscript will throw an error if any document is not valid.
   * @default true
   */
  strict?: boolean

  /**
   * The directory `atscript.config.*` is discovered from and `.as` files are
   * resolved against. Absolute, or relative to `process.cwd()`.
   *
   * Defaults to the bundler's root (Vite: `config.root`, picked up automatically
   * in `configResolved`) or `process.cwd()`.
   *
   * Vite picks the root up automatically; other bundlers need `root` when the
   * working directory is not the project root (monorepo `pnpm -C`, editor-launched
   * builds, a root that sits next to — not above — the config). Without it the
   * config is discovered from the wrong directory and valid annotations from
   * config-provided plugins (`@db.*`, `@ui.*`, …) are reported as unknown.
   */
  root?: string

  /**
   * Overrides `tsPlugin({ compileValidators })` of the atscript config for the modules
   * this plugin renders:
   * - `true` — compiled validator checks for every type.
   * - `false` — none, not even for types annotated with `@emit.compiledValidator`
   *   (forced interpreted output, e.g. for bundles shipped to browsers).
   * - `'ssr'` — `true` for server builds (Vite's SSR / server environments), `false` for
   *   client bundles (one Vite config for both). Bundlers that do not report a server build
   *   (everything but Vite) are treated as client builds.
   *
   * Unset: the atscript config decides (default: only `@emit.compiledValidator` types).
   */
  compileValidators?: boolean | 'ssr'
}

/** The `load` hook options Vite passes (absent for other bundlers). */
interface TLoadOptions {
  ssr?: boolean
}

/** `true` when Vite is loading the module for a server (SSR) build / environment. */
function isServerLoad(ctx: unknown, options: TLoadOptions | undefined): boolean {
  if (options?.ssr === true) {
    return true
  }
  const consumer = (ctx as { environment?: { config?: { consumer?: string } } } | undefined)
    ?.environment?.config?.consumer
  return consumer === 'server'
}

// Matches declaration-module ids (.d.ts / .d.mts / .d.cts). Declaration bundlers
// (rolldown-plugin-dts via tsdown, rollup-plugin-dts) resolve the imports of
// generated .d.ts modules through the same plugin container, so a `.d.ts`
// importer is the in-band signal that the dts graph — not the JS graph — is
// asking for the module.
const RE_DTS = /\.d\.[cm]?ts$/

// Every rendered `.as` module imports its runtime helpers from here.
const RUNTIME_ENTRY = '@atscript/typescript/utils'

/** Minimal structural view of the Vite config objects this plugin touches. */
interface TViteUserConfig {
  root?: string
  optimizeDeps?: { include?: string[] }
}

interface TViteResolvedConfig {
  root: string
}

/**
 * Registers every transitive `.as` dependency of `doc` as a watch file.
 *
 * The bundler's module graph only knows the imports the rendered output keeps:
 * the JS renderer drops imports it does not use, and the dts graph and
 * non-Vite watchers never see the JS import list at all. Watching the whole
 * `.as` closure explicitly makes the bundler re-run `load` for the importer
 * whenever any of them changes.
 *
 * Re-registering on every `load` is required: Vite replaces a module's watch
 * edges on each transform, so a repeat registration is deduped while skipping
 * it would prune the edge.
 */
function addTransitiveWatchFiles(
  ctx: UnpluginBuildContext,
  doc: AtscriptDoc,
  visited = new Set<AtscriptDoc>([doc])
) {
  for (const dep of doc.dependencies) {
    if (visited.has(dep)) {
      continue
    }
    visited.add(dep)
    ctx.addWatchFile(fileUriToPath(dep.id))
    addTransitiveWatchFiles(ctx, dep, visited)
  }
}

function isResolvableFrom(specifier: string, from: string): boolean {
  try {
    createRequire(path.join(from, 'package.json')).resolve(specifier)
    return true
  } catch {
    return false
  }
}

/** Minimal structural view of a Vite module graph (an environment's, or the legacy mixed one). */
interface TViteModuleGraph {
  getModulesByFile: (file: string) => Set<unknown> | undefined
  invalidateModule: (
    mod: never,
    seen?: Set<unknown>,
    timestamp?: number,
    isHmr?: boolean,
    softInvalidate?: boolean
  ) => void
}

/** Minimal structural view of the Vite dev server (`configureServer`). */
interface TViteDevServer {
  /** Vite 6+: one module graph per environment (client, SSR, …). */
  environments?: Record<string, { moduleGraph: TViteModuleGraph }>
  /** Vite 5: the module graph of both client and SSR modules. */
  moduleGraph: TViteModuleGraph
  /** Vite 5: the HMR channel to the clients. */
  ws?: { send: (payload: { type: 'full-reload' }) => void }
}

/** The modules of `files` in `graph`. */
function modulesOf(graph: TViteModuleGraph, files: Iterable<string>): unknown[] {
  const out: unknown[] = []
  for (const file of files) {
    out.push(...(graph.getModulesByFile(file) ?? []))
  }
  return out
}

/**
 * Hard-invalidates (drops the transform of) the modules of `files` in every module graph of
 * `server`: Vite reuses an importer's transform when one of its imports changed (soft
 * invalidation), and the next import re-runs `load` only for a module invalidated this way.
 */
function invalidateFiles(server: TViteDevServer, files: Set<string>): void {
  const graphs = server.environments
    ? Object.values(server.environments).map(env => env.moduleGraph)
    : [server.moduleGraph]
  const timestamp = Date.now()
  for (const graph of graphs) {
    for (const mod of modulesOf(graph, files)) {
      graph.invalidateModule(mod as never, new Set(), timestamp, false, false)
    }
  }
}

/** The import statements of generated code (`codes`): what the module graph is made of. */
function importLines(codes: Iterable<string>): string {
  return [...codes]
    .map(code =>
      code
        .split('\n')
        .filter(line => line.startsWith('import '))
        .join('\n')
    )
    .join('\n---\n')
}

/** The diagnostics `load` logs for `doc` (errors and warnings), as a key (see `logged`). */
function loggedOf(doc: AtscriptDoc): string {
  return doc
    .getDiagMessages()
    .filter(m => m.severity === 1 || m.severity === 2)
    .map(m => `${m.severity}:${m.message}`)
    .join('\n')
}

/** Whether `doc` has mutating `annotate` blocks. */
function hasBlocks(doc: AtscriptDoc | undefined): boolean {
  return !!doc && hasMutatingAnnotates(doc)
}

/**
 * The files of the modules declaring the types the mutating `annotate` blocks of `doc` annotate
 * (other than its own) — through plain aliases (see `blockTargetDocuments`).
 */
function annotatedModules(doc: AtscriptDoc | undefined): Set<string> {
  const out = new Set<string>()
  for (const target of doc ? blockTargetDocuments(doc) : []) {
    if (target.id.startsWith('file://')) {
      out.add(fileUriToPath(target.id))
    }
  }
  return out
}

export const unpluginFactory: UnpluginFactory<atscriptPluginOptions | undefined> = opts => {
  // An explicit option always wins over whatever the bundler reports.
  const explicitRoot = opts?.root ? path.resolve(opts.root) : undefined
  // Mutable and read lazily (never at factory time): a bundler hook — Vite's
  // `configResolved` — may fill it in before the first `load`.
  let detectedRoot: string | undefined
  const getRoot = () => explicitRoot ?? detectedRoot ?? process.cwd()
  const strict = opts?.strict ?? true
  let repo: AtscriptRepo
  let configPromise: Promise<TAtscriptConfig> | undefined
  /** The documents of the `.as` modules loaded, by file. */
  const loaded = new Map<string, AtscriptDoc>()
  /**
   * What `load` returned for each `.as` module (by file), by render format: its generated code,
   * or the error it threw (see `outcome`).
   */
  const served = new Map<string, Map<string, string>>()
  /**
   * The diagnostics each served module's `load` logged (errors and warnings): a module whose
   * diagnostics change (derived from other documents) is loaded again to log them — also when
   * its generated code (or the error it throws: the first one) stays the same (see `loggedOf`).
   */
  const logged = new Map<string, string>()
  /**
   * The `.as` modules (by file) importing each `.as` file (by file), as their import specifiers
   * name it — also when it does not exist (a deleted file, one not created yet).
   */
  const importers = new Map<string, Set<string>>()
  /** The `.as` files each loaded `.as` module imports (see `importers`). */
  const importsOf = new Map<string, Set<string>>()
  /**
   * The other `.as` modules whose generated code changed with a changed `.as` file (by file,
   * see `watchChange`), for the hot update that follows.
   */
  const affected = new Map<string, Set<string>>()
  /** The changed `.as` files whose hot update is a full page reload. */
  const reload = new Set<string>()
  /** The Vite dev server (Vite only). */
  let viteServer: TViteDevServer | undefined

  // Lazy + guarded: only probes for a config when an .as file is actually loaded.
  // A missing config resolves to an empty config (the `load` hook fills in the
  // default `ts()` plugin) instead of crashing the host process with an unhandled
  // rejection. Errors now surface inside `load()`, where the bundler can report them.
  const getConfig = () =>
    (configPromise ??= (async () => {
      const p = await resolveConfigFile(getRoot())
      return p ? loadConfig(p) : {}
    })())

  /** Records the `.as` files `doc` (loaded from `file`) imports (see `importers`). */
  const recordImports = (file: string, doc: AtscriptDoc) => {
    for (const imported of importsOf.get(file) ?? []) {
      importers.get(imported)?.delete(file)
    }
    const files = new Set<string>()
    for (const id of doc.imports.keys()) {
      if (id.startsWith('file://')) {
        files.add(fileUriToPath(id))
      }
    }
    for (const imported of files) {
      let set = importers.get(imported)
      if (!set) {
        set = new Set()
        importers.set(imported, set)
      }
      set.add(file)
    }
    importsOf.set(file, files)
  }

  /**
   * What `load` returns for `doc` in render `format`: its generated code, or (`error:`) the
   * first error it throws in strict mode. Logs the diagnostics when `report`.
   */
  const outcome = async (doc: AtscriptDoc, format: string, report: boolean) => {
    let error = ''
    // (a copy: the document caches its messages, and `changedModules` reads them again)
    for (const m of [...doc.getDiagMessages()].reverse()) {
      if (m.severity === 1) {
        if (report) {
          // oxlint-disable-next-line no-console
          console.log(doc.renderDiagMessage(m, true, true))
        }
        if (strict && !error) {
          error = m.message
        }
      } else if (m.severity === 2 && report) {
        // oxlint-disable-next-line no-console
        console.log(doc.renderDiagMessage(m, false, true))
      }
    }
    if (error) {
      return { error, code: `error:${error}` }
    }
    let out = await doc.render(format as never)
    if (!out?.[0]?.content && (format === JS_COMPILED_FORMAT || format === JS_INTERPRETED_FORMAT)) {
      // A config plugin that does not know the override formats.
      out = await doc.render('js')
    }
    return { code: out?.[0]?.content || '' }
  }

  /** The repo's document of `uri` as it is now (`undefined`: it does not open). */
  const currentDoc = async (uri: string): Promise<AtscriptDoc | undefined> => {
    try {
      const doc = await repo.openDocument(uri)
      await repo.checkImports(doc)
      return doc
    } catch {
      return undefined
    }
  }

  /**
   * The `.as` modules (by file) importing `id`'s, directly or not, also through an import of it
   * that did not resolve: evaluated again with it in a hot update.
   */
  const dependantsOf = (id: string) => {
    const files = new Set<string>()
    const add = (doc: AtscriptDoc | undefined) => {
      for (const d of doc?.transitive('dependants') ?? []) {
        files.add(fileUriToPath(d.id))
      }
    }
    add(loaded.get(id))
    for (const file of importers.get(id) ?? []) {
      files.add(file)
      add(loaded.get(file))
    }
    files.delete(id)
    return files
  }
  const candidatesOf = (id: string) => {
    const files = dependantsOf(id)
    // (and those that read it without importing it: a block's warning lists the documents
    // using its target, see `recordDocumentReads`)
    const uri = `file://${id}`
    for (const [file, ids] of reads) {
      if (ids.has(uri)) {
        files.add(file)
      }
    }
    files.delete(id)
    return files
  }

  /**
   * The documents (by id) each loaded `.as` module's `load` result was derived from: those its
   * resolutions read (see `recordDocumentReads`) and those it imports.
   */
  const reads = new Map<string, Set<string>>()

  /** Records `read` (and the documents `doc` imports) as what `file`'s `load` result read. */
  const recordReads = (file: string, doc: AtscriptDoc, read: Set<AtscriptDoc>, merge: boolean) => {
    const ids = merge ? (reads.get(file) ?? new Set<string>()) : new Set<string>()
    for (const d of read) {
      ids.add(d.id)
    }
    for (const id of doc.imports.keys()) {
      ids.add(id)
    }
    reads.set(file, ids)
  }

  /**
   * `candidates` (files) whose `load` result changes with document `uri` changed to `text`:
   * the document is updated in place (its importers keep referring to it), and the candidates
   * whose last `load` read it (see `reads`) are rendered again in every format they were loaded
   * in — all of them when its generated imports changed (the import cycles they are in may
   * change), or when a candidate rendered again has new imports. Its importers are parsed
   * and checked again first (their diagnostics are those of its imports as they are now), from
   * the repo's documents (from disk when the repo dropped one: deleted, created again) — never
   * from a closed document; the checks share what they checked (each document's imports once).
   */
  const changedModules = async (
    uri: string,
    text: string,
    candidates: Set<string>
  ): Promise<Set<string>> => {
    const changedFile = fileUriToPath(uri)
    const before = served.get(changedFile)
    const beforeImports = before ? importLines(before.values()) : undefined
    const checked = new Set<string>()
    const changedDoc = await repo.openDocument(uri, text)
    await repo.checkImports(changedDoc, checked)
    let all = beforeImports === undefined
    if (!all) {
      const after: string[] = []
      for (const format of before!.keys()) {
        after.push((await outcome(changedDoc, format, false)).code)
      }
      all = importLines(after) !== beforeImports
    }
    const importing = importers.get(changedFile) ?? new Set<string>()
    const changed = new Set<string>()
    const docs = new Map<string, AtscriptDoc>()
    for (const file of candidates) {
      if (!loaded.has(file) || !served.has(file)) {
        changed.add(file)
      } else if (importing.has(file)) {
        try {
          const id = loaded.get(file)!.id
          // The repo's document (or the file, when the repo dropped it): its text is the same,
          // its diagnostics derived from its imports are computed again.
          const current = await repo.openDocument(id)
          current.clearMessages()
          docs.set(file, current)
        } catch {
          changed.add(file)
        }
      }
    }
    for (const doc of docs.values()) {
      checked.delete(doc.id)
      await repo.checkImports(doc, checked)
    }
    const rendered = new Set<string>()
    const render = async (file: string) => {
      rendered.add(file)
      const doc = docs.get(file) ?? loaded.get(file)!
      if (!docs.has(file)) {
        // Its diagnostics derived from the documents it reads are computed again.
        doc.clearMessages()
      }
      loaded.set(file, doc)
      const formats = served.get(file)!
      const recording = recordDocumentReads()
      const codes: string[] = []
      try {
        for (const format of formats.keys()) {
          codes.push((await outcome(doc, format, false)).code)
        }
      } finally {
        recordReads(file, doc, recording.stop(), false)
      }
      if (
        codes.some((code, i) => code !== [...formats.values()][i]) ||
        loggedOf(doc) !== logged.get(file)
      ) {
        changed.add(file)
        if (!all && importLines(codes) !== importLines(formats.values())) {
          all = true
        }
      }
    }
    const pending = () =>
      [...candidates].filter(
        file =>
          !rendered.has(file) &&
          !changed.has(file) &&
          (all || importing.has(file) || !reads.has(file) || reads.get(file)!.has(uri))
      )
    for (let queue = pending(); queue.length > 0; queue = pending()) {
      for (const file of queue) {
        await render(file)
      }
    }
    for (const file of staleWarnings(new Set([...rendered, ...changed]))) {
      changed.add(file)
    }
    return changed
  }

  /**
   * The served modules (but `skip`) whose mutating blocks annotate another module's type and
   * whose diagnostics changed: the warning of a block not reachable from the files using the type
   * derives from documents they need not import (those files, see `blockDependencies`), so it is
   * computed again.
   */
  const staleWarnings = (skip: Set<string>): string[] => {
    const out: string[] = []
    for (const [file, doc] of loaded) {
      if (!skip.has(file) && served.has(file) && annotatedModules(doc).size > 0) {
        doc.clearMessages()
        if (loggedOf(doc) !== logged.get(file)) {
          out.push(file)
        }
      }
    }
    return out
  }

  return {
    name: 'unplugin-atscript',

    vite: {
      /**
       * Prebundle the runtime helper module.
       *
       * The JS this plugin renders for every `.as` module imports
       * `@atscript/typescript/utils`, but that module body only exists after
       * `load` has run — Vite's static dependency scanner never sees the import.
       * In dev the first `.as`-backed route therefore triggers
       * "new dependencies optimized: @atscript/typescript/utils" followed by a
       * full page reload in the middle of a client-side navigation. Declaring the
       * entry up front makes Vite prebundle it with everything else.
       *
       * Only client-side `optimizeDeps` is touched; SSR does not prebundle and
       * shows no such reload.
       */
      config(userConfig: TViteUserConfig) {
        // `config` runs before `configResolved`, so apply Vite's own root rule
        // here; `configResolved` overwrites it with the resolved root.
        detectedRoot = path.resolve(userConfig.root ?? process.cwd())
        const root = getRoot()
        const listed = userConfig.optimizeDeps?.include?.includes(RUNTIME_ENTRY) ?? false
        // An include entry that cannot be resolved makes Vite warn
        // "Failed to resolve dependency" on every start.
        return listed || !isResolvableFrom(RUNTIME_ENTRY, root)
          ? undefined
          : { optimizeDeps: { include: [RUNTIME_ENTRY] } }
      },

      /**
       * Adopt Vite's own project root so `atscript.config.*` is discovered from
       * the directory Vite actually builds, not from the working directory the
       * process happened to start in. An explicit `root` option still wins.
       */
      configResolved(config: TViteResolvedConfig) {
        detectedRoot = config.root
      },

      configureServer(server: TViteDevServer) {
        viteServer = server
      },

      /**
       * Adds to a hot update of a changed `.as` file the modules whose generated code depends on
       * it (see `watchChange`, which re-transforms them), so the update reaches them too.
       */
      hotUpdate(
        this: {
          environment: {
            moduleGraph: TViteModuleGraph
            hot?: { send: (payload: { type: 'full-reload' }) => void }
          }
        },
        options: { file: string; modules: unknown[] }
      ) {
        if (reload.has(options.file)) {
          // (a change to a module with blocks reloads the page in full)
          this.environment.hot?.send({ type: 'full-reload' })
          return []
        }
        const files = affected.get(options.file)
        return files && files.size > 0
          ? [...new Set([...options.modules, ...modulesOf(this.environment.moduleGraph, files)])]
          : undefined
      },

      /** {@link hotUpdate} of Vite before its environment API (Vite 5). */
      handleHotUpdate(ctx: { file: string; modules: unknown[]; server: TViteDevServer }) {
        if (!ctx.server.environments && reload.has(ctx.file)) {
          ctx.server.ws?.send({ type: 'full-reload' })
          return []
        }
        const files = affected.get(ctx.file)
        return ctx.server.environments || !files || files.size === 0
          ? undefined
          : [...new Set([...ctx.modules, ...modulesOf(ctx.server.moduleGraph, files)])]
      },
    },

    resolveId(id, importer) {
      if (importer && id.endsWith('.as')) {
        // Bare specifiers (e.g., 'my-lib/user.as') — let bundler's native resolution handle it.
        // The package.json exports will resolve to compiled .as.mjs/.as.js.
        if (!id.startsWith('.') && !id.startsWith('/')) {
          return null
        }
        const resolved = path.join(path.dirname(importer), id)
        // In the dts graph, serving the JS render would bind the symbol to a JS
        // chunk and ship it untyped — resolve to a `<file>.as.d.ts` id instead,
        // which `load` serves via render('dts').
        if (RE_DTS.test(importer)) {
          return `${resolved}.d.ts`
        }
        return resolved
      }
    },

    async load(id, options?: TLoadOptions) {
      // `<file>.as.d.ts` ids are produced by `resolveId` for the dts graph; the
      // declaration is rendered fresh from the `.as` source, so it never depends
      // on (possibly stale) asc-emitted artifacts on disk.
      const isDts = id.endsWith('.as.d.ts')
      const sourceId = isDts ? id.slice(0, -'.d.ts'.length) : id
      if (sourceId.endsWith('.as')) {
        if (!repo) {
          const config = await getConfig()
          if (!config.plugins) {
            config.plugins = [ts()]
          }
          repo = new AtscriptRepo(getRoot(), config as TAtscriptConfigInput)
        }
        const code = (await readFile(sourceId, 'utf8')).toString()
        // What its `load` result is derived from (see `changedModules`).
        const recording = isDts ? undefined : recordDocumentReads()
        let doc: AtscriptDoc
        let result: { error?: string; code: string } | undefined
        let format = 'js'
        try {
          doc = await repo.openDocument(`file://${sourceId}`, code)
          await repo.checkDoc(doc)
          if (!isDts) {
            const compile = opts?.compileValidators
            // Render formats of @atscript/typescript overriding its `compileValidators` option.
            format =
              compile === undefined
                ? 'js'
                : compile === true || (compile === 'ssr' && isServerLoad(this, options))
                  ? JS_COMPILED_FORMAT
                  : JS_INTERPRETED_FORMAT
            result = await outcome(doc, format, true)
          }
        } finally {
          const read = recording?.stop()
          if (read && doc!) {
            recordReads(sourceId, doc, read, served.has(sourceId))
          }
        }
        addTransitiveWatchFiles(this, doc)
        if (isDts) {
          const { error, code: content } = await outcome(doc, 'dts', true)
          if (error) {
            throw new Error(error)
          }
          return {
            // Strip the `/// <reference path="./<name>.as" />` editor association:
            // the declaration bundler re-emits reference directives into the final
            // chunk, where the relative .as path would not exist.
            code: content.replace(/^\/{3}\s*<reference\s+path=[^\n]*\n/m, ''),
            map: null,
          }
        }
        loaded.set(sourceId, doc)
        recordImports(sourceId, doc)
        let formats = served.get(sourceId)
        if (!formats) {
          formats = new Map()
          served.set(sourceId, formats)
        }
        formats.set(format, result!.code)
        logged.set(sourceId, loggedOf(doc))
        if (result!.error) {
          throw new Error(result!.error)
        }
        // A module with mutating annotates, or on an import cycle with them (its statements wait
        // for the cycle's other modules): kept even when none of its exports is used.
        const sideEffects = hasBlocks(doc) || importCycle(doc)
        return {
          code: result!.code,
          moduleType: 'js',
          map: null,
          moduleSideEffects: sideEffects ? undefined : false,
        }
      }
    },

    /**
     * Drop a changed `.as` file from the repo's document cache.
     *
     * The repo reads an imported document from disk once and then caches it
     * forever, and the bundler re-transforms the *importer* first (its
     * transform is what pulls the import in). Without this hook the importer
     * would be re-checked against the stale import — failing the reload in
     * strict mode before the changed file's own `load` ever ran, and failing
     * the same way on every reload after that until the process restarts.
     * `watchChange` runs before anything is re-transformed, so closing the
     * document here guarantees the next check re-reads it from disk.
     *
     * Every event kind is handled the same way: `create` is a no-op unless
     * something was already cached under that id, `update` and `delete` drop
     * the stale document (a deleted import then reports `"..." not found`).
     *
     * In Vite, the modules whose generated code depends on the file are
     * re-transformed too (see below and `hotUpdate`).
     */
    async watchChange(id, change?: { event: 'create' | 'update' | 'delete' }) {
      if (!repo || !id.endsWith('.as')) {
        return
      }
      const uri = `file://${id}`
      // The generated code of the modules importing it (directly or not, also through an import
      // that did not resolve: a deleted file created again) may be stale too: they inline its
      // definitions, and those of its import cycle queue their statements together. Vite would
      // reuse their transforms (it
      // soft-invalidates importers): those whose code changed are invalidated here, before
      // Vite handles the change, with or without HMR (a server-side module runner importing the
      // app again, `ssrLoadModule`).
      const candidates = candidatesOf(id)
      // (a block writes into its target's nodes, with no undo — a hot update
      // evaluating a module with blocks again, the changed one before or after the change or one
      // importing it, reloads the page in full, every module fresh)
      // (a module importing it evaluated again with blocks on a type whose module is not:
      // the type keeps the old writes — a full reload too)
      const evaluated = new Set([id, ...dependantsOf(id)])
      const blocksOutside = () =>
        [...evaluated].some(f => [...annotatedModules(loaded.get(f))].some(t => !evaluated.has(t)))
      const blocksBefore = hasBlocks(loaded.get(id)) || blocksOutside()
      const text =
        viteServer && change?.event === 'update'
          ? await readFile(id, 'utf8').catch(() => undefined)
          : undefined
      let files = candidates
      if (text === undefined) {
        // Created or deleted (or not in Vite): re-read on the next load, with the modules
        // that may depend on it — and its own (and their importers): created again, those
        // Vite kept do not reload otherwise.
        repo.closeDocument(uri)
        files = new Set([...candidates, id])
        if (change?.event === 'create') {
          // (read now: the documents it uses know it, for the warnings below)
          try {
            await repo.checkImports(await repo.openDocument(uri), new Set())
          } catch {
            repo.closeDocument(uri)
          }
        }
        for (const file of staleWarnings(files)) {
          files.add(file)
        }
      } else {
        try {
          files = await changedModules(uri, text, candidates)
        } catch {
          repo.closeDocument(uri)
        }
      }
      if (blocksBefore || hasBlocks(await currentDoc(uri)) || blocksOutside()) {
        // (every `.as` module served: evaluated again from scratch, see `hotUpdate`)
        files = new Set([...files, ...served.keys(), id])
        reload.add(id)
      } else {
        reload.delete(id)
      }
      affected.set(id, files)
      if (viteServer && files.size > 0) {
        invalidateFiles(viteServer, files)
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

/** @deprecated Use `import atscript from 'unplugin-atscript/vite'` (or /rollup, /webpack, etc.) instead */
export const asPlugin = unplugin

export default unplugin
