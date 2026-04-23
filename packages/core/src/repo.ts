/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from 'node:path'

import type { TAtscriptConfigInput, TAtscriptConfigOutput } from './config'
import { loadConfig, resolveConfigFile } from './config/load-config'
import { AtscriptDoc } from './document'
import type { SemanticPrimitiveNode } from './parser/nodes'
import type { Token } from './parser/token'
import { resolveAtscriptFromPath } from './parser/utils'
import { PluginManager } from './plugin/plugin-manager'
import { isBareId, resolveBareSpecifier } from './resolve-bare'

export interface TPluginManagers {
  manager: PluginManager
  file?: string
  dependants: Set<string>
}

export class AtscriptRepo {
  constructor(
    public readonly root = process.cwd(),
    public readonly sharedConfig?: TAtscriptConfigInput
  ) {}

  protected configFormat?: 'esm' | 'cjs'

  /**
   * Configs cache
   */
  protected readonly configs = new Map<string, Promise<TPluginManagers>>()

  /**
   * .as Documents cache
   */
  protected readonly atscripts = new Map<string, Promise<AtscriptDoc>>()

  public sharedPluginManager: TPluginManagers | undefined

  /**
   * Maps resolved file:// URIs back to bare specifiers (for LSP auto-import).
   */
  public readonly resolvedToBare = new Map<string, string>()

  /**
   * cache for raw content of config files
   */
  protected configFiles = new Map<
    string,
    Promise<Partial<TAtscriptConfigInput & TAtscriptConfigOutput>>
  >()

  getSharedPluginManager() {
    return this.sharedPluginManager?.manager
  }

  async getPrimitivesTags() {
    const manager = await this.getSharedPluginManager()
    if (!manager) {
      return undefined
    }
    const docConfig = await manager.getDocConfig()
    const primitives = Array.from(docConfig.primitives?.entries() || [])
    const tags = [] as string[]
    const processed = new Set<SemanticPrimitiveNode>()
    for (const [, primitive] of primitives) {
      tags.push(...primitive.getAllTags(processed))
    }
    return new Set(tags)
  }

  async getUsedAnnotations() {
    const ANNOTATION_TYPE_MAP: Record<string, string> = {
      ref: 'import("@atscript/typescript/utils").AtscriptRef',
      query: 'import("@atscript/typescript/utils").AtscriptQueryNode',
    }
    const mapArgType = (t: string) => ANNOTATION_TYPE_MAP[t] || t
    type TAnnotationValue = {
      optional?: boolean
      type: string
    }
    type TAnnotationValueObj = { type: 'object'; props: Record<string, TAnnotationValue> }
    type TUsedAnnotation = {
      multiple?: boolean
      fromSpec?: boolean
      typeSet: Set<string>
      types: Array<TAnnotationValueObj | TAnnotationValue>
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
              type: mapArgType(a.type),
              optional: a.optional,
            }
          }
          types.push(o)
        } else if (spec.config.argument) {
          // argument.type
          types.push({
            type: mapArgType(spec.config.argument.type),
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

    for (const doc of Array.from(this.atscripts.values())) {
      const awaited = await doc
      for (const { name, token, args } of awaited.annotations) {
        if (annotations[name]?.fromSpec) {
          continue
        }
        if (!annotations[name]) {
          const types = [] as TUsedAnnotation['types']
          const multiple = false
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
      if (!this.configFiles.has(configFile)) {
        const rawConfigPromise = loadConfig(configFile, this.configFormat)
        this.configFiles.set(configFile, rawConfigPromise)
      }
      const rawConfig = await this.configFiles.get(configFile)!
      if (!rawConfig.rootDir) {
        rawConfig.rootDir = path.dirname(configFile)
      }
      const manager = new PluginManager(rawConfig)
      await manager.getDocConfig()
      return {
        file: configFile,
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

  async openDocument(id: string, text?: string): Promise<AtscriptDoc> {
    let atscript = this.atscripts.get(id)
    if (atscript) {
      if (text) {
        atscript = atscript.then(d => {
          d.update(text)
          return d
        })
        this.atscripts.set(id, atscript)
      }
    } else {
      atscript = this._openDocument(id, text) as Promise<AtscriptDoc>
      atscript.catch(() => {
        this.atscripts.delete(id)
      })
      this.atscripts.set(id, atscript)
    }
    return atscript
  }

  protected async _openDocument(id: string, text?: string): Promise<AtscriptDoc> {
    const { manager } = await this.resolveConfig(id)
    const newId = await manager.resolve(id)
    if (!newId) {
      throw new Error(`Document not resolved: ${id}`)
    }
    const content = text || (await manager.load(newId))
    if (typeof content !== 'string') {
      throw new TypeError(`Document not found: ${newId}`)
    }
    const atscript = new AtscriptDoc(id, await manager.getDocConfig(), manager)
    atscript.update(content)
    await manager.onDocument(atscript)
    return atscript
  }

  async checkDoc(atscript: AtscriptDoc) {
    await this.checkImports(atscript)
  }

  async checkImports(atscript: AtscriptDoc, checked?: Set<string>) {
    const _checked = checked || new Set<string>()
    if (_checked.has(atscript.id)) {
      return
    }
    _checked.add(atscript.id)
    const promise = Promise.all(
      Array.from(atscript.imports.values(), async ({ from, imports }) =>
        this.checkImport(atscript, from, imports, _checked)
      )
    )
    const results = await promise
    atscript.updateDependencies(results.filter(Boolean) as AtscriptDoc[])
  }

  async checkImport(
    atscript: AtscriptDoc,
    from: Token,
    imports: Token[],
    checked?: Set<string>
  ): Promise<AtscriptDoc | undefined> {
    let forId = resolveAtscriptFromPath(from.text, atscript.id)

    // Resolve bare specifier placeholders (bare:xxx.as) to actual file:// URIs
    if (isBareId(forId)) {
      const fromDir = atscript.id.slice(7).split('/').slice(0, -1).join('/')
      const resolved = await resolveBareSpecifier(from.text, fromDir)
      if (!resolved) {
        atscript.registerMessages([
          {
            severity: 1,
            message: `"${from.text}" not found`,
            range: from.range,
          },
        ])
        return
      }
      const resolvedUri = `file://${resolved}`
      atscript.resolvedImports.set(forId, resolvedUri)
      atscript.rekeyImport(forId, resolvedUri)
      this.resolvedToBare.set(resolvedUri, from.text)
      forId = resolvedUri
    }

    if (forId === atscript.id) {
      atscript.registerMessages([
        {
          severity: 1,
          message: '"import" cannot import itself',
          range: from.range,
        },
      ])
      return
    }
    let external: AtscriptDoc | undefined
    try {
      external = await this.openDocument(forId)
      // Recursively load transitive dependencies
      await this.checkImports(external, checked)
      for (const token of imports) {
        if (!external.exports.has(token.text)) {
          atscript.registerMessages([
            {
              severity: 1,
              message: `"${from.text}" has no exported member "${token.text}"`,
              range: token.range,
            },
          ])
        }
      }
    } catch (error) {
      atscript.registerMessages([
        {
          severity: 1,
          message: `"${from.text}" not found`,
          range: from.range,
        },
      ])
    }
    return external
  }
}
