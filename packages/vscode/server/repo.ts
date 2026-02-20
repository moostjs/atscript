// eslint-disable max-params
/* eslint-disable max-depth */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable no-promise-executor-return */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { SemanticNode, Token, SemanticAnnotateNode } from '@atscript/core'
import {
  AtscriptDoc,
  AtscriptRepo,
  BuildRepo,
  getRelPath,
  isAnnotate,
  isAnnotationSpec,
  isInterface,
  isPrimitive,
  isProp,
  isRef,
  isStructure,
  DEFAULT_FORMAT,
  PluginManager,
  resolveAtscriptFromPath,
  resolveConfigFile,
} from '@atscript/core'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import type {
  CompletionItem,
  createConnection,
  Hover,
  MarkupContent,
  Position,
  TextDocuments,
  WorkspaceEdit,
} from 'vscode-languageserver/node'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  DiagnosticTag,
  ParameterInformation,
  SemanticTokensBuilder,
  SignatureInformation,
} from 'vscode-languageserver/node'
import type { Range, SemanticTokens } from 'vscode-languageserver/node'

import { addImport, charBefore, createInsertTextRule, getItnFileCompletions } from './utils'

const CHECKS_DELAY = 100

export class VscodeAtscriptRepo extends AtscriptRepo {
  private readonly changeQueue = [] as string[]

  private readonly revalidateQueue = [] as string[]

  private readonly pendingCheck = new Set<string>()

  private readonly changedSet = new Set<string>()

  private idle = true

  checksDelay = CHECKS_DELAY

  currentCheck?: Promise<void>

  constructor(
    private readonly connection: ReturnType<typeof createConnection>,
    private readonly documents: TextDocuments<TextDocument>
  ) {
    super()
    this.configFormat = 'cjs'
    this.documents.onDidChangeContent(change => {
      this.addToChangeQueue(change.document.uri)
    })

    documents.listen(connection)
    connection.listen()

    connection.onDidChangeWatchedFiles(async params => {
      for (const change of params.changes) {
        if (/atscript\.config\.[mc]?[tj]s$/.test(change.uri)) {
          this.onConfigChanged(change.uri)
        }
      }
    })

    connection.onDidSaveTextDocument(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const atscript = await this.openDocument(params.textDocument.uri)
      const { manager } = await this.resolveConfig(atscript.id)
      const config = await manager.config()
      const bld = new BuildRepo(config.rootDir!, this, [atscript])
      await bld.write({ format: DEFAULT_FORMAT, outDir: config.outDir })
    })

    connection.onNotification('workspace/files', async (fileUris: string[]) => {
      fileUris
        .filter(uri => uri.search('node_modules') < 0)
        .forEach(uri => {
          this.addToRevalidateQueue(uri)
        })
      this.checksDelay = 1
      this.triggerChecks()
      await this.currentCheck
      this.checksDelay = CHECKS_DELAY
    })

