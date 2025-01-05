import { parseItn } from 'intertation'
import type {
  CompletionItem,
  Diagnostic,
  InitializeParams,
  InitializeResult,
  Range,
  SemanticTokens,
  SemanticTokensParams,
  SemanticTokensRangeParams,
} from 'vscode-languageserver/node'
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  SemanticTokensBuilder,
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
      // Add semantic tokens capability:
      semanticTokensProvider: {
        // The legend must list the token types you plan to use
        legend: {
          tokenTypes: [
            'interface',
            'type',
            'string',
            'number',
            // etc...
          ],
          tokenModifiers: [], // e.g. "static", "declaration", etc. if needed
        },
        full: true, // enable full document requests
        range: true, // optionally enable range-based requests
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

  const { ast, messages } = parseItn(text)

  messages.forEach(m => {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: m.range,
      message: m.message,
      source: 'intertation-lsp',
    })
  })

  // Send the computed diagnostics
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
}

connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) {
    return { data: [] }
  }
  return getSemanticTokens(doc)
})

connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams): SemanticTokens => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) {
    return { data: [] }
  }
  return getSemanticTokens(doc, params.range)
})

function getSemanticTokens(doc: TextDocument, range?: Range): SemanticTokens {
  // 1) parse the doc using parseItn
  const text = doc.getText(range)
  const { ast } = parseItn(text)

  console.log('getSemanticTokens', range)

  // 2) We'll use a SemanticTokensBuilder to collect tokens
  const builder = new SemanticTokensBuilder()

  // 3) Walk your AST. For example, if you store global variables in ast.globals
  //    or if parseItn returns a list of nodes, find their "start" and "end" or line/column.
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
