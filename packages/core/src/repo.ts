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
import { SemanticPrimitiveNode } from './parser/nodes'

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

  async getPrimitivesFlags() {
    const manager = await this.getSharedPluginManager()
    if (!manager) {
      return undefined
    }
    const docConfig = await manager.getDocConfig()
    const primitives = Array.from(docConfig.primitives?.entries() || [])
    const flags = [] as string[]
    const processed = new Set<SemanticPrimitiveNode>()
    for (const [, primitive] of primitives) {
      flags.push(...primitive.getAllFlags(processed))
    }
    return new Set(flags)
  }

  async getUsedAnnotations() {
    type TAnnotationValue = {
      optional?: boolean
      type: 'string' | 'number' | 'boolean' | 'unknown'
    }
    type TAnnotationValueObj = { type: 'object'; props: Record<string, TAnnotationValue> }
    type TUsedAnnotation = {
      multiple?: boolean
      fromSpec?: boolean
      typeSet: Set<string>
      types: (TAnnotationValueObj | TAnnotationValue)[]
    }
    const manager = await this.getSharedPluginManager()
    const annotations = {} as Record<string, TUsedAnnotation | undefined>

    if (manager) {
      await manager.loopInAnnotationsSpec((name, spec) => {
        const types = [] as TUsedAnnotation['types']
        const multiple = !!spec.config.multiple
        if (Array.isArray(spec.config.argument)) {
          // object
          const o = { type: 'object', props: {} } as TAnnotationValueObj
          for (const a of spec.arguments) {
            o.props[a.name] = {
              type: a.type,
              optional: a.optional,
            }
          }
          types.push(o)
        } else if (spec.config.argument) {
          // argument.type
          types.push({
            type: spec.config.argument.type,
            optional: spec.config.argument.optional,
          })
        } else {
          // boolean
          types.push({ type: 'boolean' })
        }

        annotations[name] = {
          multiple,
          fromSpec: true,
          typeSet: new Set(),
          types,
        }
      })
    }

    for (const doc of Array.from(this.anscripts.values())) {
      const awaited = await doc
      for (const { name, token, args } of awaited.annotations) {
        if (annotations[name]?.fromSpec) {
          continue
        }
        if (!annotations[name]) {
          let types = [] as TUsedAnnotation['types']
          let multiple = false
          annotations[name] = {
            multiple,
            fromSpec: false,
            typeSet: new Set(),
            types,
          }
        }
        const isArray = token.parentNode!.countAnnotations(name) > 1
        if (isArray) {
          annotations[name].multiple = true
        }
        for (const arg of args) {
          if (arg.type === 'text') {
            if (!annotations[name].typeSet.has('string')) {
              annotations[name].typeSet.add('string')
              annotations[name].types.push({ type: 'string' })
            }
          } else if (arg.type === 'number') {
            if (!annotations[name].typeSet.has('number')) {
              annotations[name].typeSet.add('number')
              annotations[name].types.push({ type: 'number' })
            }
          } else if (arg.type === 'identifier' && ['true', 'false'].includes(arg.text)) {
            if (!annotations[name].typeSet.has('boolean')) {
              annotations[name].typeSet.add('boolean')
              annotations[name].types.push({ type: 'boolean' })
            }
          } else if (!annotations[name].typeSet.has('unknown')) {
            annotations[name].typeSet.add('unknown')
            annotations[name].types.push({ type: 'unknown' })
          }
        }
        if (args.length === 0 && !annotations[name].typeSet.has('boolean')) {
          annotations[name].typeSet.add('boolean')
          annotations[name].types.push({ type: 'boolean' })
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
