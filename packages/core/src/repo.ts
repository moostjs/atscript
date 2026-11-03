/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import path from 'node:path'

import type { TAtscriptConfigInput, TAtscriptConfigOutput } from './config'
import { loadConfig, resolveConfigFile } from './config/load-config'
import { isAnnotateDirective } from './defaults/annotate-annotations'
import { AtscriptDoc } from './document'
import { isAnnotate } from './parser/nodes'
import type { SemanticPrimitiveNode } from './parser/nodes'
import type { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { fileUriToPath, resolveAtscriptFromPath } from './parser/utils'
import { PluginManager } from './plugin/plugin-manager'
import { isBareId, resolveBareSpecifier } from './resolve-bare'

export interface TPluginManagers {
  manager: PluginManager
  file?: string
  dependants: Set<string>
}

/** Whether `doc` has a mutating `annotate` block (its generated module applies it). */
export function hasMutatingAnnotates(doc: AtscriptDoc): boolean {
  return doc.nodes.some(node => isAnnotate(node) && node.isMutating)
}

/**
 * The documents declaring the types the mutating `annotate` blocks of `doc` annotate, other than
 * `doc` itself: resolved as codegen and the runtime apply them (a block on a plain alias is a
 * block on what it aliases, see `AtscriptDoc.blockTarget`). Their runtime state (and generated
 * code, with bundled schemas) changes with these blocks.
 */
export function blockTargetDocuments(doc: AtscriptDoc): Set<AtscriptDoc> {
  const out = new Set<AtscriptDoc>()
  for (const node of doc.nodes) {
    if (isAnnotate(node) && node.isMutating) {
      const target = doc.blockTarget(node)?.doc
      if (target && target !== doc) {
        out.add(target)
      }
    }
  }
  return out
}

/**
 * What the diagnostics of the mutating `annotate` blocks of `doc` read besides the documents it
 * imports (directly or not): for each type they annotate that another document T declares (see
 * {@link blockTargetDocuments}), T, the documents importing T (those using it) and the documents
 * T and each of them import, directly or not (whether a block is reachable from them, see the
 * warning of `AtscriptDoc.getDiagMessages`). When one of these documents changes — its text, or
 * its imports (then also the documents it imports, now or before: their importers changed) —
 * `doc`'s diagnostics are computed again.
 */
export function blockDependencies(doc: AtscriptDoc): Set<AtscriptDoc> {
  const out = new Set<AtscriptDoc>()
  const add = (d: AtscriptDoc) => {
    if (out.has(d)) {
      // (added with the documents it imports, or as one of them)
      return
    }
    out.add(d)
    for (const dep of d.transitive('dependencies')) {
      out.add(dep)
    }
  }
  for (const target of blockTargetDocuments(doc)) {
    add(target)
    for (const user of target.dependants) {
      add(user)
    }
  }
  return out
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
      expr: 'import("@atscript/typescript/utils").AtscriptExprNode',
      order: 'import("@atscript/typescript/utils").AtscriptOrderItem[]',
      value: 'string | number | boolean',
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
        if (isAnnotateDirective(name)) {
          return
        }
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
        if (annotations[name]?.fromSpec || isAnnotateDirective(name)) {
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
          manager: new PluginManager(
            this.sharedConfig,
            path.resolve(this.root, this.sharedConfig.rootDir ?? '.')
          ),
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
      const manager = new PluginManager(
        rawConfig,
        path.resolve(path.dirname(configFile), rawConfig.rootDir)
      )
      await manager.getDocConfig()
      return {
        file: configFile,
        manager,
        dependants: new Set(),
      }
    } else {
      const manager = new PluginManager({ rootDir: process.cwd() }, process.cwd())
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
      // (an empty text is a text: a file emptied is parsed as empty)
      if (text !== undefined) {
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

  /**
   * Drops the cached document for `id` and detaches it from its dependencies
   * (which also removes it from each dependency's `dependants`).
   *
   * Documents are cached forever and an imported document is read from disk
   * only once, so a file that changed outside the repo (a watcher, a dev
   * server, an editor) keeps resolving to its stale parse until it is closed.
   * After closing, the next `openDocument(id)` without text re-reads the file.
   *
   * Dependants are left untouched on purpose: their next `checkDoc` re-runs
   * `checkImport` -> `openDocument(id)`, which re-reads the file and rewires
   * their `dependenciesMap` to the fresh document.
   *
   * @returns `true` when a cached document was dropped, `false` when nothing
   * was cached under `id`.
   */
  closeDocument(id: string): boolean {
    const cached = this.atscripts.get(id)
    if (!cached) {
      return false
    }
    this.atscripts.delete(id)
    cached.then(
      d => d.updateDependencies([]),
      // A document that failed to open has nothing to detach; swallowing the
      // rejection here keeps the dropped entry from becoming an unhandled one.
      () => {}
    )
    return true
  }

  protected async _openDocument(id: string, text?: string): Promise<AtscriptDoc> {
    const { manager } = await this.resolveConfig(id)
    const newId = await manager.resolve(id)
    if (!newId) {
      throw new Error(`Document not resolved: ${id}`)
    }
    const content = text ?? (await manager.load(newId))
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
    const messages: TMessages = []
    const promise = Promise.all(
      Array.from(atscript.imports.values(), async ({ from, imports }) =>
        this.checkImport(atscript, from, imports, _checked, messages)
      )
    )
    const results = await promise
    atscript.updateDependencies(results.filter(Boolean) as AtscriptDoc[])
    // (this check's messages, in import order: those of a previous check are replaced)
    atscript.setImportMessages(
      messages.sort(
        (a, b) =>
          a.range.start.line - b.range.start.line ||
          a.range.start.character - b.range.start.character
      )
    )
  }

  async checkImport(
    atscript: AtscriptDoc,
    from: Token,
    imports: Token[],
    checked?: Set<string>,
    /** where the messages go (the document's import messages; registered when not given) */
    messages?: TMessages
  ): Promise<AtscriptDoc | undefined> {
    const report = (list: TMessages) =>
      messages ? messages.push(...list) : atscript.registerMessages(list)
    let forId = resolveAtscriptFromPath(from.text, atscript.id)

    // Resolve bare specifier placeholders (bare:xxx.as) to actual file:// URIs
    if (isBareId(forId)) {
      const fromDir = fileUriToPath(atscript.id).split('/').slice(0, -1).join('/')
      const resolved = await resolveBareSpecifier(from.text, fromDir)
      if (!resolved) {
        report([
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
      report([
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
          report([
            {
              severity: 1,
              message: `"${from.text}" has no exported member "${token.text}"`,
              range: token.range,
            },
          ])
        }
      }
    } catch (error) {
      report([
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
