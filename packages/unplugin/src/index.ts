import { readFile } from 'fs/promises'
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
}

export const unpluginFactory: UnpluginFactory<atscriptPluginOptions | undefined> = opts => {
  const root = process.cwd()
  const strict = opts?.strict ?? true
  let repo: AtscriptRepo
  let configPromise: Promise<TAtscriptConfig> | undefined

  // Lazy + guarded: only probes for a config when an .as file is actually loaded.
  // A missing config resolves to an empty config (the `load` hook fills in the
  // default `ts()` plugin) instead of crashing the host process with an unhandled
  // rejection. Errors now surface inside `load()`, where the bundler can report them.
  const getConfig = () =>
    (configPromise ??= (async () => {
      const p = await resolveConfigFile(root)
      return p ? loadConfig(p) : {}
    })())

  return {
    name: 'unplugin-atscript',

    resolveId(id, importer) {
      if (importer && id.endsWith('.as')) {
        // Bare specifiers (e.g., 'my-lib/user.as') — let bundler's native resolution handle it.
        // The package.json exports will resolve to compiled .as.mjs/.as.js.
        if (!id.startsWith('.') && !id.startsWith('/')) {
          return null
        }
        return path.join(path.dirname(importer), id)
      }
    },

    async load(id) {
      if (id.endsWith('.as')) {
        if (!repo) {
          const config = await getConfig()
          if (!config.plugins) {
            config.plugins = [ts()]
          }
          repo = new AtscriptRepo(root, config as TAtscriptConfigInput)
        }
        const code = (await readFile(id, 'utf8')).toString()
        const doc = await repo.openDocument(`file://${id}`, code)
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
