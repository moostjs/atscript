/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { readFile } from 'fs'
import type { TMessages, Token } from 'intertation'
import { ItnDocument } from 'intertation'
import path from 'path'
import type { createConnection, TextDocuments } from 'vscode-languageserver/node'
import type { TextDocument } from 'vscode-languageserver-textdocument'

import { debounce } from './utils'

const config = {
  reserved: ['string', 'number', 'boolean', 'true', 'false', 'undefined', 'null', 'void'],
}

export class ItnRepo {
  private readonly itn = new Map<string, ItnDocument>()

  private readonly reading = new Map<string, Promise<ItnDocument>>()

  // private readonly changeBuffer = new Map<id, >()

  // private readonly revalidateDependantsBuffer = [] as ItnDocument[]

  constructor(
    private readonly connection: ReturnType<typeof createConnection>,
    private readonly documents: TextDocuments<TextDocument>
  ) {
    this.documents.onDidChangeContent(
      debounce(change => {
        this.changed(change.document)
      }, 100)
    )
    // Listen
    documents.listen(connection)
    connection.listen()
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
      console.log('from cache', id)
      return this.itn.get(id)!
    }
    const td = this.documents.get(id)
    if (td) {
      console.log('from open documents', id)
      const itnDoc = new ItnDocument(id, config)
      this.itn.set(id, itnDoc)
      itnDoc.update(td.getText())
      return itnDoc
    }
    let promise = this.reading.get(id)
    if (!promise) {
      console.log('reading from disk', id)
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

  changed(textDoc: TextDocument) {
    const itnDoc = this.openDocument(textDoc.uri, textDoc.getText())
    this.checkDoc(itnDoc)
    this.revalidateDependants(itnDoc)
  }

  revalidateDependants(itnDoc: ItnDocument) {
    itnDoc.dependants.forEach(d => {
      d.clearMessages()
      this.checkDoc(d)
    })
  }

  async checkDoc(itnDoc: ItnDocument) {
    await this.checkImports(itnDoc)
    this.connection.sendDiagnostics({
      uri: itnDoc.id,
      diagnostics: itnDoc.getAllMessages(),
    })
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

  async checkImport(itnDoc: ItnDocument, from: Token, tokens: Token[]) {
    const forId = `file://${path.join(
      itnDoc.id.slice(7).split('/').slice(0, -1).join('/'),
      from.text
    )}.itn`
    const errors = [] as TMessages
    let external: ItnDocument | undefined
    try {
      external = await this.openDocument(forId)
      for (const token of tokens) {
        if (!external.exports.has(token.text)) {
          errors.push({
            type: 'error',
            message: `"${from.text}" has no exported member "${token.text}"`,
            range: token.range,
          })
        }
      }
    } catch (error) {
      errors.push({
        type: 'error',
        message: `"${from.text}" not found`,
        range: from.range,
      })
    }
    if (errors.length > 0) {
      const messages = itnDoc.getAllMessages()
      messages.push(...errors)
    }
    return external
  }
}
