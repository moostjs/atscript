// eslint-disable max-params
/* eslint-disable max-depth */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable no-promise-executor-return */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { SemanticNode, Token, SemanticAnnotateNode, TBacktickArgKind } from '@atscript/core'
import {
  AtscriptDoc,
  AtscriptRepo,
  blockDependencies,
  BuildRepo,
  fileUriToPath,
  getRelPath,
  isAnnotate,
  isAnnotationSpec,
  isInterface,
  isPhantomNode,
  isPhantomPath,
  isPrimitive,
  isProp,
  isQueryFieldRef,
  isRef,
  isStructure,
  DEFAULT_FORMAT,
  entryParts,
  PluginManager,
  resolveAtscriptFromPath,
  resolveConfigFile,
  getQueryScope,
  getDeclaredValue,
  fieldRefTokens,
  getQueryCompletionScope,
  getFieldPathCompletionScope,
  analyzeQueryCursorContext,
  isBacktickArgType,
  BACKTICK_ARG_VOCABULARY,
  distinctFields,
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
  FileChangeType,
  InsertTextFormat,
  ParameterInformation,
  SemanticTokensBuilder,
  SignatureInformation,
} from 'vscode-languageserver/node'
import type { Range, SemanticTokens } from 'vscode-languageserver/node'

import {
  addImport,
  charBefore,
  createInsertTextRule,
  getItnFileCompletions,
  lineTextBefore,
} from './utils'

const CHECKS_DELAY = 100

const IGNORED_DIR_RE =
  /\/(?:node_modules|dist|build|out|cdk\.out|\.cdk\.staging|coverage|\.next|\.nuxt|\.turbo|\.cache)\//u

export class VscodeAtscriptRepo extends AtscriptRepo {
  private readonly changeQueue = [] as string[]

  private readonly revalidateQueue = [] as string[]

  private readonly pendingCheck = new Set<string>()

  private readonly changedSet = new Set<string>()

  /** The documents the editor closed, checked against the file on disk (see `revertClosed`). */
  private readonly closedSet = new Set<string>()

  /**
   * What the diagnostics of each checked document's mutating `annotate` blocks read besides its
   * imports (see `blockDependencies`), by document id, as of its last check: a change of one of
   * them checks it again (see `revalidateReaders`).
   */
  private readonly blockReads = new Map<string, { doc: AtscriptDoc; ids: Set<string> }>()

  private idle = true

  checksDelay = CHECKS_DELAY

  currentCheck?: Promise<void>