    connection.onDefinition(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const atscript = await this.openDocument(params.textDocument.uri)
      return atscript.getToDefinitionAt(params.position.line, params.position.character)
    })

    connection.onReferences(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const atscript = await this.openDocument(params.textDocument.uri)
      return atscript.getUsageListAt(params.position.line, params.position.character)?.map(r => ({
        uri: r.uri,
        range: r.range,
      }))
    })

    connection.onRenameRequest(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const { textDocument, position, newName } = params

      // Open the document and find the token at the cursor
      const atscript = await this.openDocument(textDocument.uri)
      if (this.currentCheck) {
        await this.currentCheck
      }
      const token = atscript.tokensIndex.at(position.line, position.character)
      if (!token) {
        return null // No token found at the cursor
      }
      const references = atscript.usageListFor(token)

      if (!references || references.length === 0) {
        return null // No references found
      }

      const def = token.isDefinition
        ? { uri: atscript.id, token }
        : atscript.getDefinitionFor(token)

      if (def?.token) {
        references.push({
          uri: def.uri,
          range: def.token.range,
          token,
        })
      }

      // Build a response with edits for each reference
      const changes: WorkspaceEdit['changes'] = {}

      references.forEach(ref => {
        if (!changes[ref.uri]) {
          changes[ref.uri] = []
        }

        changes[ref.uri]!.push({
          range: ref.range,
          newText: newName,
        })
      })

      return { changes }
    })

    connection.onCompletionResolve(item => item)

    connection.onCompletion(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const { textDocument, position, context } = params
      const document = documents.get(textDocument.uri)
      if (!document) {
        return
      }
      const text = document.getText()
      const offset = document.offsetAt(position)
      const atscript = await this.openDocument(textDocument.uri)
      await this.currentCheck

      const block = atscript.blocksIndex.at(position.line, position.character)

      // import { here } from '...'
      if (block?.blockType === 'import' && block.fromPath) {
        return this.getImportBlockCompletions(atscript, block, text, offset, context?.triggerKind)
      }

      const token = atscript.tokensIndex.at(position.line, position.character)
      // import { ... } from 'here'
      if (typeof token?.fromPath === 'string') {
        return this.getImportPathCompletions(atscript, token, position)
      }

      // autocomplete for annotations
      if (atscript.config.annotations) {
        // eslint-disable-next-line unicorn/no-lonely-if
        if (token?.isAnnotation && atscript.config.annotations) {
          const prev = token.text.slice(1).split('.').slice(0, -1)
          let a = atscript.config.annotations
          for (const item of prev) {
            if (a[item] && !isAnnotationSpec(a[item])) {
              a = a[item]
            } else {
              return
            }
          }
          const parent = token.parentNode
          return Object.keys(a).flatMap(key => {
            const options = [
              {
                label: key,
                kind: CompletionItemKind.Folder,
                insertText: `${key}.`,
                command: {
                  command: 'editor.action.triggerSuggest',
                  title: 'Trigger Suggest',
                },
              },
            ] as CompletionItem[]
            if (isAnnotationSpec(a[key])) {
              const nodeType = a[key].config.nodeType
              if (nodeType?.length && parent) {
                // filter out annotations not suitable for the parent node
                // Annotate block entries are ref nodes referencing props,
                // so treat 'ref' as equivalent to 'prop'
                const effectiveEntity =
                  parent.entity === 'ref' && nodeType.includes('prop') ? 'prop' : parent.entity
                if (!nodeType.includes(effectiveEntity)) {
                  return []
                }
              }
              const aName = `@${[...prev, key].join('.')}`
              const documentation = {
                kind: 'markdown',
                value: a[key].renderDocs(aName) || '',
              } as MarkupContent
              options[0].documentation = documentation
              options[0].kind = CompletionItemKind.Value
              options[0].command = undefined
              options[0].insertText = undefined
              // if (a[key].arguments.length) {
              //   options[0] = {
              //     label: key,
              //     labelDetails: {
              //       detail: ` (snippet)`,
              //     },
              //     kind: CompletionItemKind.Snippet,
              //     insertText: `${key} ${a[key].argumentsSnippet}`,
              //     insertTextFormat: 2,
              //     documentation: {
              //       kind: 'markdown',
              //       value: `## Snippet\n\n${documentation.value}`,
              //     },
              //     command: {
              //       command: 'editor.action.triggerParameterHints',
              //       title: 'Trigger Signature Help',
              //     },
              //   }
              // }
            }
            return options
          })
        }
        const aContext = await this.getAnnotationContextAt(document, position)
        const arg = aContext?.annotationSpec?.arguments[aContext.currentIndex]
        if (arg?.values?.length) {
          return arg.values?.map(v => ({
            label: arg.type === 'string' ? `'${v}'` : v,
            kind: CompletionItemKind.Value,
          }))
        }
        if (arg?.type === 'boolean') {
          return [
            {
              label: 'true',
              kind: CompletionItemKind.Value,
            },
            {
              label: 'false',
              kind: CompletionItemKind.Value,
            },
          ]
        }
      }

      // property completions inside annotate blocks
      if (block?.blockType === 'annotate' && isAnnotate(block.parentNode)) {
        const annotateNode = block.parentNode as SemanticAnnotateNode
        const unwound = atscript.unwindType(annotateNode.targetName)
        if (unwound?.def) {
          let targetDef: SemanticNode = atscript.mergeIntersection(unwound.def)
          if (isInterface(targetDef)) {
            targetDef = targetDef.getDefinition() || targetDef
          }
          // chain completion (e.g., address.city)
          if (token?.parentNode && isRef(token.parentNode)) {
            const id = token.parentNode.token('identifier')
            if (id && (token.parentNode.hasChain || token.text === '.')) {
              const chain =
                token.text === '.'
                  ? [id.text, ...token.parentNode.chain.map(c => c.text)]
                  : [id.text, ...token.parentNode.chain.slice(0, -1).map(c => c.text)]
              const chainUnwound = atscript.unwindType(annotateNode.targetName, chain)
              if (chainUnwound?.def) {
                const chainDef = atscript.mergeIntersection(chainUnwound.def)
                let options: SemanticNode[] | undefined
                if (isInterface(chainDef) || isStructure(chainDef)) {
                  options = Array.from(chainDef.props.values())
                } else if (isProp(chainDef) && chainDef.nestedProps) {
                  options = Array.from(chainDef.nestedProps.values())
                }
                return options?.map(t => ({
                  label: t.id,
                  kind: CompletionItemKind.Property,
                  documentation: { kind: 'markdown', value: t.documentation },
                })) as CompletionItem[]
              }
              return undefined
            }
          }
          // first-level: suggest top-level properties of target
          if (isStructure(targetDef) || isInterface(targetDef)) {
            return Array.from(targetDef.props.values()).map(t => ({
              label: t.id,
              kind: CompletionItemKind.Property,
              documentation: { kind: 'markdown', value: t.documentation },
            })) as CompletionItem[]
          }
        }
        return undefined
      }

      // declared (imported) types or exported from other documents
      const before = charBefore(text, offset, [/[\s\w]/u])
      if (block?.blockType === 'structure' && before && [':', '|', '&'].includes(before)) {
        return this.getDeclarationsCompletions(atscript, text)
      }
      if (block?.blockType === undefined && before && ['=', '|', '&'].includes(before)) {
        return this.getDeclarationsCompletions(atscript, text)
      }

      // top-level keyword completions (not in any block)
      if (block?.blockType === undefined) {
        const lineStartOffset = document.offsetAt({ line: position.line, character: 0 })
        const lineText = text.slice(lineStartOffset, offset)

        // After "annotate" keyword → suggest annotatable targets
        if (/^\s*(?:export\s+)?annotate\s+\w*$/u.test(lineText)) {
          return this.getDeclarationsCompletions(atscript, text, false)
        }

        // After "export" keyword → suggest annotate, interface, type
        if (/^\s*export\s+\w*$/u.test(lineText)) {
          return [
            { label: 'annotate', kind: CompletionItemKind.Keyword },
            { label: 'interface', kind: CompletionItemKind.Keyword },
            { label: 'type', kind: CompletionItemKind.Keyword },
          ]
        }

        // At line start → suggest top-level keywords
        if (/^\s*\w*$/u.test(lineText)) {
          return [
            { label: 'import', kind: CompletionItemKind.Keyword },
            { label: 'export', kind: CompletionItemKind.Keyword },
            { label: 'annotate', kind: CompletionItemKind.Keyword },
            { label: 'interface', kind: CompletionItemKind.Keyword },
            { label: 'type', kind: CompletionItemKind.Keyword },
          ]
        }
      }

      // autocomplete for defined nodes
      if (token?.parentNode && isRef(token.parentNode)) {
        const id = token.parentNode.token('identifier')
        if (!id) {
          return undefined
        }
        const chain =
          token.text === '.' ? token.parentNode.chain : token.parentNode.chain.slice(0, -1)
        const unwound = atscript.unwindType(id.text, chain)
        if (unwound?.def) {
          const def = atscript.mergeIntersection(unwound.def)
          let options: SemanticNode[] | undefined
          if (isInterface(def) || isStructure(def)) {
            options = Array.from(def.props.values())
          } else if (isProp(def) && def.nestedProps) {
            options = Array.from(def.nestedProps.values())
          } else if (isPrimitive(def)) {
            options = Array.from(def.props.values())
          }
          return options?.map(t => ({
            label: t.id,
            kind: CompletionItemKind.Property,
            documentation: {
              kind: 'markdown',
              value: t.documentation,
            },
          })) as CompletionItem[]
        }
      }
    })

    connection.onSignatureHelp(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const { textDocument, position } = params
      const document = documents.get(textDocument.uri)
      if (!document) {
        return
      }
      const aContext = await this.getAnnotationContextAt(document, position)
      if (!aContext) {
        return
      }

      const { currentIndex, annotationSpec, annotationToken } = aContext
      if (!annotationSpec) {
        return
      }

      const args = annotationSpec.arguments

      // eslint-disable-next-line sonarjs/no-nested-template-literals
      const label = `${annotationToken.text} ${args
        .map(a => `${a.name}${a.optional ? '?' : ''}: ${a.type}`)
        .join(', ')}`
      const descr = { kind: 'markdown', value: annotationSpec.config.description }
      // Define signature information
      const signature = SignatureInformation.create(`${label}`, descr as unknown as string)

      // Define parameter-specific information
      signature.parameters = args.map(a =>
        ParameterInformation.create(`${a.name}${a.optional ? '?' : ''}: ${a.type}`, {
          kind: 'markdown',
          value: a.description,
        } as unknown as string)
      )

      return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: currentIndex,
      }
    })

    connection.onHover(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const { textDocument, position } = params
      const document = documents.get(textDocument.uri)
      if (!document) {
        return
      }
      const atscript = await this.openDocument(document.uri)
      const token = atscript.tokensIndex.at(position.line, position.character)
      if (!token) {
        return
      }
      if (isRef(token.parentNode)) {
        const unwound = atscript.unwindType(token.parentNode.id!, token.parentNode.chain)
        const def = unwound?.def
        const node = unwound?.node
        const docs = [] as string[]
        if (isPrimitive(def) && def.config.type === 'phantom') {
          docs.push('*(phantom — excluded from types, validation, and schema)*')
        }
        if (isPrimitive(def) && def.config.isContainer) {
          docs.push('*(container — must use an extension)*')
        }
        if (node && node.documentation) {
          docs.push(node.documentation)
        }
        if (def?.documentation) {
          docs.push(def.documentation)
        }
        if (docs.length > 0) {
          return {
            contents: {
              kind: 'markdown',
              value: docs.join('\n\n'),
            },
            range: token.range,
          } as Hover
        }
      }
      const aContext = await this.getAnnotationContextAt(document, position)
      if (!aContext) {
        return
      }
      const { annotationSpec, annotationToken } = aContext
      if (!annotationSpec) {
        return
      }
      if (token === annotationToken) {
        return {
          contents: {
            kind: 'markdown',
            value: annotationSpec.renderDocs(token.text),
          },
          range: token.range,
        } as Hover
      }
      if (typeof token.index === 'number' && annotationSpec.arguments.length > token.index) {
        return {
          contents: {
            kind: 'markdown',
            value: annotationSpec.renderDocs(token.index),
          },
          range: token.range,
        } as Hover
      }
    })

    connection.languages.semanticTokens.onRange(async params =>
      this.provideSemanticTokens(params.textDocument.uri, params.range)
    )
  }

  async loadPluginManagerFor(id: string): ReturnType<AtscriptRepo['loadPluginManagerFor']> {
    try {
      return await super.loadPluginManagerFor(id)
    } catch (error) {
      console.error('Failed to load config for', id, error)
      // Remove failed config from cache so it retries after the user fixes it
      const configFile = await resolveConfigFile(id, this.root)
      if (configFile) {
        this.configFiles.delete(configFile)
      }
      const manager = new PluginManager({ rootDir: this.root })
      await manager.getDocConfig()
      return { file: configFile, manager, dependants: new Set<string>() }
    }
  }

  async onConfigChanged(_configFile: string) {
    const configFile = _configFile.startsWith('file://') ? _configFile.slice(7) : _configFile
    console.log(`Reloading config: ${configFile}`)
    this.configFiles.delete(configFile)
    for (const [id, cache] of Array.from(this.configs.entries())) {
      const { file } = await cache
      if (file === configFile) {
        this.configs.delete(id)
        this.atscripts.delete(id)
        this.addToRevalidateQueue(id)
      }
    }
  }

  async provideSemanticTokens(uri: string, range?: Range) {
    const document = this.documents.get(uri)
    if (!document) {
      return { data: [] } as SemanticTokens
    }

    const atscript = await this.openDocument(document.uri)
    if (!atscript) {
      return { data: [] } as SemanticTokens
    }

    const builder = new SemanticTokensBuilder()
    // Collect all phantom-related tokens: type references + prop names
    const phantomTokens: Array<{ line: number; char: number; length: number }> = []
    // 1. Mark phantom type reference tokens
    for (const token of atscript.referred) {
      if (!isRef(token.parentNode)) {
        continue
      }
      const ref = token.parentNode
      const unwound = atscript.unwindType(ref.id!, ref.chain)
      if (!unwound?.def) {
        continue
      }
      if (!isPrimitive(unwound.def) || unwound.def.config.type !== 'phantom') {
        continue
      }
      phantomTokens.push({
        line: token.range.start.line,
        char: token.range.start.character,
        length: token.text.length,
      })
      for (const c of ref.chain) {
        phantomTokens.push({
          line: c.range.start.line,
          char: c.range.start.character,
          length: c.text.length,
        })
      }
    }
    // 2. Mark prop name tokens whose type resolves to phantom
    for (const node of atscript.nodes) {
      if (!isInterface(node)) {
        continue
      }
      for (const [, prop] of node.props) {
        const def = prop.getDefinition()
        if (!isRef(def)) {
          continue
        }
        const unwound = atscript.unwindType(def.id!, def.chain)
        if (!unwound?.def) {
          continue
        }
        if (!isPrimitive(unwound.def) || unwound.def.config.type !== 'phantom') {
          continue
        }
        const propToken = prop.token('identifier')
        if (propToken) {
          phantomTokens.push({
            line: propToken.range.start.line,
            char: propToken.range.start.character,
            length: propToken.text.length,
          })
        }
      }
    }
    // 3. Mark annotate block entry tokens that refer to phantom-typed props
    for (const node of atscript.nodes) {
      if (!isAnnotate(node)) {
        continue
      }
      const unwound = atscript.unwindType(node.targetName)
      if (!unwound?.def) {
        continue
      }
      let targetDef: SemanticNode = atscript.mergeIntersection(unwound.def)
      if (isInterface(targetDef)) {
        targetDef = targetDef.getDefinition() || targetDef
      }
      if (!isStructure(targetDef) && !isInterface(targetDef)) {
        continue
      }
      for (const entry of node.entries) {
        const propName = entry.id!
        const prop = targetDef.props.get(propName)
        if (!prop) {
          continue
        }
        const propDef = prop.getDefinition()
        if (!isRef(propDef)) {
          continue
        }
        const propUnwound = atscript.unwindType(propDef.id!, propDef.chain)
        if (!propUnwound?.def) {
          continue
        }
        if (!isPrimitive(propUnwound.def) || propUnwound.def.config.type !== 'phantom') {
          continue
        }
        const entryToken = entry.token('identifier')
        if (entryToken) {
          phantomTokens.push({
            line: entryToken.range.start.line,
            char: entryToken.range.start.character,
            length: entryToken.text.length,
          })
        }
        if (entry.hasChain) {
          for (const c of entry.chain) {
            phantomTokens.push({
              line: c.range.start.line,
              char: c.range.start.character,
              length: c.text.length,
            })
          }
        }
      }
    }
    // Sort by position (required by semantic tokens protocol)
    phantomTokens.sort((a, b) => a.line - b.line || a.char - b.char)
    for (const t of phantomTokens) {
      if (range && (t.line < range.start.line || t.line > range.end.line)) {
        continue
      }
      builder.push(t.line, t.char, t.length, 0, 1) // tokenType=0 (type), modifier=1 (documentation)
    }

    return builder.build()
  }

  async getAnnotationContextAt(document: TextDocument, position: Position) {
    const text = document.getText()
    const offset = document.offsetAt(position)

    // Get the text from the start of the line up to the cursor
    const lineStartOffset = text.lastIndexOf('\n', offset - 1) + 1
    const lineText = text.slice(lineStartOffset, offset)

    // Check if the line starts with an annotation (e.g., @label)
    const annotationMatch = /^\s*@([.0-9A-Za-z]*)/u.exec(lineText)
    if (!annotationMatch) {
      return
    }
    // await this.currentCheck
    const atscript = await this.openDocument(document.uri)
    const annotationToken = atscript.tokensIndex.at(position.line, lineText.indexOf('@') + 1)
    if (!annotationToken?.parentNode) {
      return
    }
    let argToken = atscript.tokensIndex.at(position.line, position.character)
    const currentAnnotation = annotationToken.parentNode.annotations?.find(
      a => a.name === annotationMatch[1] && a.token.range.start.line === position.line
    )
    if (!argToken && currentAnnotation) {
      for (let i = currentAnnotation.args.length - 1; i >= 0; i--) {
        const argI = currentAnnotation.args[i]
        if (argI.range.end.character < position.character) {
          argToken = currentAnnotation.args[i + 1]
          break
        }
      }
    }
    const annotationSpec = atscript.resolveAnnotation(annotationToken.text.slice(1))
    return {
      atscript,
      annotationToken,
      argToken,
      currentIndex: argToken?.index ?? (currentAnnotation?.args.length || 0),
      annotationSpec,
    }
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, max-params
  async getDeclarationsCompletions(
    atscript: AtscriptDoc,
    text: string,
    includePrimitives = true
  ): Promise<CompletionItem[] | undefined> {
    const defs = Array.from(atscript.registry.definitions.entries())
    const items = [] as CompletionItem[]
    const exporters = new Map<string, AtscriptDoc>()
    const importSet = new Set<string>()
    for (const [key, token] of defs) {
      let t = token
      if (token.fromPath) {
        let exporter = exporters.get(token.fromPath)
        if (!exporter) {
          exporter = await this.openDocument(resolveAtscriptFromPath(token.fromPath, atscript.id))
          exporters.set(token.fromPath, exporter)
        }
        t = exporter.registry.definitions.get(token.text)!
        importSet.add(token.text)
      }
      items.push({
        label: key,
        kind:
          t.parentNode?.entity === 'interface'
            ? CompletionItemKind.Interface
            : CompletionItemKind.TypeParameter,
        detail: token.fromPath ? `imported from '${token.fromPath}'` : undefined,
      })
    }
    for (const docPromise of this.atscripts.values()) {
      const doc = await docPromise
      if (doc !== atscript) {
        for (const node of doc.exports.values()) {
          const token = node.token('identifier')
          if (token && !importSet.has(token.text)) {
            const fromPath = getRelPath(atscript.id, doc.id)
            const importEdit = addImport(text, token.text, fromPath)
            items.push({
              label: token.text,
              kind:
                node.entity === 'interface'
                  ? CompletionItemKind.Interface
                  : CompletionItemKind.TypeParameter,
              detail: `add import from '${fromPath}'`,
              labelDetails: {
                description: `${fromPath}`,
              },
              additionalTextEdits: [importEdit],
            })
          }
        }
      }
    }
    if (includePrimitives) {
      const primitives = atscript.primitives
      items.push(
        ...primitives.map(
          p =>
            ({
              label: p.id,
              kind: CompletionItemKind.Keyword,
              detail: `primitive "${p.id}"`,
              documentation: {
                kind: 'markdown',
                // todo: better format for primitive documentation
                value:
                  p.config.documentation ||
                  `Contains:\n\n${Object.keys(p.config.extensions || {})
                    .map(k => `- **${k}** ${p.config.extensions![k].documentation || ''}`)
                    .join('\n')}`,
              },
            }) as CompletionItem
        )
      )
    }
    return items
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, max-params
  async getImportBlockCompletions(
    atscript: AtscriptDoc,
    block: Token,
    text: string,
    offset: number,
    triggerKind?: 1 | 2 | 3
  ): Promise<CompletionItem[] | undefined> {
    const rule = createInsertTextRule(text, offset, triggerKind ?? 1)
    const target = await this.openDocument(resolveAtscriptFromPath(block.fromPath!, atscript.id))
    if (target) {
      const imports = atscript.imports.get(target.id)?.imports || []
      const importsSet = new Set(imports.map(i => i.text))
      return Array.from(target.exports.values())
        .filter(n => !importsSet.has(n.id!) && rule.test(n.id!))
        .map(node => ({
          label: node.id,
          kind:
            node.entity === 'interface'
              ? CompletionItemKind.Interface
              : CompletionItemKind.TypeParameter,
          labelDetails: { description: `${node.id} [${node.entity}]` },
          insertText: rule.apply(node.id!),
        })) as CompletionItem[]
    }
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  async getImportPathCompletions(
    atscript: AtscriptDoc,
    token: Token,
    position: Position
  ): Promise<CompletionItem[] | undefined> {
    const dif = position.character - token.range.start.character - 1
    const paths = await getItnFileCompletions(atscript.id, token.fromPath!.slice(0, dif))
    return paths.map(({ path, isDirectory }) => ({
      label: path,
      kind: isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
      command: isDirectory
        ? {
            command: 'editor.action.triggerSuggest',
            title: 'Trigger Suggest',
          }
        : undefined,
      textEdit: {
        replace: {
          start: {
            line: token.range.start.line,
            character: token.range.start.character + 1,
          },
          end: { line: token.range.end.line, character: token.range.end.character - 1 },
        },
        range: {
          start: {
            line: token.range.start.line,
            character: token.range.start.character + 1,
          },
          end: { line: token.range.end.line, character: token.range.end.character - 1 },
        },
        newText: isDirectory ? `${path}/` : path,
      },
    })) as CompletionItem[]
  }

  async triggerChecks() {
    if (this.idle) {
      this.currentCheck = this.runChecks()
    }
    return this.currentCheck
  }

  async runChecks() {
    if (this.idle && (this.changeQueue.length > 0 || this.revalidateQueue.length > 0)) {
      this.idle = false
      await new Promise(resolve => setTimeout(resolve, this.checksDelay))
      const ids = [] as string[]
      while (this.changeQueue.length > 0 || this.revalidateQueue.length > 0) {
        const isFromChangeQueue = this.changeQueue.length > 0
        const id = isFromChangeQueue ? this.changeQueue.shift()! : this.revalidateQueue.shift()!
        ids.push(id)
        this.pendingCheck.delete(id)
        const doc = await this.openDocument(id)
        if (this.changedSet.has(id) && this.atscripts.has(id)) {
          const text = this.documents.get(id)?.getText()
          if (typeof text === 'string') {
            doc.update(text)
          }
        }
        const changed = this.changedSet.has(id)
        this.changedSet.delete(id)
        await this.checkDoc(doc, changed)
        if (this.changeQueue.length > 0 || this.revalidateQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.checksDelay))
        }
      }
      this.idle = true
    }
  }

  addToChangeQueue(id: string) {
    this.changedSet.add(id)
    if (this.pendingCheck.has(id)) {
      return
    }
    this.pendingCheck.add(id)
    this.changeQueue.push(id)
    this.triggerChecks()
  }

  addToRevalidateQueue(id: string) {
    if (this.pendingCheck.has(id)) {
      return
    }
    this.pendingCheck.add(id)
    this.revalidateQueue.push(id)
    this.triggerChecks()
  }

  protected async _openDocument(id: string, text?: string): Promise<AtscriptDoc> {
    const td = this.documents.get(id)
    if (td) {
      const { manager } = await this.resolveConfig(id)
      const config = await manager.getDocConfig()
      const atscript = new AtscriptDoc(id, config, manager)
      atscript.update(td.getText())
      await manager.onDocument(atscript)
      return atscript
    }
    return super._openDocument(id, text)
  }

  revalidateDependants(atscript: AtscriptDoc) {
    atscript.dependants.forEach(d => {
      d.clearMessages()
      this.addToRevalidateQueue(d.id)
    })
  }

  async checkDoc(atscript: AtscriptDoc, changed = false) {
    await this.checkImports(atscript)
    const unused = atscript.getUnusedTokens()
    const messages = atscript.getDiagMessages()
    this.connection.sendDiagnostics({
      uri: atscript.id,
      diagnostics: messages.concat(
        ...unused.map(t => ({
          severity: DiagnosticSeverity.Hint,
          range: t.range,
          message: `Unused token: ${t.text}`,
          tags: [DiagnosticTag.Unnecessary],
        }))
      ),
    })
    if (changed) {
      this.revalidateDependants(atscript)
    }
  }
}
