/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import type { TINtertationConfig } from './config'
import { loadConfig, resolveConfigFile } from './config/load-config'
import { getDefaultItnConfig } from './default-itn-config'
import type { TItnDocumentConfig } from './document'
import { ItnDocument } from './document'
import { SemanticPrimitiveNode } from './parser/nodes'
import type { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { resolveItnFromPath } from './parser/utils'

interface TConfigCache {
  compiled: TItnDocumentConfig
  file?: string
  dependants: Set<string>
}

export class ItnRepo {
  constructor(private readonly root = process.cwd()) {}

  /**
   * Configs cache
   */
  protected readonly configs = new Map<string, Promise<TConfigCache>>()

  /**
   * Itn Documents cache
   */
  protected readonly itn = new Map<string, Promise<ItnDocument>>()

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

  async openDocument(id: string, text?: string): Promise<ItnDocument> {
    let itnDoc = this.itn.get(id)
    if (itnDoc) {
      if (text) {
        itnDoc.then(d => {
          d.update(text)
          return d
        })
      }
    } else {
      itnDoc = this._openDocument(id, text)
      itnDoc.catch(() => {
        this.itn.delete(id)
      })
      this.itn.set(id, itnDoc)
    }
    return itnDoc
  }

  protected async _openDocument(id: string, text?: string): Promise<ItnDocument> {
    const filePath = decodeURI(id.slice(7))
    if (existsSync(filePath)) {
      const { compiled } = await this.resolveConfig(id)
      const itnDoc = new ItnDocument(id, compiled)
      itnDoc.update(text || (await readFile(filePath, 'utf8')).toString())
      return itnDoc
    }
    throw new Error(`File not found: ${filePath}`)
  }

  async checkDoc(itnDoc: ItnDocument) {
    await this.checkImports(itnDoc)
  }

  async checkImports(itnDoc: ItnDocument) {
    const promise = Promise.all(
      Array.from(itnDoc.imports.values(), async ({ from, imports }) =>
        this.checkImport(itnDoc, from, imports)
      )
    )
    const results = await promise
    itnDoc.updateDependencies(results.filter(Boolean) as ItnDocument[])
  }

  async checkImport(
    itnDoc: ItnDocument,
    from: Token,
    imports: Token[]
  ): Promise<ItnDocument | undefined> {
    const forId = resolveItnFromPath(from.text, itnDoc.id)
    if (forId === itnDoc.id) {
      const messages = itnDoc.getDiagMessages()
      messages.push({
        severity: 1,
        message: '"import" cannot import itself',
        range: from.range,
      })
      return
    }
    const errors = [] as TMessages
    let external: ItnDocument | undefined
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
      const messages = itnDoc.getDiagMessages()
      messages.push(...errors)
    }
    return external
  }
}

function compileConfig(raw?: TINtertationConfig): TItnDocumentConfig {
  const itnConfig = getDefaultItnConfig()
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
