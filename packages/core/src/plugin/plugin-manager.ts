import { readFile } from 'node:fs/promises'

import { defu } from 'defu'

import type { AnnotationSpec } from '../annotations'
import { isAnnotationSpec } from '../annotations'
import type { TOutput } from '../build'
import type { TAnnotationsTree, TAtscriptConfig } from '../config'
import { getDefaultAtscriptConfig } from '../default-atscript-config'
import type { AtscriptDoc, TAtscriptDocConfig } from '../document'
import { SemanticPrimitiveNode } from '../parser/nodes'
import type { AtscriptRepo } from '../repo'
import type { TAtscriptRenderFormat, TPluginOutput } from './types'

export interface TOutputWithSource extends TPluginOutput {
  source: string
}

export class PluginManager {
  constructor(private readonly cfg: TAtscriptConfig) {}

  private _config!: TAtscriptConfig

  name = 'plugin-manager'

  protected _docConfig: TAtscriptDocConfig | undefined

  get plugins() {
    return this.cfg.plugins ?? []
  }

  async getDocConfig(): Promise<TAtscriptDocConfig> {
    if (!this._docConfig) {
      const raw = await this.config()
      this._docConfig = {}
      if (raw?.primitives) {
        this._docConfig.primitives = this._docConfig.primitives || new Map()
        for (const [key, value] of Object.entries(raw.primitives)) {
          this._docConfig.primitives.set(
            key,
            new SemanticPrimitiveNode(key, value, '', raw.annotations)
          )
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

  async config(config: TAtscriptConfig = this.cfg): Promise<TAtscriptConfig> {
    if (!this._config) {
      const processed = new Set<string>()
      config = defu(config, getDefaultAtscriptConfig())
      const filtered = this.plugins.filter(plugin => !processed.has(plugin.name))
      let i = 0
      while (processed.size !== filtered.length) {
        i++
        for (const plugin of filtered) {
          if (processed.has(plugin.name)) {
            continue
          }
          config = defu(await plugin.config?.(config), config)
          processed.add(plugin.name)
        }
        if (i > 100) {
          throw new Error(`Too many iterations in config`)
        }
      }
      this._config = config
    }
    return this._config
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

  async onDocument(doc: AtscriptDoc) {
    for (const plugin of this.plugins) {
      if (plugin.onDocument) {
        await plugin.onDocument(doc)
      }
    }
  }

  async render(doc: AtscriptDoc, format: TAtscriptRenderFormat) {
    const files: TOutputWithSource[] = []
    for (const plugin of this.plugins) {
      if (plugin.render) {
        const newFiles = await plugin.render(doc, format)
        if (newFiles?.length > 0) {
          files.push(
            ...newFiles.map(f => ({
              ...f,
              source: doc.id.startsWith('file://') ? doc.id.slice(7) : doc.id,
            }))
          )
        }
      }
    }
    return files
  }

  async buildEnd(output: TOutput[], format: TAtscriptRenderFormat, repo: AtscriptRepo) {
    for (const plugin of this.plugins) {
      if (plugin.buildEnd) {
        await plugin.buildEnd(output, format, repo)
      }
    }
  }

  async loopInAnnotationsSpec(cb: (name: string, a: AnnotationSpec) => void) {
    const config = await this.config()
    const annotations = config.annotations || {}
    return this._loopInAnnotationsSpec(annotations, cb)
  }

  private _loopInAnnotationsSpec(
    annotations: TAnnotationsTree,
    cb: (name: string, a: AnnotationSpec) => void,
    prefix?: string
  ) {
    for (const [key, value] of Object.entries(annotations)) {
      if (isAnnotationSpec(value)) {
        cb(prefix ? `${prefix}.${key}` : key, value)
      } else {
        this._loopInAnnotationsSpec(value, cb, prefix ? `${prefix}.${key}` : key)
      }
    }
  }
}
