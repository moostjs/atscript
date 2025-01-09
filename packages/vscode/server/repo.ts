/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable no-promise-executor-return */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { readFile } from 'fs'
import type { TMessages, Token } from 'intertation'
import { ItnDocument, resolveItnFromPath } from 'intertation'
import type { createConnection, TextDocuments } from 'vscode-languageserver/node'
import { CompletionItemKind, DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver/node'
import type { TextDocument, TextEdit } from 'vscode-languageserver-textdocument'

import { debounce } from './utils'

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

  // private readonly changeBuffer = new Map<id, >()

  // private readonly revalidateDependantsBuffer = [] as ItnDocument[]

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
      const token = itnDoc.getTokenAt(position.line, position.character)
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
      const changes: Record<string, TextEdit[] | undefined> = {}

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

    connection.onCompletion(async params => {
      const { textDocument, position, context } = params
      if (context?.triggerKind === 1) {
        return []
      }
      if (context?.triggerCharacter === '@') {
        return [
          {
            label: 'Label',
            kind: CompletionItemKind.Property,
            insertText: 'label',
            detail: 'Annotate with Label',
            documentation: {
              kind: 'markdown',
              value: '# Label',
            },
          },
          {
            label: 'Description',
            kind: CompletionItemKind.Property,
            insertText: 'description',
            detail: 'Annotate with Description',
            documentation: {
              kind: 'markdown',
              value: '# Description',
            },
          },
        ]
      }
      const itnDoc = await this.openDocument(textDocument.uri)
      const document = documents.get(textDocument.uri)

      if (!document) {
        return []
      }

      const text = document.getText()
      const offset = document.offsetAt(position)
      console.log(params)
      console.log(itnDoc.getTokenAt(position.line, position.character - 1))
      console.log('>>>')
      console.log(`${text.slice(offset - 10, offset)}∨${text.slice(offset, offset + 10)}`)
      console.log('<<<')
    })
  }

  checksDelay = CHECKS_DELAY

  currentCheck?: Promise<void>

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
      console.log('Run Checks Finished', ids)
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
      console.log('Reading from disk', id)
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
      // this.checkDoc(d)
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
