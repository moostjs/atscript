/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from 'node:path'
import { TAnscriptConfigInput, TAnscriptConfigOutput } from './config'
import { loadConfig, resolveConfigFile } from './config/load-config'
import { AnscriptDoc } from './document'
import type { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { resolveAnscriptFromPath } from './parser/utils'
import { PluginManager } from './plugin/plugin-manager'
import { resolveAnnotation } from './annotations'

interface TPluginManagers {
  manager: PluginManager
  file?: string
  dependants: Set<string>
}

export class AnscriptRepo {
  constructor(
    public readonly root = process.cwd(),
    public readonly sharedConfig?: TAnscriptConfigInput
  ) {}

  protected configFormat?: 'esm' | 'cjs'

  /**
   * Configs cache
   */
  protected readonly configs = new Map<string, Promise<TPluginManagers>>()

  /**
   * .as Documents cache
   */
  protected readonly anscripts = new Map<string, Promise<AnscriptDoc>>()

  public sharedPluginManager: TPluginManagers | undefined

  /**
   * cache for raw content of config files
   */
  protected configFiles = new Map<
    string,
    Promise<Partial<TAnscriptConfigInput & TAnscriptConfigOutput>>
  >()

  getSharedPluginManager() {
    return this.sharedPluginManager?.manager
  }

  async getUsedAnnotations() {
    type TAnnotationValue = 'string' | 'number' | 'boolean' | 'unknown'
    type TAnnotationValueObj = Record<string, TAnnotationValue | undefined>
    type TUsedAnnotation = {
      isArray?: boolean
      fromSpec?: boolean
      types: Set<TAnnotationValueObj | TAnnotationValue>
    }
    const config = (await this.getSharedPluginManager()?.config()) || {}
    const annotations = {} as Record<string, TUsedAnnotation | undefined>
    for (const doc of Array.from(this.anscripts.values())) {
      const awaited = await doc
      for (const { name, token, args } of awaited.annotations) {
        if (!annotations[name]) {
          let types = new Set<TAnnotationValueObj | TAnnotationValue>()
          let isArray = false
          const fromSpec = resolveAnnotation(name, config.annotations)
          if (fromSpec) {
            isArray = !!fromSpec.config.multiple
            if (Array.isArray(fromSpec.config.argument)) {
              // object
              const o = {} as TAnnotationValueObj
              for (const a of fromSpec.arguments) {
                o[a.name] = a.type
              }
              types.add(o)
            } else if (fromSpec.config.argument) {
              // argument.type
              types.add(fromSpec.config.argument.type)
            } else {
              // boolean
              types.add('boolean')
            }
          }
          annotations[name] = {
            isArray,
            fromSpec: !!fromSpec,
            types,
          }
        }
        if (annotations[name].fromSpec) {
          continue
        }
        const isArray = token.parentNode!.countAnnotations(name) > 1
        if (isArray) {
          annotations[name].isArray = true
        }
        for (const arg of args) {
          if (arg.type === 'text') {
            annotations[name].types.add('string')
          } else if (arg.type === 'number') {
            annotations[name].types.add('number')
          } else if (arg.type === 'identifier' && ['true', 'false'].includes(arg.text)) {
            annotations[name].types.add('boolean')
          } else {
            annotations[name].types.add('unknown')
          }
        }
        if (args.length === 0) {
          annotations[name].types.add('boolean')
        }
      }
    }
    return annotations
  }

  async loadPluginManagerFor(id: string): Promise<TPluginManagers> {
    if (this.sharedConfig) {
      if (!this.sharedPluginManager) {
        this.sharedPluginManager = {
          manager: new PluginManager(this.sharedConfig),
          dependants: new Set(),
        }
      }
      return this.sharedPluginManager
    }
    const configFile = await resolveConfigFile(id, this.root)
    if (configFile) {
      const globalPathToConfig = path.join(this.root, configFile)
      if (!this.configFiles.has(globalPathToConfig)) {
        const rawConfigPromise = loadConfig(configFile, this.configFormat)
        this.configFiles.set(globalPathToConfig, rawConfigPromise)
      }
      const rawConfig = await this.configFiles.get(globalPathToConfig)!
      if (!rawConfig.rootDir) {
        rawConfig.rootDir = path.dirname(configFile)
      }
      const manager = new PluginManager(rawConfig)
      await manager.getDocConfig()
      return {
        file: globalPathToConfig,
        manager,
        dependants: new Set(),
      }
    } else {
      const manager = new PluginManager({
        rootDir: process.cwd(),
      })
      await manager.getDocConfig()
      return {
        manager,
        dependants: new Set(),
      }
    }
  }

  async resolveConfig(id: string): Promise<TPluginManagers> {
    let config = this.configs.get(id)
    if (!config) {
      config = this.loadPluginManagerFor(id)
      config.then(c => {
        c.dependants.add(id)
      })
      this.configs.set(id, config)
    }
    return config
  }

  async openDocument(id: string, text?: string): Promise<AnscriptDoc> {
    let anscript = this.anscripts.get(id)
    if (anscript) {
      if (text) {
        anscript.then(d => {
          d.update(text)
          return d
        })
      }
    } else {
      anscript = this._openDocument(id, text)
      anscript.catch(() => {
        this.anscripts.delete(id)
      })
      this.anscripts.set(id, anscript)
    }
    return anscript
  }

  protected async _openDocument(id: string, text?: string): Promise<AnscriptDoc> {
    const { manager } = await this.resolveConfig(id)
    const newId = await manager.resolve(id)
    if (!newId) {
      throw new Error(`Document not resolved: ${id}`)
    }
    const content = text || (await manager.load(newId))
    if (typeof content !== 'string') {
      throw new Error(`Document not found: ${newId}`)
    }
    const anscript = new AnscriptDoc(id, await manager.getDocConfig(), manager)
    anscript.update(content)
    await manager.onDocumnet(anscript)
    return anscript
  }

  async checkDoc(anscript: AnscriptDoc) {
    await this.checkImports(anscript)
  }

  async checkImports(anscript: AnscriptDoc) {
    const promise = Promise.all(
      Array.from(anscript.imports.values(), async ({ from, imports }) =>
        this.checkImport(anscript, from, imports)
      )
    )
    const results = await promise
    anscript.updateDependencies(results.filter(Boolean) as AnscriptDoc[])
  }

  async checkImport(
    anscript: AnscriptDoc,
    from: Token,
    imports: Token[]
  ): Promise<AnscriptDoc | undefined> {
    const forId = resolveAnscriptFromPath(from.text, anscript.id)
    if (forId === anscript.id) {
      const messages = anscript.getDiagMessages()
      messages.push({
        severity: 1,
        message: '"import" cannot import itself',
        range: from.range,
      })
      return
    }
    const errors = [] as TMessages
    let external: AnscriptDoc | undefined
    try {
      external = await this.openDocument(forId)
      for (const token of imports) {
        if (!external.exports.has(token.text)) {
          errors.push({
            severity: 1,
            message: `"${from.text}" has no exported member "${token.text}"`,
            range: token.range,
          })
        }
      }
    } catch (error) {
      errors.push({
        severity: 1,
        message: `"${from.text}" not found`,
        range: from.range,
      })
    }
    if (errors.length > 0) {
      const messages = anscript.getDiagMessages()
      messages.push(...errors)
    }
    return external
  }
}
