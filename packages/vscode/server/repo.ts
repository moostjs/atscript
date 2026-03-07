// eslint-disable max-params
/* eslint-disable max-depth */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable no-promise-executor-return */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { SemanticNode, SemanticPropNode, Token, SemanticAnnotateNode } from '@atscript/core'
import {
  AtscriptDoc,
  AtscriptRepo,
  BuildRepo,
  getRelPath,
  isAnnotate,
  isAnnotationSpec,
  isInterface,
  isPhantomNode,
  isPrimitive,
  isProp,
  isQueryFieldRef,
  isRef,
  isStructure,
  DEFAULT_FORMAT,
  PluginManager,
  resolveAtscriptFromPath,
  resolveConfigFile,
  getQueryScope,
  resolveQueryFieldRef,
  getQueryCompletionScope,
  analyzeQueryCursorContext,
} from '@atscript/core'
import { TextDocument } from 'vscode-languageserver-textdocument'
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

      const [atscript] = await Promise.all([this.openDocument(params.textDocument.uri), this.currentCheck])
      const refs = atscript.getUsageListAt(params.position.line, params.position.character)
      if (!refs) { return undefined }
      const results = refs.map(r => ({ uri: r.uri, range: r.range }))
      if (params.context.includeDeclaration) {
        const defLocations = atscript.getToDefinitionAt(params.position.line, params.position.character)
        if (defLocations) {
          for (const loc of defLocations) {
            results.push({ uri: loc.targetUri, range: loc.targetSelectionRange })
          }
        } else {
          const token = atscript.tokensIndex.at(params.position.line, params.position.character)
          if (token && (token.isDefinition || isProp(token.parentNode))) {
            results.push({ uri: atscript.id, range: token.range })
          }
        }
      }
      return results
    })

    connection.onRenameRequest(async params => {
      if (!params.textDocument.uri.endsWith('.as')) {
        return
      }
      const { textDocument, position, newName } = params

      // Open the document and find the token at the cursor
      const [atscript] = await Promise.all([this.openDocument(textDocument.uri), this.currentCheck])
      const token = atscript.tokensIndex.at(position.line, position.character)
      if (!token) {
        return null // No token found at the cursor
      }
      const references: Array<{ uri: string; range: Token['range']; token: Token }> =
        atscript.usageListFor(token) ?? []

      // Add the definition token to the rename set
      const defLocations = atscript.getToDefinitionAt(position.line, position.character)
      if (defLocations) {
        for (const loc of defLocations) {
          references.push({
            uri: loc.targetUri,
            range: loc.targetSelectionRange,
            token,
          })
        }
      } else if (token.isDefinition || isProp(token.parentNode)) {
        references.push({
          uri: atscript.id,
          range: token.range,
          token,
        })
      }

      if (references.length === 0) {
        return null
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

      // Apply edits to our internal documents immediately so diagnostics update
      // without waiting for didChange notifications (which may not fire for WorkspaceEdit)
      for (const uri of Object.keys(changes)) {
        const textDoc = this.documents.get(uri)
        if (textDoc) {
          const newText = TextDocument.applyEdits(textDoc, changes[uri]!)
          const doc = await this.openDocument(uri)
          doc.update(newText)
          await this.checkDoc(doc, true)
        }
      }

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
      const [atscript] = await Promise.all([this.openDocument(textDocument.uri), this.currentCheck])

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
          return Object.keys(a).filter(k => k !== '$self').flatMap(key => {
            const options = [
              {
                label: key,
                kind: CompletionItemKind.Folder,
              },
            ] as CompletionItem[]
            const child = a[key]
            const selfSpec = !isAnnotationSpec(child) && child?.$self
            if (isAnnotationSpec(child)) {
              const nodeType = child.config.nodeType
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
                value: child.renderDocs(aName) || '',
              } as MarkupContent
              options[0].documentation = documentation
              options[0].kind = CompletionItemKind.Value
              options[0].command = undefined
              options[0].insertText = undefined
            } else if (selfSpec && isAnnotationSpec(selfSpec)) {
              // Branch with $self: show as both a folder and a leaf value
              const nodeType = selfSpec.config.nodeType
              if (nodeType?.length && parent) {
                const effectiveEntity =
                  parent.entity === 'ref' && nodeType.includes('prop') ? 'prop' : parent.entity
                if (!nodeType.includes(effectiveEntity)) {
                  return options
                }
              }
              const aName = `@${[...prev, key].join('.')}`
              options.push({
                label: key,
                kind: CompletionItemKind.Value,
                documentation: {
                  kind: 'markdown',
                  value: selfSpec.renderDocs(aName) || '',
                } as MarkupContent,
              } as CompletionItem)
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
        if (arg?.type === 'query') {
          return this.getQueryCompletions(document, position, atscript, aContext!)
        }
      }

      // property completions inside annotate blocks
      if (block?.blockType === 'annotate' && isAnnotate(block.parentNode)) {
        const annotateNode = block.parentNode as SemanticAnnotateNode
        const targetDef = this.resolveAnnotateTarget(atscript, annotateNode.targetName)
        if (!targetDef) {
          return undefined
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
              return this.propsToCompletionItems(this.getPropsFromDef(chainDef))
            }
            return undefined
          }
        }
        return this.propsToCompletionItems(Array.from(targetDef.props.values()))
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

        // After "interface Name extends" or "interface Name extends A," → suggest type names
        if (/^\s*(?:export\s+)?interface\s+\w+\s+extends\s+(?:[\w.]+\s*,\s*)*\w*$/u.test(lineText)) {
          return this.getDeclarationsCompletions(atscript, text, false)
        }

        // After "interface Name " → suggest extends keyword
        if (/^\s*(?:export\s+)?interface\s+\w+\s+\w*$/u.test(lineText)) {
          return [
            { label: 'extends', kind: CompletionItemKind.Keyword },
          ]
        }

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
          const options = this.getPropsFromDef(def) ?? (isPrimitive(def) ? Array.from(def.props.values()) : undefined)
          return this.propsToCompletionItems(options)
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
      // Query field ref hover (inside backtick expressions)
      if (isQueryFieldRef(token.parentNode)) {
        const fieldRefNode = token.parentNode
        const queryArgToken = fieldRefNode.queryArgToken
        if (queryArgToken) {
          const scope = getQueryScope(queryArgToken, atscript)
          if (scope) {
            if (token === fieldRefNode.typeRef) {
              const unwound = atscript.unwindType(token.text)
              const docs = unwound?.def?.documentation || unwound?.node?.documentation
              if (docs) {
                return {
                  contents: { kind: 'markdown', value: docs },
                  range: token.range,
                } as Hover
              }
            }
            if (token === fieldRefNode.fieldRef) {
              const resolved = resolveQueryFieldRef(fieldRefNode, atscript, scope)
              if (resolved?.prop) {
                const typeName = fieldRefNode.typeRef?.text || scope.unqualifiedTarget || ''
                const doc = resolved.prop.documentation || `Property of \`${typeName}\``
                return {
                  contents: { kind: 'markdown', value: doc },
                  range: token.range,
                } as Hover
              }
            }
          }
        }
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
      const aContext = await this.getAnnotationContextAt(document, position, atscript)
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
    const phantomTokens: Array<{ line: number; char: number; length: number }> = []

    const pushToken = (t: Token) => {
      phantomTokens.push({
        line: t.range.start.line,
        char: t.range.start.character,
        length: t.text.length,
      })
    }

    // 1. Mark phantom type reference tokens
    for (const token of atscript.referred) {
      if (!isRef(token.parentNode) || !isPhantomNode(atscript, token.parentNode)) {
        continue
      }
      pushToken(token)
      for (const c of token.parentNode.chain) {
        pushToken(c)
      }
    }

    // 2. Mark phantom-related tokens in interface props and annotate block entries
    for (const node of atscript.nodes) {
      if (isInterface(node)) {
        for (const [, prop] of node.props) {
          if (!isPhantomNode(atscript, prop.getDefinition())) {
            continue
          }
          const propToken = prop.token('identifier')
          if (propToken) {
            pushToken(propToken)
          }
        }
      } else if (isAnnotate(node)) {
        const targetDef = this.resolveAnnotateTarget(atscript, node.targetName)
        if (!targetDef) {
          continue
        }
        for (const entry of node.entries) {
          const prop = targetDef.props.get(entry.id!)
          if (!prop || !isPhantomNode(atscript, prop.getDefinition())) {
            continue
          }
          const entryToken = entry.token('identifier')
          if (entryToken) {
            pushToken(entryToken)
          }
          if (entry.hasChain) {
            for (const c of entry.chain) {
              pushToken(c)
            }
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

  async getAnnotationContextAt(document: TextDocument, position: Position, existingDoc?: AtscriptDoc) {
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
    const atscript = existingDoc ?? await this.openDocument(document.uri)
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
    // If cursor is inside a query arg (backtick expression), the tokensIndex returns
    // an inner query token instead of the backtick arg token. Find the actual query arg.
    if (currentAnnotation) {
      for (const arg of currentAnnotation.args) {
        if (
          arg.queryNode &&
          arg.range.start.line <= position.line &&
          arg.range.end.line >= position.line &&
          (arg.range.start.line < position.line || arg.range.start.character <= position.character) &&
          (arg.range.end.line > position.line || arg.range.end.character >= position.character)
        ) {
          argToken = arg
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
    const allDocs = await Promise.all(this.atscripts.values())
    for (const doc of allDocs) {
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
    const editRange = {
      start: {
        line: token.range.start.line,
        character: token.range.start.character + 1,
      },
      end: { line: token.range.end.line, character: token.range.end.character - 1 },
    }
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
        replace: editRange,
        range: editRange,
        newText: isDirectory ? `${path}/` : path,
      },
    })) as CompletionItem[]
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, max-params
  getQueryCompletions(
    document: TextDocument,
    position: Position,
    atscript: AtscriptDoc,
    aContext: { annotationToken: Token; argToken?: Token; currentIndex: number; annotationSpec?: { arguments: Array<{ type: string }> } },
  ): CompletionItem[] | undefined {
    try {
      const text = document.getText()
      const offset = document.offsetAt(position)

      // Find the backtick token containing cursor
      const queryArgToken = aContext.argToken
      if (!queryArgToken) { return undefined }

      const scope = getQueryCompletionScope(queryArgToken, atscript)
      if (!scope) { return undefined }

      // Extract text inside backticks up to cursor
      const textBefore = text.slice(0, offset)
      const backtickPos = textBefore.lastIndexOf('`')
      if (backtickPos < 0) { return undefined }
      const textInQuery = textBefore.slice(backtickPos + 1)

      const context = analyzeQueryCursorContext(textInQuery)

      switch (context.type) {
        case 'field-start': {
          const items: CompletionItem[] = []
          for (const typeName of scope.typeNames) {
            items.push({
              label: typeName,
              kind: CompletionItemKind.Class,
              detail: 'Type reference',
              insertText: `${typeName}.`,
              command: { command: 'editor.action.triggerSuggest', title: 'Trigger Suggest' },
            })
          }
          if (scope.unqualifiedTarget) {
            for (const prop of scope.getFields(scope.unqualifiedTarget)) {
              items.push({
                label: prop.id!,
                kind: CompletionItemKind.Property,
                detail: `field of ${scope.unqualifiedTarget}`,
                documentation: prop.documentation
                  ? { kind: 'markdown', value: prop.documentation } as MarkupContent
                  : undefined,
              })
            }
          }
          return items
        }
        case 'after-dot': {
          const typeName = context.typeName
          if (typeName && scope.typeNames.includes(typeName)) {
            return scope.getFields(typeName).map(prop => ({
              label: prop.id!,
              kind: CompletionItemKind.Property,
              detail: `field of ${typeName}`,
              documentation: prop.documentation
                ? { kind: 'markdown', value: prop.documentation } as MarkupContent
                : undefined,
            }))
          }
          return undefined
        }
        case 'after-field': {
          return [
            { label: '=', kind: CompletionItemKind.Operator },
            { label: '!=', kind: CompletionItemKind.Operator },
            { label: '>', kind: CompletionItemKind.Operator },
            { label: '>=', kind: CompletionItemKind.Operator },
            { label: '<', kind: CompletionItemKind.Operator },
            { label: '<=', kind: CompletionItemKind.Operator },
            { label: 'in', kind: CompletionItemKind.Keyword },
            { label: 'not in', kind: CompletionItemKind.Keyword },
            { label: 'matches', kind: CompletionItemKind.Keyword },
            { label: 'exists', kind: CompletionItemKind.Keyword },
            { label: 'not exists', kind: CompletionItemKind.Keyword },
          ]
        }
        case 'after-operator': {
          const items: CompletionItem[] = [
            { label: 'true', kind: CompletionItemKind.Value },
            { label: 'false', kind: CompletionItemKind.Value },
            { label: 'null', kind: CompletionItemKind.Value },
          ]
          for (const typeName of scope.typeNames) {
            items.push({
              label: typeName,
              kind: CompletionItemKind.Class,
              insertText: `${typeName}.`,
              command: { command: 'editor.action.triggerSuggest', title: 'Trigger Suggest' },
            })
          }
          return items
        }
        case 'after-comparison': {
          return [
            { label: 'and', kind: CompletionItemKind.Keyword },
            { label: 'or', kind: CompletionItemKind.Keyword },
          ]
        }
      }
    } catch (error) {
      console.error('getQueryCompletions error:', error)
      return undefined
    }
  }

  triggerChecks() {
    if (this.idle) {
      this.currentCheck = this.runChecks()
    }
    return this.currentCheck
  }

  async runChecks() {
    if (this.idle && (this.changeQueue.length > 0 || this.revalidateQueue.length > 0)) {
      this.idle = false
      await new Promise(resolve => setTimeout(resolve, this.checksDelay))
      while (this.changeQueue.length > 0 || this.revalidateQueue.length > 0) {
        const id = (this.changeQueue.shift() ?? this.revalidateQueue.shift())!
        this.pendingCheck.delete(id)
        const doc = await this.openDocument(id)
        if (this.changedSet.has(id)) {
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

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  resolveAnnotateTarget(atscript: AtscriptDoc, targetName: string): (SemanticNode & { props: Map<string, SemanticPropNode> }) | undefined {
    const unwound = atscript.unwindType(targetName)
    if (!unwound?.def) {
      return undefined
    }
    let targetDef: SemanticNode = atscript.mergeIntersection(unwound.def)
    if (isInterface(targetDef)) {
      targetDef = targetDef.getDefinition() || targetDef
    }
    if (!isStructure(targetDef) && !isInterface(targetDef)) {
      return undefined
    }
    return targetDef
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  propsToCompletionItems(props: SemanticNode[] | undefined): CompletionItem[] | undefined {
    return props?.map(t => ({
      label: t.id!,
      kind: CompletionItemKind.Property,
      documentation: { kind: 'markdown', value: t.documentation } as MarkupContent,
    }))
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  getPropsFromDef(def: SemanticNode): SemanticNode[] | undefined {
    if (isInterface(def) || isStructure(def)) {
      return Array.from(def.props.values())
    }
    if (isProp(def) && def.nestedProps) {
      return Array.from(def.nestedProps.values())
    }
    return undefined
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
