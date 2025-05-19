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

export const atscriptPluginFactory: UnpluginFactory<undefined> = () => {
  const root = process.cwd()
  let atscriptConfig = new Promise<TAtscriptConfig>(resolve => {
    resolveConfigFile(root).then(p => {
      loadConfig(p!).then(resolve)
    })
  })
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
        const doc = await repo.openDocument('file://' + id, code)
        await repo.checkDoc(doc)
        // const messages = doc.getDiagMessages()
        const out = await doc.render('js')
        return { code: out?.[0]?.content || '', moduleType: 'js' }
      }
    },
  }
}

export const asPlugin = /* #__PURE__ */ createUnplugin(atscriptPluginFactory)

export default asPlugin
