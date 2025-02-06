import { readFile } from 'node:fs/promises'
import { TAnnotationsTree, TAnscriptConfig, TAnscriptConfigInput } from '../config'
import { defu } from 'defu'
import { AnscriptDoc, TAnscriptDocConfig } from '../document'
import type { TAnscriptRenderFormat, TPluginOutput } from './types'
import { getDefaultAnscriptConfig } from '../default-anscript-config'
import { SemanticPrimitiveNode } from '../parser/nodes'
import { TOutput } from '../build'
import { AnscriptRepo } from '../repo'
import { AnnotationSpec, isAnnotationSpec } from '../annotations'

export interface TOutputWithSource extends TPluginOutput {
  source: string
}

export class PluginManager {
  constructor(private readonly cfg: TAnscriptConfig) {}

  private _config!: TAnscriptConfig

  name = 'plugin-manager'

  protected _docConfig: TAnscriptDocConfig | undefined

  get plugins() {
    return this.cfg.plugins ?? []
  }

  async getDocConfig(): Promise<TAnscriptDocConfig> {
    if (!this._docConfig) {
      const raw = await this.config()
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

  async config(
    config: TAnscriptConfig = this.cfg,
    processed = new Set<string>()
  ): Promise<TAnscriptConfig> {
    if (!this._config) {
      const filtered = this.plugins.filter(plugin => !processed.has(plugin.name))
      for (const plugin of filtered) {
        if (processed.has(plugin.name)) continue
        config = defu(await plugin.config?.(config), config)
        processed.add(plugin.name)
      }
      if (processed.size !== filtered.length) {
        return this.config(config, processed)
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

  async onDocumnet(doc: AnscriptDoc) {
    for (const plugin of this.plugins) {
      if (plugin.onDocumnet) {
        await plugin.onDocumnet(doc)
      }
    }
  }

  async render(doc: AnscriptDoc, format: TAnscriptRenderFormat) {
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

  async buildEnd(output: TOutput[], format: TAnscriptRenderFormat, repo: AnscriptRepo) {
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
