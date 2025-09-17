import path from 'path'
import {
  AtscriptRepo,
  loadConfig,
  resolveConfigFile,
  TAtscriptConfig,
  TAtscriptConfigInput,
} from '@atscript/core'
import ts from '@atscript/typescript'
import { readFile } from 'fs/promises'

import type { UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'

export interface atscriptPluginOptions {
  /**
   * When strict: true, atscript will throw an error if any document is not valid.
   * @default true
   */
  strict?: boolean
}

const atscriptPluginFactory: UnpluginFactory<atscriptPluginOptions | undefined> = opts => {
  const root = process.cwd()
  let atscriptConfig = new Promise<TAtscriptConfig>(resolve => {
    resolveConfigFile(root).then(p => {
      loadConfig(p!).then(resolve)
    })
  })
  const strict = opts?.strict ?? true
  let repo: AtscriptRepo
  return {
    name: 'atscript',

    resolveId(id, importer) {
      if (importer && id.endsWith('.as')) {
        return path.join(path.dirname(importer), id)
      }
    },

    async load(id) {
      if (id.endsWith('.as')) {
        if (!repo) {
          const config = await atscriptConfig
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
        return { code: out?.[0]?.content || '', moduleType: 'js', map: null }
      }
    },
  }
}

export const asPlugin = /* #__PURE__ */ createUnplugin(atscriptPluginFactory)

export default asPlugin
