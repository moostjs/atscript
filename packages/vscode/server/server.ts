import { parseItn } from 'intertation'
import type {
  CompletionItem,
  Diagnostic,
  InitializeParams,
  InitializeResult,
} from 'vscode-languageserver/node'
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

// Create connection
const connection = createConnection(ProposedFeatures.all)

// Track open documents
const documents = new TextDocuments<TextDocument>(TextDocument)

connection.onInitialize(
  (params: InitializeParams): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // enable completion
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['@', '.'],
      },
    },
  })
)

// Validate documents when they change
documents.onDidChangeContent(change => {
  validateTextDocument(change.document)
})

function validateTextDocument(textDocument: TextDocument) {
  const text = textDocument.getText()
  const diagnostics: Diagnostic[] = []

  const { nodes, messages } = parseItn(text)

  // 1) A very naive check: if we see "@label" with no argument after it, produce an error
  //    This is extremely simplified. Ideally you parse properly and detect string or quotes, etc.
  // const labelRegex = /@label(\s+[^\s{]+)?/gu
  // let match: RegExpExecArray | null
  // while ((match = labelRegex.exec(text))) {
  //   // match[1] is the argument after @label
  //   if (!match[1]) {
  //     // No argument found => error
  //     const startPos = match.index
  //     const endPos = startPos + match[0].length
  //     diagnostics.push({
  //       severity: DiagnosticSeverity.Error,
  //       range: {
  //         start: textDocument.positionAt(startPos),
  //         end: textDocument.positionAt(endPos),
  //       },
  //       message: `@label annotation requires an argument`,
  //       source: 'intertation-lsp',
  //     })
  //   }
  // }

  // const s2 = /:\s*string2/u.exec(text)?.index
  // if (s2 !== undefined) {
  //   const startPos = s2
  //   const endPos = startPos + 'string2'.length
  //   diagnostics.push({
  //     severity: DiagnosticSeverity.Error,
  //     range: {
  //       start: textDocument.positionAt(startPos),
  //       end: textDocument.positionAt(endPos),
  //     },
  //     message: `Unsupported type: string2`,
  //     source: 'intertation-lsp',
  //   })
  // }

  // 2) Another naive check: optional fields must have a question mark?
  //    Or any other custom rules you want

  // Send the computed diagnostics
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
}

// Provide completions for annotations and known types
connection.onCompletion(
  _textDocumentPosition =>
    // Provide some static suggestions
    [
      {
        label: '@label',
        kind: CompletionItemKind.Keyword,
        detail: 'Annotation: @label',
      },
      {
        label: '@mongo.collection',
        kind: CompletionItemKind.Keyword,
        detail: 'Annotation: @mongo.collection',
      },
      {
        label: 'string',
        kind: CompletionItemKind.Keyword,
        detail: 'Type: string',
      },
      {
        label: 'boolean',
        kind: CompletionItemKind.Keyword,
        detail: 'Type: boolean',
      },
      {
        label: 'number',
        kind: CompletionItemKind.Keyword,
        detail: 'Type: number',
      },
    ] as CompletionItem[]
)

// If needed, refine or resolve completion details
connection.onCompletionResolve((item: CompletionItem) => item)

// Listen
documents.listen(connection)
connection.listen()
