import { readFile } from 'node:fs/promises'
import { TAnscriptConfig } from '../config'
import { defu } from 'defu'
import { AnscriptDoc, TAnscriptDocConfig } from '../document'
import type { TAnscriptRenderContext, TOutput } from './types'
import { getDefaultAnscriptConfig } from '../default-anscript-config'
import { SemanticPrimitiveNode } from '../parser/nodes'

export interface TOutputExtended extends TOutput {
  id: string
  target: string
}

export class PluginManager {
  constructor(private readonly cfg: TAnscriptConfig) {}

  name = 'plugin-manager'

  protected _docConfig: TAnscriptDocConfig | undefined

  get plugins() {
    return this.cfg.plugins ?? []
  }

  async getDocConfig(): Promise<TAnscriptDocConfig> {
    if (!this._docConfig) {
      const raw = await this.config(this.cfg)
      this._docConfig = getDefaultAnscriptConfig()
      if (raw?.primitives) {
        this._docConfig.primitives = this._docConfig.primitives || new Map()
        for (const [key, value] of Object.entries(raw.primitives)) {
          this._docConfig.primitives.set(key, new SemanticPrimitiveNode(key, value))
        }
      }
      if (raw?.annotations) {
        this._docConfig.annotations = this._docConfig.annotations || {}
        Object.assign(this._docConfig.annotations, raw.annotations)
      }
      this._docConfig.unknownAnnotation = raw?.unknownAnnotation
    }
    return this._docConfig
  }

  async config(config: TAnscriptConfig, processed = new Set<string>()): Promise<TAnscriptConfig> {
    const filtered = this.plugins.filter(plugin => !processed.has(plugin.name))
    for (const plugin of filtered) {
      if (processed.has(plugin.name)) continue
      defu(await plugin.config?.(config), config)
      processed.add(plugin.name)
    }
    if (processed.size !== filtered.length) {
      return this.config(config, processed)
    }
    return config
  }

  async resolve(id: string) {
    let newId = id as string | undefined
    for (const plugin of this.plugins) {
      if (plugin.resolve) {
        newId = await plugin.resolve(id)
      }
    }
    return newId
  }

  async load(id: string) {
    const filePath = id.startsWith('file://') ? id.slice(7) : id
    for (const plugin of this.plugins) {
      if (plugin.load) {
        const content = await plugin.load(id)
        if (content) {
          return content
        }
      }
    }
    const content = await readFile(filePath, 'utf8')
    return content.toString()
  }

  async onDocumnet(doc: AnscriptDoc) {
    for (const plugin of this.plugins) {
      if (plugin.onDocumnet) {
        await plugin.onDocumnet(doc)
      }
    }
  }

  async render(doc: AnscriptDoc, context: TAnscriptRenderContext) {
    const files: TOutputExtended[] = []
    for (const plugin of this.plugins) {
      if (plugin.render) {
        const newFiles = await plugin.render(doc, context)
        if (newFiles?.length > 0) {
          files.push(
            ...newFiles.map(f => ({
              ...f,
              id: doc.id,
              target: '',
            }))
          )
        }
      }
    }
    return files
  }
}
