import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { defu } from 'defu'

import type { AnnotationSpec } from '../annotations'
import { forEachAnnotationSpec } from '../annotations'
import type { TOutput } from '../build'
import type { TAtscriptConfig } from '../config'
import { getDefaultAtscriptConfig } from '../default-atscript-config'
import type { AtscriptDoc, TAtscriptDocConfig } from '../document'
import { SemanticPrimitiveNode } from '../parser/nodes'
import { fileUriToPath } from '../parser/utils'
import type { AtscriptRepo } from '../repo'
import type { TAtscriptRenderFormat, TAtscriptRenderOptions, TPluginOutput } from './types'

export interface TOutputWithSource extends TPluginOutput {
  source: string
}

export class PluginManager {
  constructor(
    private readonly cfg: TAtscriptConfig,
    /** The project root (absolute), the config's `rootDir` resolved. */
    private readonly root?: string
  ) {}

  /** The merged config: the plugins' `config` hooks run once per manager (again after a failure). */
  private _config?: Promise<TAtscriptConfig & { rootDir: string }>

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
        this._docConfig.primitives = new Map()
        for (const [key, value] of Object.entries(raw.primitives)) {
          this._docConfig.primitives.set(
            key,
            new SemanticPrimitiveNode(key, value, '', raw.annotations)
          )
        }
      }
      if (raw?.annotations) {
        this._docConfig.annotations = { ...raw.annotations }
      }
      this._docConfig.unknownAnnotation = raw?.unknownAnnotation
      this._docConfig.rootDir =
        this.root ??
        (this.cfg.rootDir && path.isAbsolute(this.cfg.rootDir) ? this.cfg.rootDir : undefined)
    }
    return this._docConfig
  }

  /**
   * The config merged with the defaults and every plugin's `config` hook. Its `rootDir` (also the
   * one the hooks receive) is the project root, absolute: the host's, else the config's `rootDir`
   * resolved against the working directory (as `build()` resolves a config without a file).
   */
  config(config: TAtscriptConfig = this.cfg): Promise<TAtscriptConfig & { rootDir: string }> {
    if (!this._config) {
      const merging = this.mergeConfig(config)
      this._config = merging
      // (a failure is not kept: the next call runs the hooks again)
      merging.catch(() => {
        if (this._config === merging) {
          this._config = undefined
        }
      })
    }
    return this._config
  }

  private async mergeConfig(config: TAtscriptConfig) {
    const rootDir = this.root ?? path.resolve(config.rootDir ?? '.')
    let merged: TAtscriptConfig = { ...defu(config, getDefaultAtscriptConfig()), rootDir }
    const seen = new Set<string>()
    for (const plugin of this.plugins) {
      if (seen.has(plugin.name)) {
        continue
      }
      seen.add(plugin.name)
      merged = defu(await plugin.config?.(merged), merged)
    }
    // (whatever a plugin returned)
    return { ...merged, rootDir }
  }

  /**
   * Starts a build: the plugins' `config` hooks (once per manager), then their `buildStart`
   * hooks in order, each awaited — before the host discovers or reads any `.as` file.
   */
  async buildStart() {
    const config = await this.config()
    for (const plugin of this.plugins) {
      if (plugin.buildStart) {
        await plugin.buildStart(config)
      }
    }
  }

  async resolve(id: string) {
    let newId: string | undefined = id
    for (const plugin of this.plugins) {
      if (plugin.resolve) {
        newId = (await plugin.resolve(newId!)) ?? newId
      }
    }
    return newId
  }

  async load(id: string) {
    const filePath = fileUriToPath(id)
    for (const plugin of this.plugins) {
      if (plugin.load) {
        const content = await plugin.load(id)
        if (content) {
          return content
        }
      }
    }
    return readFile(filePath, 'utf8')
  }

  async onDocument(doc: AtscriptDoc) {
    for (const plugin of this.plugins) {
      if (plugin.onDocument) {
        await plugin.onDocument(doc)
      }
    }
  }

  async render(doc: AtscriptDoc, format: TAtscriptRenderFormat, options?: TAtscriptRenderOptions) {
    const source = fileUriToPath(doc.id)
    const files: TOutputWithSource[] = []
    for (const plugin of this.plugins) {
      if (plugin.render) {
        const newFiles = await plugin.render(doc, format, options)
        if (newFiles?.length > 0) {
          files.push(...newFiles.map(f => ({ ...f, source })))
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
    forEachAnnotationSpec(config.annotations || {}, cb)
  }
}
