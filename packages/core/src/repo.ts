/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { TAnscriptConfigInput } from './config'
import { loadConfig, resolveConfigFile } from './config/load-config'
import { AnscriptDoc } from './document'
import type { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { resolveAnscriptFromPath } from './parser/utils'
import { PluginManager } from './plugin/plugin-manager'

interface TPluginManagers {
  manager: PluginManager
  file?: string
  dependants: Set<string>
}

export class AnscriptRepo {
  constructor(
    private readonly root = process.cwd(),
    private readonly forceConfig?: TAnscriptConfigInput
  ) {}

  /**
   * Configs cache
   */
  protected readonly configs = new Map<string, Promise<TPluginManagers>>()

  /**
   * .as Documents cache
   */
  protected readonly anscripts = new Map<string, Promise<AnscriptDoc>>()

  protected forcedManager: TPluginManagers | undefined

  async loadPluginManagerFor(id: string): Promise<TPluginManagers> {
    if (this.forceConfig) {
      if (!this.forcedManager) {
        this.forcedManager = {
          manager: new PluginManager(this.forceConfig),
          dependants: new Set(),
        }
      }
      return this.forcedManager
    }
    const configFile = await resolveConfigFile(id, this.root)
    if (configFile) {
      const rawConfig = await loadConfig(configFile)
      const manager = new PluginManager(rawConfig)
      await manager.getDocConfig()
      return {
        file: configFile,
        manager,
        dependants: new Set(),
      }
    } else {
      const manager = new PluginManager({})
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