  constructor(
    private readonly connection: ReturnType<typeof createConnection>,
    private readonly documents: TextDocuments<TextDocument>
  ) {
    super()
    this.documents.onDidChangeContent(change => {
      this.addToChangeQueue(change.document.uri)
    })

    // Closed in the editor (its unsaved edits discarded): the file on disk counts again.
    this.documents.onDidClose(({ document }) => {
      if (document.uri.endsWith('.as')) {
        this.closedSet.add(document.uri)
        this.addToRevalidateQueue(document.uri)
      }
    })

    documents.listen(connection)
    connection.listen()

    connection.onDidChangeWatchedFiles(async params => {
      for (const change of params.changes) {
        if (/atscript\.config\.[mc]?[tj]s$/.test(change.uri)) {
          this.onConfigChanged(change.uri)
        } else if (change.uri.endsWith('.as')) {
          await this.onAsFileChanged(change.uri, change.type === FileChangeType.Deleted)
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
        .filter(uri => !IGNORED_DIR_RE.test(uri))
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

      const [atscript] = await Promise.all([
        this.openDocument(params.textDocument.uri),
        this.currentCheck,
      ])
      const token = atscript.tokensIndex.at(params.position.line, params.position.character)
      const refs = token && this.referencesOf(atscript, token, params.position)
      if (!refs?.usages) {
        return undefined
      }
      const results = refs.usages.map(r => ({ uri: r.uri, range: r.range }))
      if (params.context.includeDeclaration) {
        results.push(...refs.definitions)
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
      // Usages plus the definition itself
      const refs = this.referencesOf(atscript, token, position)
      const references: Array<{ uri: string; range: Token['range'] }> = [
        ...(refs.usages ?? []),
        ...refs.definitions,
      ]

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
      // nothing to complete inside a comment (e.g. one trailing an annotation)
      if (atscript.isInComment(offset)) {
        return
      }

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
          // (`@annotate.*`: directives of `annotate` blocks, offered only there — an entry, or the
          // top of a block)
          const inAnnotate =
            (!!parent && isAnnotate(parent)) ||
            atscript.annotateBlockAt(position.line, position.character) !== undefined
          if (prev[0] === 'annotate' && !inAnnotate) {
            return []
          }
          return Object.keys(a)
            .filter(k => k !== '$self' && (inAnnotate || prev.length > 0 || k !== 'annotate'))
            .flatMap(key => {
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
        // values declared elsewhere in the document (`valueScope`): the literals of a union, say
        if (arg?.valueScope && (arg.type === 'string' || arg.type === 'number')) {
          const candidates = arg.valueScope(aContext!.annotationToken, atscript)
          if (candidates) {
            // Replace the argument written so far (quotes included — an editor auto-closes
            // `'` to `''`), so accepting a candidate never doubles the quotes.
            const typed = aContext!.argToken
            const range =
              typed && typed.type === (arg.type === 'string' ? 'text' : 'number')
                ? typed.range
                : undefined
            // Keep the quote character the user typed (`"op` stays double-quoted); `filterText`
            // matches the typed prefix including its quote, which the editor filters on.
            const quote = range && text[document.offsetAt(range.start)] === '"' ? '"' : "'"
            return candidates.map(c => {
              const newText = arg.type === 'string' ? `${quote}${c.value}${quote}` : c.value
              return {
                label: newText,
                kind: CompletionItemKind.Value,
                ...(range && { textEdit: { range, newText }, filterText: newText }),
                ...(c.documentation && {
                  documentation: { kind: 'markdown', value: c.documentation } as MarkupContent,
                }),
              }
            })
          }
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
        if (arg && isBacktickArgType(arg.type)) {
          return this.getQueryCompletions(document, position, atscript, aContext!, arg.type)
        }
        if (arg?.type === 'string' && arg.fieldScope) {
          return this.getFieldPathCompletions(atscript, position, aContext!)
        }
        // type names for a `ref` argument (not after a dot: `User.` names a field)
        if (arg?.type === 'ref' && charBefore(text, offset, [/\w/u]) !== '.') {
          return this.getDeclarationsCompletions(atscript, text, false, arg.refFilter)
        }
      }

      // property completions inside annotate blocks
      if (block?.blockType === 'annotate' && isAnnotate(block.parentNode)) {
        const annotateNode = block.parentNode as SemanticAnnotateNode
        // (the props of every object the path reaches: through a union, each branch's)
        let chain: string[] = []
        // chain completion (e.g., address.city)
        if (token?.parentNode && isRef(token.parentNode)) {
          const id = token.parentNode.token('identifier')
          if (id && (token.parentNode.hasChain || token.text === '.')) {
            chain =
              token.text === '.'
                ? [id.text, ...token.parentNode.chain.map(c => c.text)]
                : [id.text, ...token.parentNode.chain.slice(0, -1).map(c => c.text)]
          }
        }
        const members = atscript.pathMembers(annotateNode.targetName, chain)
        return members.length > 0 ? this.propsToCompletionItems(members) : undefined
      }

      // declared (imported) types or exported from other documents
      const before = charBefore(text, offset, [/[\s\w]/u])
      if (block?.blockType === 'structure' && before && [':', '|', '&'].includes(before)) {
        return this.getDeclarationsCompletions(atscript, text)
      }

      // Atscript forbids overriding inherited fields in `extends`, so the
      // child's own props are filtered out of the suggestion list.
      if (block?.blockType === 'structure' && before !== '.') {
        const owner = block.parentNode?.ownerNode
        if (owner && isInterface(owner) && owner.hasExtends) {
          const lineText = lineTextBefore(text, offset)
          if (/^\s*\w*$/u.test(lineText)) {
            const merged = atscript.resolveInterfaceExtends(owner)
            const allProps =
              merged && (isInterface(merged) || isStructure(merged))
                ? Array.from(merged.props.values())
                : []
            const inherited = allProps.filter(p => p.id && !owner.props.has(p.id))
            if (inherited.length > 0) {
              return this.propsToCompletionItems(inherited)
            }
          }
        }
      }
      if (block?.blockType === undefined && before && ['=', '|', '&'].includes(before)) {
        return this.getDeclarationsCompletions(atscript, text)
      }

      // top-level keyword completions (not in any block)
      if (block?.blockType === undefined) {
        const lineText = lineTextBefore(text, offset)

        // After "interface Name extends" or "interface Name extends A," → suggest type names
        if (
          /^\s*(?:export\s+)?interface\s+\w+\s+extends\s+(?:[\w.]+\s*,\s*)*\w*$/u.test(lineText)
        ) {
          return this.getDeclarationsCompletions(atscript, text, false)
        }

        // After "interface Name " → suggest extends keyword
        if (/^\s*(?:export\s+)?interface\s+\w+\s+\w*$/u.test(lineText)) {
          return [{ label: 'extends', kind: CompletionItemKind.Keyword }]
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
        // (the props of every object the path reaches: through a union, each branch's)
        const members = atscript.pathMembers(id.text, chain)
        if (members.length > 0) {
          return this.propsToCompletionItems(members)
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
      // Field ref hover (query field refs, field-path string args; through a union: each field)
      const fieldRefs = fieldRefTokens(token, atscript, position.character)
      if (fieldRefs.length > 0) {
        return {
          contents: {
            kind: 'markdown',
            value: fieldRefs
              .map(f => f.prop.documentation || `Property of \`${f.typeName}\``)
              .join('\n\n'),
          },
          range: fieldRefs[0].range,
        } as Hover
      }
      // Query type ref hover (`Customer` in `Customer.name`)
      if (
        isQueryFieldRef(token.parentNode) &&
        token === token.parentNode.typeRef &&
        token.parentNode.queryArgToken &&
        getQueryScope(token.parentNode.queryArgToken, atscript)
      ) {
        const unwound = atscript.unwindType(token.text)
        const docs = unwound?.def?.documentation || unwound?.node?.documentation
        if (docs) {
          return {
            contents: { kind: 'markdown', value: docs },
            range: token.range,
          } as Hover
        }
      }
      // Value argument naming a declared value (`valueScope`): hover shows that value
      const declared = getDeclaredValue(token, atscript)
      if (declared) {
        const spec = atscript.resolveAnnotation(token.annotationRef!.text.slice(1))
        const argType = spec?.arguments[token.index!]?.type
        const shown = argType === 'string' ? `'${declared.value}'` : declared.value
        const parts = [`\`${shown}\``]
        if (declared.documentation) {
          parts.push(declared.documentation)
        }
        if (declared.definition) {
          const { doc: declaring, token: declToken } = declared.definition
          const where =
            declaring === atscript ? '' : ` in \`${getRelPath(atscript.id, declaring.id)}\``
          parts.push(`Declared${where} at line ${declToken.range.start.line + 1}`)
        }
        const argDescription = spec?.renderDocs(token.index!)
        if (argDescription) {
          parts.push('---', argDescription)
        }
        return {
          contents: { kind: 'markdown', value: parts.join('\n\n') },
          range: token.range,
        } as Hover
      }
      if (!token.annotationRef && isRef(token.parentNode)) {
        const unwound = atscript.unwindRef(token.parentNode)
        const docs = [] as string[]
        if (isPhantomPath(unwound)) {
          docs.push('*(phantom — excluded from types, validation, and schema)*')
        }
        // (a type path through a union naming several fields: each field's, once)
        for (const { def, node } of distinctFields(unwound)) {
          if (isPrimitive(def) && def.config.isContainer) {
            docs.push('*(container — must use an extension)*')
          }
          if (node && node.documentation) {
            docs.push(node.documentation)
          }
          if (def?.documentation) {
            docs.push(def.documentation)
          }
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
    const configFile = fileUriToPath(_configFile)
    console.log(`Reloading config: ${configFile}`)
    this.configFiles.delete(configFile)
    for (const [id, cache] of Array.from(this.configs.entries())) {
      const { file } = await cache
      if (file === configFile) {
        this.configs.delete(id)
        this.closeDocument(id)
        this.addToRevalidateQueue(id)
      }
    }
  }

  /**
   * A `.as` file changed on disk while it is not open in the editor (a `git`
   * checkout, a generator, an external tool). An open document is fed by the
   * editor through `onDidChangeContent` and is left alone here.
   *
   * The base repo reads an imported document from disk once and caches it
   * until it is closed, so without this every importer kept resolving against
   * the stale parse until the server restarted. Closing the document makes
   * the next check of each dependant re-read it from disk; the dependants are
   * queued for that check.
   *
   * The file itself is checked again when it exists (re-read from disk: a closed file's
   * diagnostics follow its content), its diagnostics cleared when it was deleted.
   */
  async onAsFileChanged(uri: string, deleted = false): Promise<void> {
    if (this.documents.get(uri)) {
      // (open: the editor feeds it) — created, its importers whose import of it failed
      // (`"./b" not found`) check it again
      for (const doc of await this.documentsImporting(uri)) {
        this.revalidateDependants(doc)
        doc.clearMessages()
        this.addToRevalidateQueue(doc.id)
      }
      return
    }
    const cached = this.atscripts.get(uri)
    // (a document that failed to open has no dependants wired to it)
    const before = cached ? await cached.catch(() => undefined) : undefined
    // The documents importing it, directly or not (their diagnostics may read its types through
    // other files: `Unknown property "b.x"` of an alias of a type importing it) — and, for a
    // file not open yet (created, or one whose open failed), those whose import of it failed
    // (`"./b" not found`).
    const dependants = new Set<AtscriptDoc>(
      before ? [...before.transitive('dependants')].filter(d => d !== before) : []
    )
    for (const doc of await this.documentsImporting(uri)) {
      dependants.add(doc)
      for (const d of doc.transitive('dependants')) {
        dependants.add(d)
      }
    }
    // (the documents whose blocks' diagnostics read it, or the documents it imported: whether
    // their blocks are reachable)
    if (before) {
      this.revalidateReaders([before, ...before.dependencies], before)
    }
    this.closeDocument(uri)
    for (const d of dependants) {
      if (d.id !== uri) {
        // (their diagnostics are computed again: they read the closed document)
        d.clearMessages()
        this.addToRevalidateQueue(d.id)
      }
    }
    if (deleted) {
      this.blockReads.delete(uri)
      this.connection.sendDiagnostics({ uri, diagnostics: [] })
    } else {
      // (checked as changed: what reads it is checked again after it)
      this.addToChangeQueue(uri)
    }
  }

  /** The loaded documents (but `uri`'s) with an import of `uri`, resolved or not. */
  private async documentsImporting(uri: string): Promise<AtscriptDoc[]> {
    const out: AtscriptDoc[] = []
    for (const cached of Array.from(this.atscripts.values())) {
      const doc = await cached.catch(() => undefined)
      if (!doc || doc.id === uri) {
        continue
      }
      for (const { from } of doc.imports.values()) {
        if (doc.resolveImportId(resolveAtscriptFromPath(from.text, doc.id)) === uri) {
          out.push(doc)
          break
        }
      }
    }
    return out
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
        for (const entry of node.entries) {
          // (the entry's path: through a union, phantom when every field it names is)
          if (!isPhantomPath(atscript.unwindType(node.targetName, entryParts(entry)))) {
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

  async getAnnotationContextAt(
    document: TextDocument,
    position: Position,
    existingDoc?: AtscriptDoc
  ) {
    const text = document.getText()
    const offset = document.offsetAt(position)

    const lineText = lineTextBefore(text, offset)

    // Check if the line starts with an annotation (e.g., @label)
    const annotationMatch = /^\s*@([.0-9A-Za-z]*)/u.exec(lineText)
    if (!annotationMatch) {
      return
    }
    const atscript = existingDoc ?? (await this.openDocument(document.uri))
    // a cursor in a comment trailing the annotation is not in an argument
    if (atscript.isInComment(offset)) {
      return
    }
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
          arg.backtickNode &&
          arg.range.start.line <= position.line &&
          arg.range.end.line >= position.line &&
          (arg.range.start.line < position.line ||
            arg.range.start.character <= position.character) &&
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
    includePrimitives = true,
    filter?: (decl: SemanticNode, doc: AtscriptDoc) => boolean
  ): Promise<CompletionItem[] | undefined> {
    const defs = Array.from(atscript.registry.definitions.entries())
    const items = [] as CompletionItem[]
    const exporters = new Map<string, AtscriptDoc>()
    const importSet = new Set<string>()
    for (const [key, token] of defs) {
      let t = token
      let owner = atscript
      if (token.fromPath) {
        let exporter = exporters.get(token.fromPath)
        if (!exporter) {
          exporter = await this.openDocument(
            atscript.resolveImportId(resolveAtscriptFromPath(token.fromPath, atscript.id))
          )
          exporters.set(token.fromPath, exporter)
        }
        t = exporter.registry.definitions.get(token.text)!
        owner = exporter
        importSet.add(token.text)
      }
      if (filter && !(t?.parentNode && filter(t.parentNode, owner))) {
        continue
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
          if (token && !importSet.has(token.text) && (!filter || filter(node, doc))) {
            const fromPath = this.resolvedToBare.get(doc.id) ?? getRelPath(atscript.id, doc.id)
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
    const target = await this.openDocument(
      atscript.resolveImportId(resolveAtscriptFromPath(block.fromPath!, atscript.id))
    )
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

  /**
   * Usages of the symbol under the cursor and the location(s) of its definition.
   * A field ref (query field ref, field-path string arg) is resolved once for both.
   */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  referencesOf(
    atscript: AtscriptDoc,
    token: Token,
    position: Position
  ): {
    usages: Array<{ uri: string; range: Token['range'] }> | undefined
    definitions: Array<{ uri: string; range: Token['range'] }>
  } {
    // (a field ref through a union: every field it names)
    const fields = fieldRefTokens(token, atscript, position.character).flatMap(f =>
      f.propToken ? [{ doc: f.doc, propToken: f.propToken }] : []
    )
    if (fields.length > 0) {
      // (a usage of several of the fields once: by its location; `range` is a new object per read)
      const usages = fields.flatMap(f => f.doc.usageListFor(f.propToken) ?? [])
      const at = (u: (typeof usages)[number]) =>
        `${u.uri}\0${u.range.start.line}:${u.range.start.character}`
      return {
        usages: [...new Map(usages.map(u => [at(u), u])).values()],
        definitions: fields.map(f => ({ uri: f.doc.id, range: f.propToken.range })),
      }
    }
    const usages = atscript.usageListFor(token)
    const defLocations = atscript.getToDefinitionAt(position.line, position.character)
    if (defLocations) {
      return {
        usages,
        definitions: defLocations.map(loc => ({
          uri: loc.targetUri,
          range: loc.targetSelectionRange,
        })),
      }
    }
    return {
      usages,
      definitions:
        token.isDefinition || isProp(token.parentNode)
          ? [{ uri: atscript.id, range: token.range }]
          : [],
    }
  }

  /**
   * Field completions inside a field-path `string` annotation argument (spec declares
   * `fieldScope`). A dotted path offers the fields of the level typed so far.
   */
  getFieldPathCompletions(
    atscript: AtscriptDoc,
    position: Position,
    aContext: { annotationToken: Token; argToken?: Token }
  ): CompletionItem[] | undefined {
    const argToken = aContext.argToken
    if (!argToken || argToken.annotationRef !== aContext.annotationToken) {
      return undefined
    }
    const scope = getFieldPathCompletionScope(argToken, atscript, position.character)
    if (!scope) {
      return undefined
    }
    const owner = [scope.typeName, ...scope.chain].join('.')
    return this.propsToCompletionItems(scope.fields, `field of ${owner}`)
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, max-params
  getQueryCompletions(
    document: TextDocument,
    position: Position,
    atscript: AtscriptDoc,
    aContext: {
      annotationToken: Token
      argToken?: Token
      currentIndex: number
      annotationSpec?: { arguments: Array<{ type: string }> }
    },
    mode: TBacktickArgKind
  ): CompletionItem[] | undefined {
    try {
      const text = document.getText()
      const offset = document.offsetAt(position)

      // Find the backtick token containing cursor
      const queryArgToken = aContext.argToken
      if (!queryArgToken) {
        return undefined
      }

      const scope = getQueryCompletionScope(queryArgToken, atscript)
      if (!scope) {
        return undefined
      }

      // Extract text inside backticks up to cursor
      const textBefore = text.slice(0, offset)
      const backtickPos = textBefore.lastIndexOf('`')
      if (backtickPos < 0) {
        return undefined
      }
      const textInQuery = textBefore.slice(backtickPos + 1)

      const context = analyzeQueryCursorContext(textInQuery, mode)

      switch (context.type) {
        case 'field-start': {
          const items: CompletionItem[] = []
          if (mode === 'expr') {
            for (const fn of BACKTICK_ARG_VOCABULARY.functions) {
              items.push({
                label: fn,
                kind: CompletionItemKind.Function,
                detail: 'First non-null argument',
                insertText: `${fn}(\${1:field}, \${2:0})`,
                insertTextFormat: InsertTextFormat.Snippet,
              })
            }
          }
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
            items.push(
              ...this.propsToCompletionItems(
                scope.getFields(scope.unqualifiedTarget),
                `field of ${scope.unqualifiedTarget}`
              )!
            )
          }
          return items
        }
        case 'after-dot': {
          const typeName = context.typeName
          if (typeName && scope.typeNames.includes(typeName)) {
            return this.propsToCompletionItems(scope.getFields(typeName), `field of ${typeName}`)
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
        case 'after-operand': {
          return BACKTICK_ARG_VOCABULARY.arithmeticOps.map(label => ({
            label,
            kind: CompletionItemKind.Operator,
          }))
        }
        case 'after-order-key': {
          return [
            ...BACKTICK_ARG_VOCABULARY.orderDirections.map(label => ({
              label,
              kind: CompletionItemKind.Keyword,
            })),
            { label: ',', kind: CompletionItemKind.Operator },
          ]
        }
        case 'after-order-direction': {
          return [{ label: ',', kind: CompletionItemKind.Operator }]
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
      // A check that throws must not stop the queue (or leave it non-idle for good).
      try {
        await new Promise(resolve => setTimeout(resolve, this.checksDelay))
        while (this.changeQueue.length > 0 || this.revalidateQueue.length > 0) {
          const id = (this.changeQueue.shift() ?? this.revalidateQueue.shift())!
          try {
            await this.checkQueued(id)
          } catch (error) {
            console.error('Failed to check', id, error)
          }
          if (this.changeQueue.length > 0 || this.revalidateQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, this.checksDelay))
          }
        }
      } finally {
        this.idle = true
      }
    }
  }

  /**
   * Checks one queued document, re-parsed first when its text changed. It stays marked changed
   * until the re-parse succeeded, so a failed one is retried by the next check.
   */
  private async checkQueued(id: string) {
    this.pendingCheck.delete(id)
    if (this.closedSet.delete(id) && !this.documents.get(id) && (await this.revertClosed(id))) {
      return
    }
    const doc = await this.openDocument(id)
    const changed = this.changedSet.has(id)
    if (changed) {
      const text = this.documents.get(id)?.getText()
      if (typeof text === 'string') {
        doc.update(text)
      }
      this.changedSet.delete(id)
    }
    await this.checkDoc(doc, changed)
  }

  /**
   * A document the editor closed: unsaved edits are discarded, so when the text it was parsed
   * from is not the file's content on disk (or the file is gone), it is handled as a change on
   * disk (`onAsFileChanged`): re-read (or dropped) and the documents importing it checked again.
   * Returns whether it was (else it is checked as usual).
   */
  private async revertClosed(id: string): Promise<boolean> {
    const cached = this.atscripts.get(id)
    const doc = cached && (await cached.catch(() => undefined))
    const disk = await this.readFromDisk(id)
    // (not parsed — closed by a change on disk, say: read from disk by the usual check)
    if (doc ? disk === doc.text : disk !== undefined) {
      return false
    }
    if (this.documents.get(id)) {
      // (opened again meanwhile: the editor feeds it, a change is queued)
      return true
    }
    this.changedSet.delete(id)
    await this.onAsFileChanged(id, disk === undefined)
    return true
  }

  /** The content of `id` on disk (`undefined`: deleted or unreadable). */
  private async readFromDisk(id: string): Promise<string | undefined> {
    try {
      const { manager } = await this.resolveConfig(id)
      const content = await manager.load((await manager.resolve(id)) ?? id)
      return typeof content === 'string' ? content : undefined
    } catch {
      return undefined
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
  propsToCompletionItems(
    props: SemanticNode[] | undefined,
    detail?: string
  ): CompletionItem[] | undefined {
    return props?.map(t => ({
      label: t.id!,
      kind: CompletionItemKind.Property,
      detail,
      documentation: t.documentation
        ? ({ kind: 'markdown', value: t.documentation } as MarkupContent)
        : undefined,
    }))
  }

  /**
   * Re-checks the documents importing `atscript`, directly or not: a change can alter the
   * diagnostics of any of them (a chained reference, a definition inlined across imports) — and
   * those whose blocks' diagnostics read it or the documents it imports (or imported `before`):
   * their importers changed (see `revalidateReaders`).
   */
  revalidateDependants(atscript: AtscriptDoc, before: Iterable<AtscriptDoc> = []) {
    for (const d of atscript.transitive('dependants')) {
      if (d !== atscript) {
        d.clearMessages()
        this.addToRevalidateQueue(d.id)
      }
    }
    this.revalidateReaders([atscript, ...atscript.dependencies, ...before], atscript)
  }

  /**
   * Re-checks the documents (but `except`) whose mutating `annotate` blocks' diagnostics read one
   * of `changed` as of their last check (see `blockDependencies`): a document changed (its text,
   * or its imports), or the documents it imports now or imported before (their importers
   * changed). Whether a block is reachable depends on the documents using its target — through
   * plain aliases, in any file — and on what they import (see the warning of
   * `AtscriptDoc.getDiagMessages`).
   */
  revalidateReaders(changed: Iterable<AtscriptDoc>, except?: AtscriptDoc) {
    const ids = new Set([...changed].map(d => d.id))
    const readsOne = (reads: Set<string>) => {
      for (const changedId of ids) {
        if (reads.has(changedId)) {
          return true
        }
      }
      return false
    }
    for (const [id, { doc, ids: reads }] of this.blockReads) {
      if (id !== except?.id && readsOne(reads)) {
        doc.clearMessages()
        this.addToRevalidateQueue(id)
      }
    }
  }

  async checkDoc(atscript: AtscriptDoc, changed = false) {
    const before = [...atscript.dependencies]
    const closure = atscript.transitive('dependencies')
    try {
      await this.checkImports(atscript)
      // Imports resolving otherwise (a file created, deleted, loaded for the first time — also
      // a document it imports indirectly, whose imports now have one more dependant: LSP-UW):
      // the documents whose blocks' diagnostics read one of them (now or before) are checked
      // again.
      const after = atscript.transitive('dependencies')
      if (closure.size !== after.size || [...closure].some(d => !after.has(d))) {
        this.revalidateReaders([atscript, ...after, ...closure, ...before], atscript)
      }
      const unused = atscript.getUnusedTokens()
      const messages = atscript.getDiagMessages()
      // (what its blocks' diagnostics read, as of now)
      const reads = blockDependencies(atscript)
      if (reads.size > 0) {
        this.blockReads.set(atscript.id, { doc: atscript, ids: new Set([...reads].map(d => d.id)) })
      } else {
        this.blockReads.delete(atscript.id)
      }
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
    } finally {
      // Even when the check failed: the dependants see the changed document (and the readers
      // of the documents it imported before, see `revalidateReaders`).
      if (changed) {
        this.revalidateDependants(atscript, before)
      }
    }
  }
}
