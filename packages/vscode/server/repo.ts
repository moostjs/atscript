/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable no-promise-executor-return */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { readFile } from 'fs'
import type { TMessages, Token } from 'intertation'
import { ItnDocument, resolveItnFromPath } from 'intertation'
import path from 'path'
import type { createConnection, TextDocuments } from 'vscode-languageserver/node'
import { DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver/node'
import type { TextDocument } from 'vscode-languageserver-textdocument'

import { debounce } from './utils'

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

  private firstDocOpen = false

  // private readonly changeBuffer = new Map<id, >()

  // private readonly revalidateDependantsBuffer = [] as ItnDocument[]

  constructor(
    private readonly connection: ReturnType<typeof createConnection>,
    private readonly documents: TextDocuments<TextDocument>
  ) {
    this.documents.onDidChangeContent(
      debounce(change => {
        this.addToChangeQueue(change.document.uri)
        if (!this.firstDocOpen) {
          this.firstDocOpen = true
          setTimeout(() => {
            console.log('initial timeout', this.documents.all().length)
            this.documents.all().forEach(doc => {
              console.log('initially open doc', doc.uri)
              if (doc.uri !== change.document.uri) {
                this.addToRevalidateQueue(doc.uri)
              }
            })
          }, 1500)
        }
      }, 100)
    )
    documents.listen(connection)
    connection.listen()

    connection.onDefinition(async params => {
      console.log(params)
      const itnDoc = await this.openDocument(params.textDocument.uri)
      return itnDoc.getDefinitionByPos(params.position.line, params.position.character)
    })
  }

  async runChecks() {
    console.log('runChecks')
    if (this.idle && (this.changeQueue.length > 0 || this.revalidateQueue.length > 0)) {
      this.idle = false
      await new Promise(resolve => setTimeout(resolve, 250))
      console.log('Run Checks Started', {
        change: this.changeQueue,
        revalidate: this.revalidateQueue,
      })
      console.time('runchecks')
      const ids = [] as string[]
      while (this.changeQueue.length > 0 || this.revalidateQueue.length > 0) {
        console.log('while pass', this.changeQueue.length, this.revalidateQueue.length)
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
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      console.timeEnd('runchecks')
      console.log('Run Checks Finished', ids)
      this.idle = true
    }
  }

  addToChangeQueue(id: string) {
    console.log('addToChangeQueue', id)
    this.changedSet.add(id)
    if (this.pendingCheck.has(id)) {
      return
    }
    this.pendingCheck.add(id)
    this.changeQueue.push(id)
    if (this.idle) {
      this.runChecks()
    }
  }

  addToRevalidateQueue(id: string) {
    console.log('addToRevalidateQueue', id)
    if (this.pendingCheck.has(id)) {
      return
    }
    this.pendingCheck.add(id)
    this.revalidateQueue.push(id)
    if (this.idle) {
      this.runChecks()
    }
  }

  openDocument(id: string, text: string): ItnDocument
  openDocument(id: string): Promise<ItnDocument>
  openDocument(id: string, text?: string): ItnDocument | Promise<ItnDocument> {
    if (typeof text === 'string') {
      if (!this.itn.has(id)) {
        console.log('create', id)
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
        readFile(id.slice(7), 'utf8', (err, data) => {
          if (err) {
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
    console.log('send diag', itnDoc.messages)
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
      Array.from(itnDoc.imports.values(), async ({ from, tokens }) =>
        this.checkImport(itnDoc, from, tokens)
      )
    )
    const results = await promise
    itnDoc.updateDependencies(results.filter(Boolean) as ItnDocument[])
  }

  async checkImport(
    itnDoc: ItnDocument,
    from: Token,
    tokens: Token[]
  ): Promise<ItnDocument | undefined> {
    const forId = resolveItnFromPath(from.text, itnDoc.id)
    const errors = [] as TMessages
    let external: ItnDocument | undefined
    try {
      external = await this.openDocument(forId)
      for (const token of tokens) {
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
