import type { InitializeParams, InitializeResult } from 'vscode-languageserver/node'
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { VscodeAtscriptRepo } from './repo'

// Create connection
const connection = createConnection(ProposedFeatures.all)
// Track open documents
const documents = new TextDocuments<TextDocument>(TextDocument)

new VscodeAtscriptRepo(connection, documents)

connection.onInitialize(
  (params: InitializeParams): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      hoverProvider: true,
      // enable completion
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['@', '.', ',', '{', "'", '"'],
      },
      signatureHelpProvider: {
        triggerCharacters: [',', ' '],
        retriggerCharacters: [',', ' '],
      },
      // semanticTokensProvider: {
      //   legend: {
      //     tokenTypes: ['property'],
      //     tokenModifiers: ['readonly'],
      //   },
      //   range: true,
      //   // full: true,
      // },
    },
  })
)
