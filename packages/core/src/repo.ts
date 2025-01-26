/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import type { TAnscriptConfig } from './config'
import { loadConfig, resolveConfigFile } from './config/load-config'
import { getDefaultAnscriptConfig } from './default-anscript-config'
import type { TAnscriptDocConfig } from './document'
import { AnscriptDoc } from './document'
import { SemanticPrimitiveNode } from './parser/nodes'
import type { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { resolveAnscriptFromPath } from './parser/utils'

interface TConfigCache {
  compiled: TAnscriptDocConfig
  file?: string
  dependants: Set<string>
}

export class AnscriptRepo {
  constructor(private readonly root = process.cwd()) {}

  /**
   * Configs cache
   */
  protected readonly configs = new Map<string, Promise<TConfigCache>>()

  /**
   * .as Documents cache
   */
  protected readonly anscripts = new Map<string, Promise<AnscriptDoc>>()

  async loadConfigFor(id: string): Promise<TConfigCache> {
    const configFile = await resolveConfigFile(id, this.root)
    if (configFile) {
      const rawConfig = await loadConfig(configFile)
      return {
        file: configFile,
        compiled: compileConfig(rawConfig),
        dependants: new Set(),
      }
    } else {
      return {
        compiled: {},
        dependants: new Set(),
      }
    }
  }

  async resolveConfig(id: string): Promise<TConfigCache> {
    let config = this.configs.get(id)
    if (!config) {
      config = this.loadConfigFor(id)
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
    const filePath = decodeURI(id.slice(7))
    if (existsSync(filePath)) {
      const { compiled } = await this.resolveConfig(id)
      const asncript = new AnscriptDoc(id, compiled)
      asncript.update(text || (await readFile(filePath, 'utf8')).toString())
      return asncript
    }
    throw new Error(`File not found: ${filePath}`)
  }

  async checkDoc(asncript: AnscriptDoc) {
    await this.checkImports(asncript)
  }

  async checkImports(asncript: AnscriptDoc) {
    const promise = Promise.all(
      Array.from(asncript.imports.values(), async ({ from, imports }) =>
        this.checkImport(asncript, from, imports)
      )
    )
    const results = await promise
    asncript.updateDependencies(results.filter(Boolean) as AnscriptDoc[])
  }

  async checkImport(
    asncript: AnscriptDoc,
    from: Token,
    imports: Token[]
  ): Promise<AnscriptDoc | undefined> {
    const forId = resolveAnscriptFromPath(from.text, asncript.id)
    if (forId === asncript.id) {
      const messages = asncript.getDiagMessages()
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
      const messages = asncript.getDiagMessages()
      messages.push(...errors)
    }
    return external
  }
}

function compileConfig(raw?: TAnscriptConfig): TAnscriptDocConfig {
  const itnConfig = getDefaultAnscriptConfig()
  if (raw?.primitives) {
    itnConfig.primitives = itnConfig.primitives || new Map()
    for (const [key, value] of Object.entries(raw.primitives)) {
      itnConfig.primitives.set(key, new SemanticPrimitiveNode(key, value))
    }
  }
  if (raw?.annotations) {
    itnConfig.annotations = itnConfig.annotations || {}
    Object.assign(itnConfig.annotations, raw.annotations)
  }
  return itnConfig
}
