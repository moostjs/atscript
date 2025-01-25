import type {
  InitializeParams,
  InitializeResult,
  Range,
  SemanticTokens,
} from 'vscode-languageserver/node'
import {
  createConnection,
  ProposedFeatures,
  SemanticTokensBuilder,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { VscodeItnRepo } from './repo'

// Create connection
const connection = createConnection(ProposedFeatures.all)
// Track open documents
const documents = new TextDocuments<TextDocument>(TextDocument)

const repo = new VscodeItnRepo(connection, documents)

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

// Validate documents when they change

// connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
//   const doc = documents.get(params.textDocument.uri)
//   if (!doc) {
//     return { data: [] }
//   }
//   return getSemanticTokens(doc)
// })

// connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams): SemanticTokens => {
//   const doc = documents.get(params.textDocument.uri)
//   if (!doc) {
//     return { data: [] }
//   }
//   return getSemanticTokens(doc, params.range)
// })

function getSemanticTokens(doc: TextDocument, range?: Range): SemanticTokens {
  // 1) parse the doc using parseItn
  // const text = doc.getText(range)
  // const { nodes } = parseItn(text)

  // 2) We'll use a SemanticTokensBuilder to collect tokens
  const builder = new SemanticTokensBuilder()

  // 3) Walk your AST. For example, if you store global variables in ast.globals
  //    or if parseItn returns a list o f nodes, find their "start" and "end" or line/column.
  //    Let's assume you have something like ast.globals = [{ name, start, end }, ...].
  //    We'll produce a token for each global variable.

  // if (ast.globals) {
  //   for (const gVar of ast.globals) {
  const startPos = doc.positionAt(5)
  const endPos = doc.positionAt(25)
  const length = 25 - 5

  // push(line, startChar, length, tokenTypeIndex, tokenModifierBitset)
  // The tokenTypeIndex is the index in your legend above.
  // Suppose 'variable' was at index 0 in your tokenTypes.
  const tokenType = Math.floor(Math.random() * 5) // or find it dynamically
  const tokenModifiers = 0

  builder.push(startPos.line, startPos.character, length, tokenType, tokenModifiers)
  // }
  // }

  // 4) Once done, build and return
  return builder.build()
}

// Provide completions for annotations and known types
// connection.onCompletion(
//   _textDocumentPosition =>
//     // Provide some static suggestions
//     [
//       {
//         label: '@label',
//         kind: CompletionItemKind.Keyword,
//         detail: 'Annotation: @label',
//       },
//       {
//         label: '@mongo.collection',
//         kind: CompletionItemKind.Keyword,
//         detail: 'Annotation: @mongo.collection',
//       },
//       {
//         label: 'string',
//         kind: CompletionItemKind.Keyword,
//         detail: 'Type: string',
//       },
//       {
//         label: 'boolean',
//         kind: CompletionItemKind.Keyword,
//         detail: 'Type: boolean',
//       },
//       {
//         label: 'number',
//         kind: CompletionItemKind.Keyword,
//         detail: 'Type: number',
//       },
//     ] as CompletionItem[]
// )

// // If needed, refine or resolve completion details
// connection.onCompletionResolve((item: CompletionItem) => item)
