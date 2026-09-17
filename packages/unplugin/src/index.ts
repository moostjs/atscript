import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import path from 'path'

import type { TAtscriptConfig, TAtscriptConfigInput } from '@atscript/core'
import { AtscriptRepo, isAnnotate, loadConfig, resolveConfigFile } from '@atscript/core'
import { tsPlugin as ts } from '@atscript/typescript'
import type { UnpluginFactory } from 'unplugin'
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

function isResolvableFrom(specifier: string, from: string): boolean {
  try {
    createRequire(path.join(from, 'package.json')).resolve(specifier)
    return true
  } catch {
    return false
  }
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

  // Lazy + guarded: only probes for a config when an .as file is actually loaded.
  // A missing config resolves to an empty config (the `load` hook fills in the
  // default `ts()` plugin) instead of crashing the host process with an unhandled
  // rejection. Errors now surface inside `load()`, where the bundler can report them.
  const getConfig = () =>
    (configPromise ??= (async () => {
      const p = await resolveConfigFile(getRoot())
      return p ? loadConfig(p) : {}
    })())

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
        // `config` runs before `configResolved`, so the root has to be derived
        // from the user config here.
        const root = path.resolve(explicitRoot ?? userConfig.root ?? process.cwd())
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

    async load(id) {
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
        const doc = await repo.openDocument(`file://${sourceId}`, code)
        await repo.checkDoc(doc)
        const messages = doc.getDiagMessages().reverse()
        let error = ''
        for (const m of messages) {
          if (m.severity === 1) {
            // error
            // oxlint-disable-next-line no-console
            console.log(doc.renderDiagMessage(m, true, true))
            if (strict && !error) {
              error = m.message
            }
          } else if (m.severity === 2) {
            // warning
            // oxlint-disable-next-line no-console
            console.log(doc.renderDiagMessage(m, false, true))
          }
        }
        if (error) {
          throw new Error(error)
        }
        if (isDts) {
          const out = await doc.render('dts')
          // Strip the `/// <reference path="./<name>.as" />` editor association:
          // the declaration bundler re-emits reference directives into the final
          // chunk, where the relative .as path would not exist.
          const content = (out?.[0]?.content || '').replace(
            /^\/{3}\s*<reference\s+path=[^\n]*\n/m,
            ''
          )
          return {
            code: content,
            map: null,
          }
        }
        const out = await doc.render('js')
        const hasMutatingAnnotates = doc.nodes.some(n => isAnnotate(n) && n.isMutating)
        return {
          code: out?.[0]?.content || '',
          moduleType: 'js',
          map: null,
          moduleSideEffects: hasMutatingAnnotates ? undefined : false,
        }
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

/** @deprecated Use `import atscript from 'unplugin-atscript/vite'` (or /rollup, /webpack, etc.) instead */
export const asPlugin = unplugin

export default unplugin
