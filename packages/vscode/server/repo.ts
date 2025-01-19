/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable no-promise-executor-return */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { readFile } from 'fs'
import type { TMessages, Token } from 'intertation'
import {
  getRelPath,
  isInterface,
  isRef,
  isStructure,
  ItnDocument,
  resolveItnFromPath,
} from 'intertation'
import type {
  CompletionItem,
  createConnection,
  Position,
  TextDocuments,
  WorkspaceEdit,
} from 'vscode-languageserver/node'
import { CompletionItemKind, DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver/node'
import type { TextDocument } from 'vscode-languageserver-textdocument'

import { addImport, charBefore, createInsertTextRule, getItnFileCompletions } from './utils'

const CHECKS_DELAY = 250

const config = {
  globalTypes: ['string', 'number', 'boolean', 'true', 'false', 'undefined', 'null', 'void'],
}

export class ItnRepo {
  private readonly itn = new Map<string, ItnDocument>()

  private readonly reading = new Map<string, Promise<ItnDocument>>()

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
    this.documents.onDidChangeContent(change => {
      this.addToChangeQueue(change.document.uri)
    })

    documents.listen(connection)
    connection.listen()

    connection.onNotification('workspace/files', async (fileUris: string[]) => {
      fileUris.forEach(uri => {
        this.addToRevalidateQueue(uri)
      })
      this.checksDelay = 1
      this.triggerChecks()
      await this.currentCheck
      this.checksDelay = CHECKS_DELAY
    })

    connection.onDefinition(async params => {
      const itnDoc = await this.openDocument(params.textDocument.uri)
      return itnDoc.getToDefinitionAt(params.position.line, params.position.character)
    })

    connection.onReferences(async params => {
      const itnDoc = await this.openDocument(params.textDocument.uri)
      return itnDoc.getUsageListAt(params.position.line, params.position.character)
    })

    connection.onRenameRequest(async params => {
      const { textDocument, position, newName } = params

      // Open the document and find the token at the cursor
      const itnDoc = await this.openDocument(textDocument.uri)
      if (this.currentCheck) {
        await this.currentCheck
      }
      const token = itnDoc.tokensIndex.at(position.line, position.character)
      if (!token) {
        return null // No token found at the cursor
      }
      const references = itnDoc.usageListFor(token)

      if (!references || references.length === 0) {
        return null // No references found
      }

      const def = token.isDefinition ? { uri: itnDoc.id, token } : itnDoc.getDefinitionFor(token)

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
      const { textDocument, position, context } = params
      const document = documents.get(textDocument.uri)
      if (!document) {
        return
      }
      console.log('completion triggered', context, position)
      await this.currentCheck
      const text = document.getText()
      const offset = document.offsetAt(position)
      const itnDoc = await this.openDocument(textDocument.uri)
      const block = itnDoc.blocksIndex.at(position.line, position.character)

      // import { here } from '...'
      if (block?.blockType === 'import' && block.fromPath) {
        return this.getImportBlockCompletions(itnDoc, block, text, offset, context?.triggerKind)
      }

      // import { ... } from 'here'
      const token = itnDoc.tokensIndex.at(position.line, position.character)
      if (typeof token?.fromPath === 'string') {
        return this.getImportPathCompletions(itnDoc, token, position)
      }

      // declared (imported) types or exported from other documents
      const before = charBefore(text, offset, [/[\s\w]/u])
      if (block?.blockType === 'structure' && before && [':', '|', '&'].includes(before)) {
        return this.getDeclarationsCompletions(itnDoc, text)
      }

      // autocomplete for defined nodes
      if (token?.parentNode && isRef(token.parentNode)) {
        const id = token.parentNode.token('identifier')
        if (!id) {
          return undefined
        }
        const node = itnDoc.getDeclarationOwnerNode(id.text)
        if (!node || (!isStructure(node) && !isInterface(node))) {
          return undefined
        }
        console.log('props', node.props.keys())
        const options = Array.from(node.props.keys())
        if (token.type === 'punctuation') {
          // after dot
          return options.map(o => ({
            label: o,
            kind: CompletionItemKind.Property,
            insertText: o,
          })) as CompletionItem[]
        } else if (['identifier', 'text'].includes(token.type)) {
          // inside identifier
        }
      }
    })
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, max-params
  async getDeclarationsCompletions(
    itnDoc: ItnDocument,
    text: string
  ): Promise<CompletionItem[] | undefined> {
    const defs = Array.from(itnDoc.registry.definitions.entries())
    const items = [] as CompletionItem[]
    const exporters = new Map<string, ItnDocument>()
    const importSet = new Set<string>()
    for (const [key, token] of defs) {
      let t = token
      if (token.fromPath) {
        let exporter = exporters.get(token.fromPath)
        if (!exporter) {
          exporter = await this.openDocument(resolveItnFromPath(token.fromPath, itnDoc.id))
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
    for (const doc of this.itn.values()) {
      if (doc !== itnDoc) {
        for (const node of doc.exports.values()) {
          const token = node.token('identifier')
          if (token && !importSet.has(token.text)) {
            const fromPath = getRelPath(itnDoc.id, doc.id)
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
    return items
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, max-params
  async getImportBlockCompletions(
    itnDoc: ItnDocument,
    block: Token,
    text: string,
    offset: number,
    triggerKind?: 1 | 2 | 3
  ): Promise<CompletionItem[] | undefined> {
    const rule = createInsertTextRule(text, offset, triggerKind ?? 1)
    const target = await this.openDocument(resolveItnFromPath(block.fromPath!, itnDoc.id))
    if (target) {
      const imports = itnDoc.imports.get(target.id)?.imports || []
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
    itnDoc: ItnDocument,
    token: Token,
    position: Position
  ): Promise<CompletionItem[] | undefined> {
    const dif = position.character - token.range.start.character - 1
    const paths = await getItnFileCompletions(itnDoc.id, token.fromPath!.slice(0, dif))
    // console.log(result)
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
        if (this.changedSet.has(id) && this.itn.has(id)) {
          const text = this.documents.get(id)?.getText()
          if (typeof text === 'string') {
            doc.update(text)
          }
        }
        const changed = this.changedSet.has(id)
        this.changedSet.delete(id)
        this.checkDoc(doc, changed)
        await new Promise(resolve => setTimeout(resolve, this.checksDelay))
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

  openDocument(id: string, text: string): ItnDocument
  openDocument(id: string): Promise<ItnDocument>
  openDocument(id: string, text?: string): ItnDocument | Promise<ItnDocument> {
    if (typeof text === 'string') {
      if (!this.itn.has(id)) {
        this.itn.set(id, new ItnDocument(id, config))
      }
      const itnDoc = this.itn.get(id)!
      itnDoc.update(text)
      return itnDoc
    }
    if (this.itn.has(id)) {
      return this.itn.get(id)!
    }
    const td = this.documents.get(id)
    if (td) {
      const itnDoc = new ItnDocument(id, config)
      this.itn.set(id, itnDoc)
      itnDoc.update(td.getText())
      return itnDoc
    }
    let promise = this.reading.get(id)
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        readFile(decodeURI(id.slice(7)), 'utf8', (err, data) => {
          if (err) {
            console.error(err.message)
            reject(err)
            return
          }
          const itnDoc = new ItnDocument(id, config)
          itnDoc.update(data.toString())
          this.itn.set(id, itnDoc)
          this.reading.delete(id)
          resolve(itnDoc)
        })
      })
      this.reading.set(id, promise)
    }
    return promise
  }

  revalidateDependants(itnDoc: ItnDocument) {
    itnDoc.dependants.forEach(d => {
      d.clearMessages()
      this.addToRevalidateQueue(d.id)
    })
  }

  async checkDoc(itnDoc: ItnDocument, changed = false) {
    await this.checkImports(itnDoc)
    const unused = itnDoc.getUnusedTokens()
    const messages = itnDoc.getDiagMessages()
    this.connection.sendDiagnostics({
      uri: itnDoc.id,
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
      this.revalidateDependants(itnDoc)
    }
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
