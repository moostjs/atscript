import {
  AnnotationSpec,
  AtscriptDoc,
  getSiblingAnnotation,
  PluginManager,
  SemanticInterfaceNode,
  SemanticPrimitiveNode,
} from '@atscript/core'
import type { SemanticNode, TAtscriptDocConfig, TValueCandidate, Token } from '@atscript/core'
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { CompletionItemKind } from 'vscode-languageserver/node'

import { VscodeAtscriptRepo } from './repo'

// ---------------------------------------------------------------------------
// Shared primitives & annotations
// ---------------------------------------------------------------------------

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set(
  'string',
  new SemanticPrimitiveNode('string', {
    type: 'string',
    extensions: {
      email: { type: 'string', annotations: { 'expect.pattern': '^.+@.+$' } },
    },
  })
)
primitives.set(
  'number',
  new SemanticPrimitiveNode('number', {
    type: 'number',
    extensions: {
      int: { type: 'number', annotations: { 'expect.int': true } },
      positive: { type: 'number', annotations: { 'expect.min': 0 } },
    },
  })
)
primitives.set('boolean', new SemanticPrimitiveNode('boolean', { type: 'boolean' }))
primitives.set('phantom', new SemanticPrimitiveNode('phantom', { type: 'phantom' }))
primitives.set(
  'ui',
  new SemanticPrimitiveNode('ui', {
    type: 'phantom',
    isContainer: true,
    extensions: { action: {}, divider: {} },
  })
)

const annotations: Record<string, any> = {
  expect: {
    min: new AnnotationSpec({
      description: 'Minimum value.',
      defType: ['number'],
      argument: [
        { name: 'minValue', type: 'number' as const, description: 'The minimum value.' },
        { name: 'message', optional: true, type: 'string' as const, description: 'Error message.' },
      ],
    }),
    pattern: new AnnotationSpec({
      description: 'Regex pattern.',
      defType: ['string'],
      argument: [
        { name: 'pattern', type: 'string' as const, description: 'The regex pattern.' },
        {
          name: 'flags',
          optional: true,
          type: 'string' as const,
          description: 'Regex flags.',
          values: ['g', 'i', 'gi'],
        },
      ],
    }),
  },
  meta: {
    label: new AnnotationSpec({
      description: 'Human-readable label.',
      argument: { name: 'text', type: 'string' as const, description: 'The label text.' },
    }),
    id: new AnnotationSpec({
      description: 'Unique identifier.',
      nodeType: ['prop'],
    }),
  },
}

const docConfig: TAtscriptDocConfig = { primitives, annotations }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDoc(uri: string, source: string, config = docConfig): AtscriptDoc {
  const doc = new AtscriptDoc(uri, config)
  doc.update(source)
  return doc
}

function td(uri: string, content: string): TextDocument {
  return TextDocument.create(uri, 'atscript', 0, content)
}

// ---------------------------------------------------------------------------
// Mock LSP connection & documents
// ---------------------------------------------------------------------------

interface CapturedHandlers {
  onCompletion?: (...args: any[]) => any
  onHover?: (...args: any[]) => any
  onDefinition?: (...args: any[]) => any
  onReferences?: (...args: any[]) => any
  onRenameRequest?: (...args: any[]) => any
  onSignatureHelp?: (...args: any[]) => any
  semanticTokensOnRange?: (...args: any[]) => any
  onDidSaveTextDocument?: (...args: any[]) => any
  onDidChangeWatchedFiles?: (...args: any[]) => any
  workspaceFiles?: (...args: any[]) => any
}

function createMockConnection() {
  const handlers: CapturedHandlers = {}
  const connection = {
    onCompletion: vi.fn((h: (...args: any[]) => any) => {
      handlers.onCompletion = h
    }),
    onCompletionResolve: vi.fn(),
    onHover: vi.fn((h: (...args: any[]) => any) => {
      handlers.onHover = h
    }),
    onDefinition: vi.fn((h: (...args: any[]) => any) => {
      handlers.onDefinition = h
    }),
    onReferences: vi.fn((h: (...args: any[]) => any) => {
      handlers.onReferences = h
    }),
    onRenameRequest: vi.fn((h: (...args: any[]) => any) => {
      handlers.onRenameRequest = h
    }),
    onSignatureHelp: vi.fn((h: (...args: any[]) => any) => {
      handlers.onSignatureHelp = h
    }),
    onDidSaveTextDocument: vi.fn((h: (...args: any[]) => any) => {
      handlers.onDidSaveTextDocument = h
    }),
    onDidChangeWatchedFiles: vi.fn((h: (...args: any[]) => any) => {
      handlers.onDidChangeWatchedFiles = h
    }),
    onNotification: vi.fn((method: string, h: (...args: any[]) => any) => {
      if (method === 'workspace/files') {
        handlers.workspaceFiles = h
      }
    }),
    listen: vi.fn(),
    sendDiagnostics: vi.fn(),
    languages: {
      semanticTokens: {
        onRange: vi.fn((h: (...args: any[]) => any) => {
          handlers.semanticTokensOnRange = h
        }),
      },
    },
  }
  return { handlers, connection }
}

function createMockDocuments(textDocs: Map<string, TextDocument>) {
  return {
    onDidChangeContent: vi.fn(),
    onDidClose: vi.fn(),
    listen: vi.fn(),
    get: vi.fn((uri: string) => textDocs.get(uri)),
  }
}

// ---------------------------------------------------------------------------
// TestableRepo — bypasses filesystem and config resolution
// ---------------------------------------------------------------------------

class TestableRepo extends VscodeAtscriptRepo {
  public testDocs = new Map<string, AtscriptDoc>()

  protected async _openDocument(id: string): Promise<AtscriptDoc> {
    const doc = this.testDocs.get(id)
    if (doc) {
      return doc
    }
    throw new Error(`TestableRepo: doc not found for ${id}`)
  }

  async resolveConfig() {
    return {
      file: undefined,
      manager: {
        getDocConfig: async () => docConfig,
        config: async () => ({ rootDir: '/' }),
        onDocument: async () => {},
      } as any,
      dependants: new Set<string>(),
    }
  }

  async loadPluginManagerFor() {
    return this.resolveConfig()
  }

  async checkImports() {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createTestableRepo(
  textDocs: Map<string, TextDocument>,
  atscriptDocs: Map<string, AtscriptDoc>
) {
  const { handlers, connection } = createMockConnection()
  const documents = createMockDocuments(textDocs)
  const repo = new TestableRepo(connection as any, documents as any)
  repo.testDocs = atscriptDocs
  for (const [uri, doc] of atscriptDocs) {
    ;(repo as any).atscripts.set(uri, Promise.resolve(doc))
  }
  return { repo, handlers, connection }
}

function singleDocRepo(uri: string, source: string, config?: TAtscriptDocConfig) {
  const textDoc = td(uri, source)
  const doc = createDoc(uri, source, config)
  return {
    ...createTestableRepo(new Map([[uri, textDoc]]), new Map([[uri, doc]])),
    textDoc,
    doc,
  }
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('helper methods', () => {
  it('propsToCompletionItems maps props correctly and returns undefined for undefined', () => {
    const doc = createDoc('file:///test.as', 'interface User {\n  name: string\n}')
    const { repo } = singleDocRepo('file:///test.as', '')
    const iface = doc.nodes.find(n => n.entity === 'interface')! as SemanticInterfaceNode
    const props = Array.from(iface.props.values())
    const items = repo.propsToCompletionItems(props)
    expect(items).toBeDefined()
    expect(items!.length).toBe(1)
    expect(items![0].label).toBe('name')
    expect(items![0].kind).toBe(CompletionItemKind.Property)
    expect(repo.propsToCompletionItems(undefined)).toBeUndefined()
  })
})

describe('go-to-definition', () => {
  it('jumps to local type definition', () => {
    // Line 0: "type MyType = string"    MyType at chars 5-11
    // Line 1: "interface I { p: MyType }" MyType ref at chars 17-23
    const doc = createDoc('file:///test.as', 'type MyType = string\ninterface I { p: MyType }')
    const result = doc.getToDefinitionAt(1, 18)
    expect(result).toBeDefined()
    expect(result![0]).toEqual(
      expect.objectContaining({
        targetUri: 'file:///test.as',
        targetRange: expect.objectContaining({
          start: { line: 0, character: 5 },
        }),
      })
    )
  })

  it('jumps to cross-file import definition', () => {
    const doc1 = createDoc('file:///home/file1.as', 'export type Shared = string')
    const doc2 = createDoc(
      'file:///home/file2.as',
      "import { Shared } from './file1'\ntype T = Shared"
    )
    doc2.updateDependencies([doc1])
    // Line 1: "type T = Shared"  Shared ref at char 9
    const result = doc2.getToDefinitionAt(1, 10)
    expect(result).toBeDefined()
    expect(result![0]).toEqual(
      expect.objectContaining({
        targetUri: 'file:///home/file1.as',
      })
    )
  })

  it('jumps to nested prop via ref chain', () => {
    // Line 0: "interface I { prop: { nested: string } }"
    // Line 1: "interface I2 { p: I.prop.nested }"
    const doc = createDoc(
      'file:///test.as',
      'interface I { prop: { nested: string } }\ninterface I2 { p: I.prop.nested }'
    )
    // 'nested' starts at char 25 in line 1
    const result = doc.getToDefinitionAt(1, 26)
    expect(result).toBeDefined()
    expect(result![0]).toEqual(
      expect.objectContaining({
        targetUri: 'file:///test.as',
      })
    )
  })

  it('returns undefined for non-.as file', async () => {
    const { handlers } = singleDocRepo('file:///test.as', 'type T = string')
    const result = await handlers.onDefinition!({
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 0, character: 0 },
    })
    expect(result).toBeUndefined()
  })
})

describe('find references', () => {
  it('finds local references', () => {
    // Line 0: "type MyType = string"
    // Line 1: "interface I { p1: MyType; p2: MyType }"
    const doc = createDoc(
      'file:///test.as',
      'type MyType = string\ninterface I { p1: MyType; p2: MyType }'
    )
    const defToken = doc.registry.definitions.get('MyType')!
    const refs = doc.usageListFor(defToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBe(2)
  })

  it('finds cross-file references', () => {
    const doc1 = createDoc('file:///home/file1.as', 'export type Shared = string')
    const doc2 = createDoc(
      'file:///home/file2.as',
      "import { Shared } from './file1'\ntype T = Shared\ninterface I { p: Shared }"
    )
    doc2.updateDependencies([doc1])
    const defToken = doc1.registry.definitions.get('Shared')!
    const refs = doc1.usageListFor(defToken)
    // doc2 references Shared 3 times (import + type T + interface prop)
    expect(refs!.length).toBe(3)
  })

  it('resolves references from usage token', () => {
    const doc = createDoc('file:///test.as', 'type MyType = string\ntype T = MyType')
    const refToken = doc.referred.find(t => t.text === 'MyType')!
    const refs = doc.usageListFor(refToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBeGreaterThanOrEqual(1)
  })

  it('finds prop references via ref chain (e.g., Product.description)', () => {
    const source = 'interface Product {\n  description: string\n}\ntype Test = Product.description'
    const doc = createDoc('file:///test.as', source)
    // Line 1, char 2 = the 'description' prop identifier inside the interface
    const propToken = doc.tokensIndex.at(1, 2)!
    expect(propToken).toBeDefined()
    expect(propToken.text).toBe('description')
    const refs = doc.usageListFor(propToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBe(1)
    expect(refs![0].token.text).toBe('description')
    // The reference should point to the chain token on line 3
    expect(refs![0].range.start.line).toBe(3)
  })

  it('finds prop references in annotate block entries', () => {
    const source = [
      'interface Product {',
      '  description: string',
      '}',
      'annotate Product {',
      '  @meta.label "Desc"',
      '  description',
      '}',
    ].join('\n')
    const doc = createDoc('file:///test.as', source)
    const propToken = doc.tokensIndex.at(1, 2)!
    expect(propToken.text).toBe('description')
    const refs = doc.usageListFor(propToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBe(1)
    expect(refs![0].range.start.line).toBe(5)
  })

  it('finds prop references across files via ref chain', () => {
    const source1 = 'export interface Product {\n  description: string\n}'
    const source2 = "import { Product } from './file1'\ntype Test = Product.description"
    const doc1 = createDoc('file:///home/file1.as', source1)
    const doc2 = createDoc('file:///home/file2.as', source2)
    doc2.updateDependencies([doc1])
    const propToken = doc1.tokensIndex.at(1, 2)!
    expect(propToken.text).toBe('description')
    const refs = doc1.usageListFor(propToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBe(1)
    expect(refs![0].uri).toBe('file:///home/file2.as')
    expect(refs![0].token.text).toBe('description')
  })

  it('finds prop references from both ref chains and annotate entries', () => {
    const source = [
      'interface Product {',
      '  description: string',
      '}',
      'type Test = Product.description',
      'annotate Product {',
      '  @meta.label "Desc"',
      '  description',
      '}',
    ].join('\n')
    const doc = createDoc('file:///test.as', source)
    const propToken = doc.tokensIndex.at(1, 2)!
    expect(propToken.text).toBe('description')
    const refs = doc.usageListFor(propToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBe(2)
  })

  it('finds prop references in a complex interface with annotations and optional props', () => {
    const source = [
      'export interface Product {',
      '  @meta.id',
      '  id: number',
      '  name: string',
      '  description?: string',
      '  price: number',
      '}',
      'type Test = Product.description',
      'annotate Product {',
      '  @meta.description "test"',
      '  description',
      '}',
    ].join('\n')
    const doc = createDoc('file:///test.as', source)
    // 'description' is on line 4 (0-indexed), after 2 spaces
    const propToken = doc.tokensIndex.at(4, 2)!
    expect(propToken).toBeDefined()
    expect(propToken.text).toBe('description')
    const refs = doc.usageListFor(propToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBe(2)
  })
})

describe('rename', () => {
  it('renames a local type across definition and references', async () => {
    const uri = 'file:///test.as'
    const source = 'type MyType = string\ninterface I { p: MyType }'
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onRenameRequest!({
      textDocument: { uri },
      position: { line: 0, character: 6 },
      newName: 'Renamed',
    })
    expect(result).toBeDefined()
    expect(result.changes[uri].length).toBeGreaterThanOrEqual(2)
    expect(result.changes[uri].every((e: any) => e.newText === 'Renamed')).toBe(true)
  })

  it('renames across files', async () => {
    const uri1 = 'file:///home/file1.as'
    const uri2 = 'file:///home/file2.as'
    const source1 = 'export type Shared = string'
    const source2 = "import { Shared } from './file1'\ntype T = Shared"
    const doc1 = createDoc(uri1, source1)
    const doc2 = createDoc(uri2, source2)
    doc2.updateDependencies([doc1])
    const { handlers } = createTestableRepo(
      new Map([
        [uri1, td(uri1, source1)],
        [uri2, td(uri2, source2)],
      ]),
      new Map([
        [uri1, doc1],
        [uri2, doc2],
      ])
    )
    const result = await handlers.onRenameRequest!({
      textDocument: { uri: uri1 },
      position: { line: 0, character: 13 },
      newName: 'NewName',
    })
    expect(result).toBeDefined()
    expect(result.changes).toHaveProperty(uri1)
    expect(result.changes).toHaveProperty(uri2)
  })

  it('returns null when cursor is on whitespace', async () => {
    const uri = 'file:///test.as'
    const { handlers } = singleDocRepo(uri, 'type MyType = string')
    const result = await handlers.onRenameRequest!({
      textDocument: { uri },
      position: { line: 0, character: 4 }, // space between 'type' and 'MyType'
      newName: 'X',
    })
    expect(result).toBeNull()
  })
})

describe('completions', () => {
  it('completes and diagnoses a recursive intersection', async () => {
    const uri = 'file:///test.as'
    const source = [
      'export interface D {\n  d?: string\n}',
      'export interface Self {\n  s: string\n  next?: Self & D\n}',
      'annotate Self {\n  next.\n}',
    ].join('\n')
    const { handlers, connection, repo } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 8, character: 7 },
    })
    expect(result.map((i: any) => i.label)).toEqual(expect.arrayContaining(['s', 'next', 'd']))
    await repo.checkDoc(await repo.openDocument(uri))
    expect(connection.sendDiagnostics).toHaveBeenCalled()
  })

  it('completes two levels through an intersection-typed prop', async () => {
    const uri = 'file:///test.as'
    const source = [
      'export interface D {\n  d?: string\n}',
      'export interface Self {\n  s: string\n  next?: Self & D\n}',
      'annotate Self {\n  next.next.\n}',
      'export type Deep = Self.next.next.d',
    ].join('\n')
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 8, character: 12 },
    })
    expect((result ?? []).map((i: any) => i.label)).toEqual(
      expect.arrayContaining(['s', 'next', 'd'])
    )
    // A chain reference through it resolves (go to definition of `d`).
    const doc = createDoc(uri, source)
    const definition = doc.getToDefinitionAt(10, 34)
    expect(definition?.[0]?.targetRange.start.line).toBe(1)
    expect(doc.unwindType('Self', ['next', 'next', 'd'])?.def).toBeDefined()
  })

  it('suggests top-level keywords at empty line', async () => {
    const uri = 'file:///test.as'
    const { handlers } = singleDocRepo(uri, '')
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 0, character: 0 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('import')
    expect(labels).toContain('export')
    expect(labels).toContain('annotate')
    expect(labels).toContain('interface')
    expect(labels).toContain('type')
  })

  it('suggests keywords after export', async () => {
    const uri = 'file:///test.as'
    const source = 'export '
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 0, character: 7 },
    })
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('annotate')
    expect(labels).toContain('interface')
    expect(labels).toContain('type')
    expect(labels).not.toContain('import')
  })

  it('suggests extends after interface name', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User '
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 0, character: 15 },
    })
    expect(result).toBeDefined()
    expect(result.map((i: any) => i.label)).toContain('extends')
  })

  it('suggests type names (no primitives) after extends', async () => {
    const uri = 'file:///test.as'
    const source = 'interface Base { name: string }\ninterface User extends '
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 1, character: 23 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('Base')
    // includePrimitives=false — primitives should not appear as keyword-kind items
    const primitiveItems = result.filter((i: any) => i.kind === CompletionItemKind.Keyword)
    expect(primitiveItems).toHaveLength(0)
  })

  it('suggests type names (no primitives) after annotate keyword', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User { name: string }\nannotate '
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 1, character: 9 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('User')
    expect(labels).not.toContain('string')
  })

  it('suggests types and primitives in type position after colon', async () => {
    const uri = 'file:///test.as'
    const source = 'type MyType = string\ninterface I {\n  name: \n}'
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 2, character: 8 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    // Should include declared types
    expect(labels).toContain('MyType')
    // Should include primitives
    expect(labels).toContain('string')
    expect(labels).toContain('number')
  })

  it('suggests exports from target in import block', async () => {
    const uri1 = 'file:///home/file1.as'
    const uri2 = 'file:///home/file2.as'
    const source1 = 'export type TypeA = string\nexport interface IFaceB { prop: string }'
    const source2 = "import {  } from './file1'"
    const doc1 = createDoc(uri1, source1)
    const doc2 = createDoc(uri2, source2)
    doc2.updateDependencies([doc1])
    const { handlers } = createTestableRepo(
      new Map([
        [uri1, td(uri1, source1)],
        [uri2, td(uri2, source2)],
      ]),
      new Map([
        [uri1, doc1],
        [uri2, doc2],
      ])
    )
    // Position inside { } at char 9
    const result = await handlers.onCompletion!({
      textDocument: { uri: uri2 },
      position: { line: 0, character: 9 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('TypeA')
    expect(labels).toContain('IFaceB')
  })

  it('suggests target props in annotate block', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  name: string\n  age: number\n}\nannotate User {\n  \n}'
    const { handlers } = singleDocRepo(uri, source)
    // Position inside annotate body at line 5, char 2
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 5, character: 2 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('name')
    expect(labels).toContain('age')
  })

  it('suggests inherited props in annotate block of an extending interface', async () => {
    const uri = 'file:///test.as'
    const source = [
      'interface Credentials {',
      '  username: string',
      '  password: string',
      '}',
      'interface ArbacCredentials extends Credentials {',
      '  roles: string[]',
      '}',
      'annotate ArbacCredentials {',
      '  ',
      '}',
    ].join('\n')
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 8, character: 2 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('roles')
    expect(labels).toContain('username')
    expect(labels).toContain('password')
  })

  it('suggests inherited prop names inside the body of an extending interface', async () => {
    const uri = 'file:///test.as'
    const source = [
      'interface Credentials {',
      '  username: string',
      '  password: string',
      '}',
      'interface ArbacCredentials extends Credentials {',
      '  roles: string[]',
      '}',
      'interface AppUser extends ArbacCredentials {',
      '  ',
      '}',
    ].join('\n')
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 8, character: 2 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('roles')
    expect(labels).toContain('username')
    expect(labels).toContain('password')
  })

  it('suggests nested props in annotate block chain', async () => {
    const uri = 'file:///test.as'
    const source =
      'interface User {\n  address: { street: string; city: string }\n}\nannotate User {\n  address.\n}'
    const { handlers } = singleDocRepo(uri, source)
    // Position after "address." — the dot at line 4
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 4, character: 10 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('street')
    expect(labels).toContain('city')
  })

  it('suggests annotation names after @expect.', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  @expect.\n  name: string\n}'
    const { handlers } = singleDocRepo(uri, source)
    // Position after "@expect." at line 1
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 1, character: 10 },
    })
    expect(result).toBeDefined()
    const labels = result.map((i: any) => i.label)
    expect(labels).toContain('min')
    expect(labels).toContain('pattern')
  })

  it('returns undefined for non-.as file', async () => {
    const { handlers } = singleDocRepo('file:///test.as', '')
    const result = await handlers.onCompletion!({
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 0, character: 0 },
    })
    expect(result).toBeUndefined()
  })
})

describe('expr and order arguments', () => {
  const scope = { allowedTypes: ['Issue'], unqualifiedTarget: 'Issue' }
  const exprConfig: TAtscriptDocConfig = {
    primitives,
    annotations: {
      ...annotations,
      x: {
        calc: new AnnotationSpec({
          argument: { name: 'expression', type: 'expr', fieldScope: () => scope },
        }),
        sort: new AnnotationSpec({
          argument: { name: 'order', type: 'order', fieldScope: () => scope },
        }),
      },
    },
  }
  const prefix = 'interface Issue {\n  severity: number\n  raisedAt: number\n}\ninterface Q {\n'

  async function complete(line: string) {
    const uri = 'file:///expr.as'
    const source = `${prefix}${line}\n  v: number\n}`
    const { handlers } = singleDocRepo(uri, source, exprConfig)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 5, character: line.length - 1 },
    })
    return (result ?? []).map((i: any) => i.label)
  }

  it('offers fields and coalesce at an expr operand position', async () => {
    const labels = await complete('  @x.calc `severity * `')
    expect(labels).toContain('severity')
    expect(labels).toContain('raisedAt')
    expect(labels).toContain('coalesce')
    expect(labels).toContain('Issue')
  })

  it('offers arithmetic operators after an expr operand', async () => {
    const labels = await complete('  @x.calc `severity `')
    expect(labels).toEqual(['+', '-', '*', '/'])
  })

  it('offers fields at an order key position and directions after a key', async () => {
    expect(await complete('  @x.sort `raisedAt desc, `')).toContain('severity')
    expect(await complete('  @x.sort `raisedAt `')).toEqual(['asc', 'desc', ','])
    expect(await complete('  @x.sort `raisedAt desc `')).toEqual([','])
  })

  it('renames a field across expr leaves and order keys', async () => {
    const uri = 'file:///expr.as'
    const source = `${prefix}  @x.calc \`severity * 2\`\n  @x.sort \`severity desc\`\n  v: number\n}`
    const { handlers } = singleDocRepo(uri, source, exprConfig)
    const result = await handlers.onRenameRequest!({
      textDocument: { uri },
      position: { line: 1, character: 3 },
      newName: 'level',
    })
    const edits = result.changes[uri].map(
      (e: any) => `${e.range.start.line}:${e.range.start.character}`
    )
    expect(edits.sort()).toEqual(['1:2', '5:11', '6:11'])
  })
})

describe('hover', () => {
  it('shows phantom label on phantom type reference', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  tag: phantom\n}'
    const { handlers } = singleDocRepo(uri, source)
    // 'phantom' at line 1, starts at char 7
    const result = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 1, character: 8 },
    })
    expect(result).toBeDefined()
    expect(result.contents.value).toContain('phantom')
  })

  it('shows container label on container type reference', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  action: ui\n}'
    const { handlers } = singleDocRepo(uri, source)
    // 'ui' at line 1, starts at char 10
    const result = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 1, character: 10 },
    })
    expect(result).toBeDefined()
    expect(result.contents.value).toContain('container')
  })

  it('shows annotation docs on annotation name hover', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  @meta.label "Name"\n  name: string\n}'
    const { handlers } = singleDocRepo(uri, source)
    // '@meta.label' at line 1, starts at char 2
    const result = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 1, character: 3 },
    })
    expect(result).toBeDefined()
    expect(result.contents.value).toContain('label')
  })

  it('shows argument docs on annotation argument hover', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  @expect.min 5\n  age: number\n}'
    const { handlers } = singleDocRepo(uri, source)
    // '5' at line 1, char 14
    const result = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 1, character: 14 },
    })
    expect(result).toBeDefined()
    expect(result.contents.kind).toBe('markdown')
  })
})

describe('type-guarded annotations on nullable fields', () => {
  // The built-in annotation specs and primitives (incl. `null`), as a real project sees them.
  let builtIns: TAtscriptDocConfig
  beforeAll(async () => {
    builtIns = await new PluginManager({ unknownAnnotation: 'allow' }).getDocConfig()
  })

  it('reports no target-type error for number | null and a readable one for mixed unions', async () => {
    const uri = 'file:///test.as'
    const source =
      'export interface User {\n  @expect.min 0\n  age: number | null\n  @expect.min 0\n  bad: number | string\n}'
    const { repo, connection, doc } = singleDocRepo(uri, source, builtIns)
    await repo.checkDoc(doc)
    const { diagnostics } = connection.sendDiagnostics.mock.calls.at(-1)![0]
    expect(diagnostics.map((d: any) => [d.range.start.line, d.message])).toEqual([
      [3, 'Expected type is (number), got union (number | string)'],
    ])
  })

  it('mentions nullable fields in the annotation hover', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  @expect.min 0\n  age: number | null\n}'
    const { handlers } = singleDocRepo(uri, source, builtIns)
    const result = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 1, character: 4 },
    })
    expect(result.contents.value).toContain('nullable field')
  })

  it('offers, hovers and signs @expect.exclusiveMin / exclusiveMax from the built-in specs', async () => {
    const uri = 'file:///test.as'
    const source =
      'interface User {\n  @expect.exclusiveMin 0\n  @expect.\n  ratio: number | null\n}'
    const { handlers } = singleDocRepo(uri, source, builtIns)
    const completion = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 2, character: 10 },
    })
    const labels = completion.map((i: any) => i.label)
    expect(labels).toContain('exclusiveMin')
    expect(labels).toContain('exclusiveMax')
    const hover = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 1, character: 12 },
    })
    expect(hover.contents.value).toContain('strictly greater than')
    const sig = await handlers.onSignatureHelp!({
      textDocument: { uri },
      position: { line: 1, character: 23 },
    })
    expect(sig.signatures[0].label).toContain('exclusiveMinValue')
  })
})

describe('built-in @emit annotations', () => {
  let builtIns: TAtscriptDocConfig
  beforeAll(async () => {
    builtIns = await new PluginManager({ unknownAnnotation: 'allow' }).getDocConfig()
  })

  it('offers and hovers @emit.compiledValidator from the built-in specs', async () => {
    const uri = 'file:///test.as'
    const source = '@emit.compiledValidator\n@emit.\ninterface User {\n  name: string\n}'
    const { handlers } = singleDocRepo(uri, source, builtIns)
    const completion = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 1, character: 6 },
    })
    const labels = completion.map((i: any) => i.label)
    expect(labels).toContain('compiledValidator')
    expect(labels).toContain('jsonSchema')
    const hover = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 0, character: 10 },
    })
    expect(hover.contents.value).toContain('compiled validator check')
  })
})

describe('signature help', () => {
  it('returns signature for annotation with args', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  @expect.min 5\n  age: number\n}'
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onSignatureHelp!({
      textDocument: { uri },
      position: { line: 1, character: 14 },
    })
    expect(result).toBeDefined()
    expect(result.signatures).toHaveLength(1)
    expect(result.signatures[0].label).toContain('minValue')
    expect(result.signatures[0].parameters!.length).toBeGreaterThanOrEqual(1)
  })

  it('returns undefined for non-annotation position', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  name: string\n}'
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onSignatureHelp!({
      textDocument: { uri },
      position: { line: 1, character: 3 },
    })
    expect(result).toBeUndefined()
  })
})

describe('semantic tokens', () => {
  it('marks phantom type reference as semantic token', async () => {
    const uri = 'file:///test.as'
    const source = 'type T = phantom'
    const { repo } = singleDocRepo(uri, source)
    const result = await repo.provideSemanticTokens(uri)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('marks interface prop with phantom type', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  tag: phantom\n}'
    const { repo } = singleDocRepo(uri, source)
    const result = await repo.provideSemanticTokens(uri)
    // Should have tokens for both 'tag' prop name and 'phantom' ref
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('marks annotate block entry targeting phantom prop', async () => {
    const uri = 'file:///test.as'
    const source =
      'interface User {\n  tag: phantom\n  name: string\n}\nannotate User {\n  tag\n  name\n}'
    const { repo } = singleDocRepo(uri, source)
    const result = await repo.provideSemanticTokens(uri)
    // 'tag' entry in annotate block should be marked, 'name' should not contribute phantom tokens
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('returns empty tokens for non-phantom types', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  name: string\n  age: number\n}'
    const { repo } = singleDocRepo(uri, source)
    const result = await repo.provideSemanticTokens(uri)
    expect(result.data).toEqual([])
  })
})

describe('queue and debounce', () => {
  it('addToChangeQueue deduplicates entries', () => {
    const uri = 'file:///test.as'
    const { repo } = singleDocRepo(uri, 'type T = string')
    repo.addToChangeQueue(uri)
    repo.addToChangeQueue(uri)
    expect((repo as any).changeQueue.filter((id: string) => id === uri)).toHaveLength(1)
  })

  it('addToRevalidateQueue deduplicates entries', () => {
    const uri = 'file:///test.as'
    const { repo } = singleDocRepo(uri, 'type T = string')
    repo.addToRevalidateQueue(uri)
    repo.addToRevalidateQueue(uri)
    expect((repo as any).revalidateQueue.filter((id: string) => id === uri)).toHaveLength(1)
  })

  it('runChecks keeps going (and returns to idle) when a check throws', async () => {
    const uri = 'file:///test.as'
    const { repo, connection } = singleDocRepo(uri, 'type T = string')
    repo.checksDelay = 0
    const checkDoc = vi.spyOn(repo, 'checkDoc').mockRejectedValueOnce(new Error('boom'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      repo.addToChangeQueue(uri)
      await repo.currentCheck
      expect((repo as any).idle).toBe(true)
      repo.addToChangeQueue(uri)
      await repo.currentCheck
      expect(checkDoc).toHaveBeenCalledTimes(2)
      expect(connection.sendDiagnostics).toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  it('a failed re-parse keeps the document marked changed (re-parsed by the next check)', async () => {
    const uri = 'file:///test.as'
    const { repo } = singleDocRepo(uri, 'type T = string')
    repo.checksDelay = 0
    const doc = await repo.openDocument(uri)
    const update = vi.spyOn(doc, 'update').mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      repo.addToChangeQueue(uri)
      await repo.currentCheck
      expect((repo as any).changedSet.has(uri)).toBe(true)
      repo.addToChangeQueue(uri)
      await repo.currentCheck
      expect(update).toHaveBeenCalledTimes(2)
      expect((repo as any).changedSet.has(uri)).toBe(false)
    } finally {
      error.mockRestore()
    }
  })

  it('a changed document whose check throws still re-checks its dependants', async () => {
    const [aUri, bUri] = ['file:///a.as', 'file:///b.as']
    const a = createDoc(aUri, 'export interface A {\n  id: string\n}')
    const b = createDoc(bUri, 'import { A } from "./a"\n\nexport interface B extends A {}')
    b.updateDependencies([a])
    const { repo } = createTestableRepo(
      new Map(),
      new Map([
        [aUri, a],
        [bUri, b],
      ])
    )
    vi.spyOn(a, 'getDiagMessages').mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(repo.checkDoc(a, true)).rejects.toThrow('boom')
    expect((repo as any).revalidateQueue).toEqual([bUri])
  })

  it('a change re-checks the documents importing it directly or not', () => {
    const [aUri, bUri, cUri] = ['file:///a.as', 'file:///b.as', 'file:///c.as']
    const a = createDoc(aUri, 'export interface A {\n  id: string\n}')
    const b = createDoc(bUri, 'import { A } from "./a"\n\nexport interface B extends A {}')
    const c = createDoc(cUri, 'import { B } from "./b"\n\nexport interface C extends B {}')
    b.updateDependencies([a])
    c.updateDependencies([b])
    const { repo } = createTestableRepo(
      new Map(),
      new Map([
        [aUri, a],
        [bUri, b],
        [cUri, c],
      ])
    )
    repo.revalidateDependants(a)
    expect((repo as any).revalidateQueue).toEqual([bUri, cUri])
  })

  describe('a change re-checks every importer, directly or not', () => {
    /** Files a ← b ← c (c imports b imports a), checked once; `a` then gets `changed`. */
    function chain(sources: [string, string, string], changed: string) {
      const uris = ['a', 'b', 'c'].map(n => `file:///p/${n}.as`)
      const [a, b, c] = sources.map((text, i) => createDoc(uris[i], text))
      b.updateDependencies([a])
      c.updateDependencies([b])
      const { repo } = createTestableRepo(
        new Map(),
        new Map(uris.map((uri, i) => [uri, [a, b, c][i]]))
      )
      const before = c.getDiagMessages().map(m => m.message)
      a.update(changed)
      repo.revalidateDependants(a)
      expect((repo as any).revalidateQueue).toEqual([uris[1], uris[2]])
      return { before, after: c.getDiagMessages().map(m => m.message) }
    }

    it('a chained reference into a renamed member', () => {
      const { before, after } = chain(
        [
          'export interface A {\n  x: { y: string }\n}',
          'import { A } from "./a"\n\nexport interface B {\n  a: A\n}',
          'import { B } from "./b"\n\nexport type T = B.a.x.y',
        ],
        'export interface A {\n  x: { z: string }\n}'
      )
      expect(before).toEqual([])
      expect(after).toEqual([expect.stringContaining('"y"')])
    })

    it('an annotation through an alias chain whose type changed', () => {
      const { before, after } = chain(
        [
          'export type S = string',
          'import { S } from "./a"\n\nexport type S2 = S',
          'import { S2 } from "./b"\n\nexport interface C {\n  @expect.pattern "x"\n  s: S2\n}',
        ],
        'export type S = number'
      )
      expect(before).toEqual([])
      expect(after).not.toEqual([])
    })

    it('a type no longer exported, inlined through a merge', () => {
      // (a union member merged with each branch: the branches' types are shared, imported)
      const { before, after } = chain(
        [
          'export interface H {\n  h: string\n}\n\nexport type HU = H | { k?: string }',
          'import { HU } from "./a"\n\nexport type BU = HU',
          'import { BU } from "./b"\n\nexport type C = BU & { e?: string }',
        ],
        'interface H {\n  h: string\n}\n\nexport type HU = H | { k?: string }'
      )
      // (the merge is built from c.as's operands — references —: C never names H, so H no
      // longer exported is not an error of c.as; `annotate-referenced.spec.ts` "a merge through
      // an alias of a union whose member is not exported" loads and validates C)
      expect(before).toEqual([])
      expect(after).toEqual([])
    })
  })

  it('runChecks processes queue and sends diagnostics', async () => {
    const uri = 'file:///test.as'
    const { repo, connection } = singleDocRepo(uri, 'type T = string')
    repo.checksDelay = 0
    repo.addToChangeQueue(uri)
    await repo.currentCheck
    expect(connection.sendDiagnostics).toHaveBeenCalled()
  })
})

describe('watched .as file changes', () => {
  const aUri = 'file:///a.as'
  const bUri = 'file:///b.as'
  const sources: Record<string, string> = {
    [aUri]: 'import { B } from "./b"\n\nexport interface A {\n  b: B\n}',
    [bUri]: 'export interface B {\n  id: string\n}',
  }

  /** `a.as` imports `b.as`; `openInEditor` lists the uris backed by a text document. */
  function importerRepo(openInEditor: string[]) {
    const a = createDoc(aUri, sources[aUri])
    const b = createDoc(bUri, sources[bUri])
    a.updateDependencies([b])
    const textDocs = new Map(openInEditor.map(uri => [uri, td(uri, sources[uri])] as const))
    const atscriptDocs = new Map([
      [aUri, a],
      [bUri, b],
    ])
    return { ...createTestableRepo(textDocs, atscriptDocs), a, b }
  }

  it('closes a changed file that is not open in the editor and re-checks it and its dependants', async () => {
    const { repo, connection, a, b } = importerRepo([aUri])
    repo.checksDelay = 0

    await repo.onAsFileChanged(bUri)

    expect((repo as any).atscripts.has(bUri)).toBe(false)
    expect((repo as any).atscripts.has(aUri)).toBe(true)
    expect((repo as any).revalidateQueue).toEqual([aUri])
    // (the changed file itself too: read again from disk, checked as changed)
    expect((repo as any).changeQueue).toEqual([bUri])
    // The dependant keeps its wiring until its own check re-opens the import.
    expect(a.dependencies.has(b)).toBe(true)

    await repo.currentCheck
    expect(connection.sendDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ uri: aUri }))
  })

  it('clears the problems of a deleted file that is not open, and re-checks its dependants', async () => {
    const { repo, connection } = importerRepo([aUri])
    repo.checksDelay = 0
    await repo.onAsFileChanged(bUri, true)
    expect((repo as any).revalidateQueue).toEqual([aUri])
    expect(connection.sendDiagnostics).toHaveBeenCalledWith({ uri: bUri, diagnostics: [] })
  })

  it('leaves a file that is open in the editor alone', async () => {
    const { repo } = importerRepo([aUri, bUri])
    await repo.onAsFileChanged(bUri)
    expect((repo as any).atscripts.has(bUri)).toBe(true)
    expect((repo as any).revalidateQueue).toEqual([])
  })

  it('checks a file the repo never opened (created), and no other', async () => {
    const { repo } = importerRepo([aUri])
    await repo.onAsFileChanged('file:///c.as')
    expect((repo as any).atscripts.size).toBe(2)
    expect((repo as any).revalidateQueue).toEqual([])
    expect((repo as any).changeQueue).toEqual(['file:///c.as'])
  })

  it('drops a cached open that failed, and checks the file again', async () => {
    const { repo } = importerRepo([aUri])
    const cUri = 'file:///c.as'
    ;(repo as any).atscripts.set(cUri, Promise.reject(new Error('Document not found')))
    await repo.onAsFileChanged(cUri)
    expect((repo as any).atscripts.has(cUri)).toBe(false)
    expect((repo as any).changeQueue).toEqual([cUri])
  })

  it('is driven by onDidChangeWatchedFiles for .as uris only', async () => {
    const { repo, handlers } = importerRepo([aUri])
    const spy = vi.spyOn(repo, 'onAsFileChanged').mockResolvedValue(undefined)
    await handlers.onDidChangeWatchedFiles!({
      changes: [
        { uri: bUri, type: 2 },
        { uri: 'file:///notes.txt', type: 2 },
      ],
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(bUri, false)
  })
})

// ---------------------------------------------------------------------------
// Plugin-owned LSP hooks (fieldScope / refFilter)
// ---------------------------------------------------------------------------

const labels = (r: any) => (r ?? []).map((i: any) => i.label)

/**
 * Sibling-scoped `fieldScope` hook: resolves the target type from the annotation's first
 * argument (a plain identifier), the way a plugin pairs `target` with `field` / `filter`.
 */
function siblingScope(allowed: (target: string) => string[]) {
  return (arg: Token) => {
    const target = getSiblingAnnotation(arg)?.args[0]?.text
    if (!target || !/^[A-Za-z_]\w*$/.test(target)) {
      return undefined
    }
    return { allowedTypes: allowed(target), unqualifiedTarget: target }
  }
}

/**
 * `valueScope` hook mirroring `@ui.literalLabel`: the candidates are the literals of the
 * union the annotated node declares (directly or through a type alias), each linked to
 * the const that declares it.
 */
function literalValues(annotationToken: Token, doc: AtscriptDoc): TValueCandidate[] | undefined {
  const host = doc.annotatedDefinition(annotationToken.parentNode as SemanticNode | undefined)
  let def = host?.def
  let declaring = host?.doc ?? doc
  if (def?.entity === 'ref') {
    const unwound = declaring.unwindType((def as any).id, (def as any).chain)
    if (!unwound) {
      return undefined
    }
    def = unwound.def
    declaring = unwound.doc
  }
  if (def?.entity !== 'group') {
    return undefined
  }
  return (def as any).unwrap().flatMap((item: SemanticNode) => {
    const token = item.entity === 'const' ? item.token('identifier') : undefined
    return token ? [{ value: token.text, definition: { doc: declaring, token } }] : []
  })
}

describe('plugin LSP hooks', () => {
  const refFilter = vi.fn(
    (decl: SemanticNode, _doc: AtscriptDoc) =>
      decl.annotations?.some(a => a.name === 'test.table') ?? false
  )
  /** `refFilter` of the binding target: an interface that is not an alias. */
  const isVhTarget = (decl: SemanticNode) =>
    decl.entity === 'interface' && !decl.annotations?.some(a => a.name === 'test.alias')
  /** Diagnostics hook: the target must pass the filter, the field must exist on it. */
  const validateVh = (token: Token, args: Token[], doc: AtscriptDoc) => {
    const messages: Array<{ message: string; severity: 1; range: Token['range'] }> = []
    const [targetArg, fieldArg] = args
    if (!targetArg) {
      return messages
    }
    const owner = doc.getDeclarationOwnerNode(targetArg.text)
    if (!owner?.node || !isVhTarget(owner.node)) {
      messages.push({
        message: `'${targetArg.text}' must be an interface — a value-help dictionary.`,
        severity: 1,
        range: targetArg.range,
      })
      return messages
    }
    const props = (owner.node as SemanticInterfaceNode).props
    if (fieldArg && !props.has(fieldArg.text)) {
      messages.push({
        message: `Field '${fieldArg.text}' does not exist on '${targetArg.text}'`,
        severity: 1,
        range: fieldArg.range,
      })
    }
    return messages
  }
  const hookConfig: TAtscriptDocConfig = {
    primitives,
    annotations: {
      test: {
        table: new AnnotationSpec({ nodeType: ['interface'] }),
        target: new AnnotationSpec({
          argument: { name: 'target', type: 'ref', refFilter },
        }),
        anyref: new AnnotationSpec({ argument: { name: 'target', type: 'ref' } }),
        field: new AnnotationSpec({
          argument: {
            name: 'field',
            type: 'string',
            fieldScope: () => ({ allowedTypes: [], unqualifiedTarget: 'Order' }),
          },
        }),
        where: new AnnotationSpec({
          argument: {
            name: 'filter',
            type: 'query',
            fieldScope: () => ({ allowedTypes: ['Order', 'Customer'], unqualifiedTarget: 'Order' }),
          },
        }),
        alias: new AnnotationSpec({ nodeType: ['interface'] }),
        // Mirrors `@ui.literalLabel`: `value` is one of the literals of the annotated union
        lit: new AnnotationSpec({
          nodeType: ['prop', 'type'],
          multiple: true,
          argument: [
            { name: 'value', type: 'string', valueScope: literalValues },
            { name: 'label', type: 'string' },
          ],
        }),
        // Value-help style binding (mirrors `@ui.valueHelp`): a `ref` argument with a `refFilter`,
        // then a `string` field and a `query` filter both scoped by the sibling ref
        litNum: new AnnotationSpec({
          nodeType: ['prop', 'type'],
          argument: [
            {
              name: 'value',
              type: 'number',
              valueScope: () => [{ value: '10' }, { value: '25' }],
            },
          ],
        }),
        vh: new AnnotationSpec({
          description: 'Binds a field to a dictionary target.',
          nodeType: ['prop', 'type'],
          argument: [
            {
              name: 'target',
              type: 'ref',
              description: 'The dictionary interface. Not an alias.',
              refFilter: isVhTarget,
            },
            {
              name: 'field',
              type: 'string',
              description: 'Top-level scalar field of the target.',
              fieldScope: siblingScope(() => []),
            },
            {
              optional: true,
              name: 'filter',
              type: 'query',
              description: 'Static scope on the target.',
              fieldScope: siblingScope(target => [target]),
            },
          ],
          validate: validateVh,
        }),
      },
    } as any,
  }
  const types = `@test.table
interface Order {
  id: number
  amount: number
  address: {
    city: string
  }
}

interface Customer {
  name: string
}
`

  const uri = 'file:///hooks.as'

  function hookRepo(body: string) {
    const repo = singleDocRepo(uri, `${types}${body}`, hookConfig)
    const text = repo.textDoc.getText()
    /** Position right after `needle` (or `shift` chars into it) */
    const at = (needle: string, shift = needle.length) =>
      repo.textDoc.positionAt(text.indexOf(needle) + shift)
    return { ...repo, at }
  }

  it('completes the fields of a field-path string argument', async () => {
    const { handlers, at } = hookRepo(`interface Report {\n  @test.field 'am'\n  total: number\n}`)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: at(`'am`),
    })
    expect(result.map((i: any) => i.label)).toEqual(['id', 'amount', 'address'])
    expect(result[0]).toEqual(
      expect.objectContaining({ kind: CompletionItemKind.Property, detail: 'field of Order' })
    )
  })

  it('completes the next level of a dotted field path', async () => {
    const { handlers, at } = hookRepo(
      `interface Report {\n  @test.field 'address.ci'\n  city: string\n}`
    )
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: at(`'address.ci`),
    })
    expect(result.map((i: any) => i.label)).toEqual(['city'])
    expect(result[0].detail).toBe('field of Order.address')
  })

  it('filters ref argument completions with refFilter', async () => {
    const { handlers, doc, at } = hookRepo(`@test.target \ninterface Report {\n  total: number\n}`)
    refFilter.mockClear()
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: at('@test.target '),
    })
    expect(result.map((i: any) => i.label)).toEqual(['Order'])
    expect(refFilter).toHaveBeenCalledWith(expect.anything(), doc)
  })

  it('offers all declarations (no primitives) for a ref argument without refFilter', async () => {
    const { handlers, at } = hookRepo(`@test.anyref Cu\ninterface Report {\n  total: number\n}`)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: at('@test.anyref Cu'),
    })
    const labels = result.map((i: any) => i.label)
    expect(labels).toEqual(expect.arrayContaining(['Order', 'Customer', 'Report']))
    expect(labels).not.toContain('string')
  })

  it('offers no type names after a dot in a ref argument', async () => {
    const { handlers, at } = hookRepo(`@test.anyref Order.\ninterface Report {\n  total: number\n}`)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: at('@test.anyref Order.'),
    })
    expect(result?.map((i: any) => i.label) ?? []).not.toContain('Customer')
  })

  it('completes query fields through the fieldScope hook', async () => {
    const { handlers, at } = hookRepo(
      'interface Report {\n  @test.where `Customer.`\n  total: number\n}'
    )
    const typeStart = await handlers.onCompletion!({
      textDocument: { uri },
      position: at('@test.where `'),
    })
    expect(typeStart.map((i: any) => i.label)).toEqual(
      expect.arrayContaining(['Order', 'Customer', 'id', 'amount'])
    )
    const afterDot = await handlers.onCompletion!({
      textDocument: { uri },
      position: at('`Customer.'),
    })
    expect(afterDot.map((i: any) => i.label)).toEqual(['name'])
  })

  it('hovers a field-path string argument like the field it names', async () => {
    const { handlers, at } = hookRepo(
      `interface Report {\n  @test.field 'amount'\n  total: number\n}`
    )
    const result = await handlers.onHover!({
      textDocument: { uri },
      position: at(`'amount'`, 3),
    })
    expect(result.contents.value).toBe('Property of `Order`')
    expect(result.range).toEqual({
      start: at(`'amount'`, 1),
      end: at(`'amount'`, 7),
    })
  })

  it('renames a field together with its field-path string arguments', async () => {
    const { handlers, at } = hookRepo(
      `interface Report {\n  @test.field 'amount'\n  total: number\n}`
    )
    const result = await handlers.onRenameRequest!({
      textDocument: { uri },
      position: at(`'amount'`, 2),
      newName: 'sum',
    })
    const ranges = result.changes[uri].map((c: any) => c.range)
    expect(ranges).toEqual(
      expect.arrayContaining([
        { start: at(`'amount'`, 1), end: at(`'amount'`, 7) },
        { start: at('amount: number', 0), end: at('amount: number', 6) },
      ])
    )
    expect(ranges).toHaveLength(2)
  })

  it('renames from an intermediate segment of a dotted field path', async () => {
    const { handlers, at } = hookRepo(
      `interface Report {\n  @test.field 'address.city'\n  city: string\n}`
    )
    const result = await handlers.onRenameRequest!({
      textDocument: { uri },
      position: at(`'address.city'`, 3),
      newName: 'location',
    })
    const ranges = result.changes[uri].map((c: any) => c.range)
    expect(ranges).toEqual(
      expect.arrayContaining([
        { start: at(`'address.city'`, 1), end: at(`'address.city'`, 8) },
        { start: at('address: {', 0), end: at('address: {', 7) },
      ])
    )
    expect(ranges).toHaveLength(2)
  })
  describe('sibling-scoped annotation (ref + string field + query filter)', () => {
    it('completes the string field from the sibling ref target', async () => {
      const { handlers, at } = hookRepo(
        `interface Report {\n  @test.vh Order, 'am'\n  total: number\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`'am`),
      })
      expect(labels(result)).toEqual(['id', 'amount', 'address'])
      expect(result[0]).toEqual(
        expect.objectContaining({
          kind: CompletionItemKind.Property,
          detail: 'field of Order',
        })
      )
    })

    it('completes query fields of the sibling target; other types are out of scope', async () => {
      const { handlers, at } = hookRepo(
        "interface Report {\n  @test.vh Order, 'id', `Customer.`\n  total: number\n}"
      )
      const afterDot = await handlers.onCompletion!({
        textDocument: { uri },
        position: at('`Customer.'),
      })
      expect(labels(afterDot)).not.toContain('name')

      const bare = hookRepo("interface Report {\n  @test.vh Order, 'id', `am`\n  total: number\n}")
      const unqualified = await bare.handlers.onCompletion!({
        textDocument: { uri },
        position: bare.at('`am'),
      })
      expect(labels(unqualified)).toEqual(expect.arrayContaining(['id', 'amount']))
      expect(labels(unqualified)).not.toContain('name')
    })

    it('jumps from the ref argument to the interface, and from the field string to the prop', async () => {
      const { handlers, at } = hookRepo(
        `interface Report {\n  @test.vh Order, 'amount'\n  total: number\n}`
      )
      const toRef = await handlers.onDefinition!({
        textDocument: { uri },
        position: at('@test.vh Order', 10),
      })
      expect(toRef[0].targetUri).toBe(uri)
      expect(toRef[0].targetSelectionRange.start).toEqual(at('interface Order', 10))

      const toField = await handlers.onDefinition!({
        textDocument: { uri },
        position: at(`'amount'`, 3),
      })
      expect(toField[0].targetUri).toBe(uri)
      expect(toField[0].targetSelectionRange.start).toEqual(at('amount: number', 0))
    })

    it('hovers the field string as a property of the sibling target', async () => {
      const { handlers, at } = hookRepo(
        `interface Report {\n  @test.vh Order, 'amount'\n  total: number\n}`
      )
      const result = await handlers.onHover!({
        textDocument: { uri },
        position: at(`'amount'`, 3),
      })
      expect(result.contents.value).toBe('Property of `Order`')
    })

    it('renames a field in the string argument and in the unqualified query reference', async () => {
      const { handlers, at } = hookRepo(
        "interface Report {\n  @test.vh Order, 'amount', `amount > 5`\n  total: number\n}"
      )
      const result = await handlers.onRenameRequest!({
        textDocument: { uri },
        position: at(`'amount'`, 2),
        newName: 'sum',
      })
      const ranges = result.changes[uri].map((c: any) => c.range)
      expect(ranges).toEqual(
        expect.arrayContaining([
          { start: at(`'amount'`, 1), end: at(`'amount'`, 7) },
          { start: at('`amount', 1), end: at('`amount', 7) },
          { start: at('amount: number', 0), end: at('amount: number', 6) },
        ])
      )
      expect(ranges).toHaveLength(3)
    })

    it('gives no completion and does not throw when the sibling ref is missing', async () => {
      const { handlers, at } = hookRepo(`interface Report {\n  @test.vh\n  total: number\n}`)
      await expect(
        handlers.onCompletion!({
          textDocument: { uri },
          position: at('@test.vh'),
        })
      ).resolves.not.toThrow()
    })

    it('gives no field completion when the sibling ref is not an identifier', async () => {
      const { handlers, at } = hookRepo(
        `interface Report {\n  @test.vh 42, 'am'\n  total: number\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`'am`),
      })
      expect(labels(result)).not.toContain('amount')
    })

    it('gives no field completion when the sibling ref is an unknown type', async () => {
      const { handlers, at } = hookRepo(
        `interface Report {\n  @test.vh Nope, 'am'\n  total: number\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`'am`),
      })
      expect(labels(result)).not.toContain('amount')
    })

    it('works the same inside an annotate block entry', async () => {
      const { handlers, at } = hookRepo(
        `interface Report {\n  total: number\n}\nannotate Report {\n  @test.vh Order, 'am'\n  total\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.vh Order, 'am`),
      })
      expect(labels(result)).toEqual(['id', 'amount', 'address'])

      const hover = await handlers.onHover!({
        textDocument: { uri },
        position: at(`@test.vh Order, 'am`, `@test.vh Order, 'am`.length - 1),
      })
      expect(hover).toBeDefined()

      const toRef = await handlers.onDefinition!({
        textDocument: { uri },
        position: at('@test.vh Order', 10),
      })
      expect(toRef[0].targetSelectionRange.start).toEqual(at('interface Order', 10))
    })

    const decls = `@test.alias\ninterface OrderView {\n  id: number\n}\n\ntype Plain = string\n\n`

    it('completes only the targets the refFilter accepts (no alias, no type alias)', async () => {
      const { handlers, at } = hookRepo(
        `${decls}interface Report {\n  @test.vh \n  total: number\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at('@test.vh '),
      })
      expect(labels(result)).toEqual(expect.arrayContaining(['Order', 'Customer', 'Report']))
      expect(labels(result)).not.toContain('OrderView')
      expect(labels(result)).not.toContain('Plain')
    })

    it('hovers the annotation and the ref argument with their descriptions, and a filter field as a property', async () => {
      const { handlers, at } = hookRepo(
        `interface Report {\n  @test.vh Order, 'amount', \`amount > 5\`\n  total: number\n}`
      )
      const annotation = await handlers.onHover!({
        textDocument: { uri },
        position: at('@test.vh', 4),
      })
      expect(annotation.contents.value).toContain('Binds a field to a dictionary target.')

      const target = await handlers.onHover!({
        textDocument: { uri },
        position: at('@test.vh Order', 11),
      })
      expect(target.contents.value).toContain('The dictionary interface.')

      const filter = await handlers.onHover!({
        textDocument: { uri },
        position: at('amount > 5', 2),
      })
      // a query argument hovers like the target field it references
      expect(filter.contents.value).toBe('Property of `Order`')
    })

    it('reports a bad target and a bad field through the server diagnostics pipeline', async () => {
      const { repo, connection, doc } = hookRepo(
        `${decls}interface Report {\n  @test.vh OrderView, 'id'\n  a: number\n  @test.vh Order, 'nope'\n  b: number\n  @test.vh Order, 'amount'\n  c: number\n}`
      )
      await repo.checkDoc(doc)
      const { diagnostics } = connection.sendDiagnostics.mock.calls.at(-1)![0]
      const messages = diagnostics.map((d: any) => d.message)
      expect(messages).toContain("'OrderView' must be an interface — a value-help dictionary.")
      expect(messages).toContain("Field 'nope' does not exist on 'Order'")
      expect(messages.filter((m: string) => m.includes("'amount'"))).toEqual([])
    })

    it('reports hook diagnostics inside an annotate block without an unknown-property error', async () => {
      const { repo, connection, doc } = hookRepo(
        `${decls}interface Report {\n  a: number\n  b: number\n}\nannotate Report {\n  @test.vh OrderView, 'id'\n  a\n  @test.vh Order, 'amount'\n  b\n}`
      )
      await repo.checkDoc(doc)
      const { diagnostics } = connection.sendDiagnostics.mock.calls.at(-1)![0]
      const messages = diagnostics.map((d: any) => d.message)
      expect(messages).toContain("'OrderView' must be an interface — a value-help dictionary.")
      expect(messages.filter((m: string) => m.includes('Unknown property'))).toEqual([])
      expect(messages.filter((m: string) => m.includes("'amount'"))).toEqual([])
    })
  })
  it('checks a top-level annotation of an annotate block against the node type of its target', async () => {
    const { repo, connection, doc, textDoc } = hookRepo(
      `interface Tgt {\n  a: number\n}\ntype Shape = {\n  a: number\n}\n@test.table\nannotate Tgt {\n  a\n}\n@test.table\nannotate Shape {\n  a\n}\n@test.table\nexport annotate Tgt as TgtAlias {\n  a\n}\n@test.table\nannotate TgtAlias {\n  a\n}\n`
    )
    await repo.checkDoc(doc)
    const { diagnostics } = connection.sendDiagnostics.mock.calls.at(-1)![0]
    const text = textDoc.getText()
    const shapeLine = textDoc.positionAt(text.indexOf('@test.table\nannotate Shape')).line
    // (only the block of the type: `@test.table` applies to interfaces, the others' targets are)
    expect(
      diagnostics
        .filter((d: any) => d.message.includes('applies only to'))
        .map((d: any) => [d.range.start.line, d.message])
    ).toEqual([[shapeLine, '@test.table applies only to interface nodes.']])
  })
  describe('valueScope argument (values declared elsewhere in the document)', () => {
    const union = `type Status = 'open' | 'in_progress' | 'closed'\n`

    it('completes the literals of the annotated union, quoted', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  @test.lit 'op', 'Open'\n  status: 'open' | 'closed'\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`'op`),
      })
      expect(labels(result)).toEqual([`'open'`, `'closed'`])
      expect(result[0].kind).toBe(CompletionItemKind.Value)
    })

    it('completes through a type alias (declared in the same document)', async () => {
      const { handlers, at } = hookRepo(
        `${union}interface Ticket {\n  @test.lit 'x'\n  status: Status\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.lit 'x`),
      })
      expect(labels(result)).toEqual([`'open'`, `'in_progress'`, `'closed'`])
    })

    it('completes in an empty argument position, and not for the second (label) argument', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  @test.lit ''\n  status: 'a' | 'b'\n}`
      )
      const value = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.lit '`),
      })
      expect(labels(value)).toEqual([`'a'`, `'b'`])

      const second = hookRepo(`interface Ticket {\n  @test.lit 'a', 'La'\n  status: 'a' | 'b'\n}`)
      const label = await second.handlers.onCompletion!({
        textDocument: { uri },
        position: second.at(`'La`),
      })
      expect(labels(label)).not.toContain(`'a'`)
    })

    it('offers nothing when the annotated type is not a union', async () => {
      const { handlers, at } = hookRepo(`interface Ticket {\n  @test.lit 'x'\n  note: string\n}`)
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.lit 'x`),
      })
      expect(labels(result)).toEqual([])
    })

    it('jumps from the value argument to the literal it names', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  @test.lit 'closed', 'Done'\n  status: 'open' | 'closed'\n}`
      )
      const result = await handlers.onDefinition!({
        textDocument: { uri },
        position: at(`@test.lit 'closed`, 12),
      })
      expect(result).toHaveLength(1)
      expect(result[0].targetUri).toBe(uri)
      // lands on the `'closed'` literal of the union (the second occurrence), not on the prop
      expect(result[0].targetSelectionRange.start.line).toBe(at(`status: 'open' | 'closed'`).line)
      expect(result[0].targetSelectionRange.start.character).toBe(
        at(`status: 'open' | 'closed'`, `status: 'open' | `.length).character
      )
    })

    it('jumps through a type alias to the literal in its declaration', async () => {
      const { handlers, at } = hookRepo(
        `${union}interface Ticket {\n  @test.lit 'in_progress', 'WIP'\n  status: Status\n}`
      )
      const result = await handlers.onDefinition!({
        textDocument: { uri },
        position: at(`@test.lit 'in_progress`, 14),
      })
      expect(result[0].targetSelectionRange.start.line).toBe(at(`type Status`).line)
    })

    it('completes inside an annotate block entry, replacing the typed quotes (no doubling)', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  status: 'open' | 'closed'\n}\nannotate Ticket {\n  @test.lit 'op'\n  status\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.lit 'op`),
      })
      expect(labels(result)).toEqual([`'open'`, `'closed'`])
      // the edit replaces the whole `'op'` (both quotes), so accepting yields `'open'`
      expect(result[0].textEdit.newText).toBe(`'open'`)
      expect(result[0].textEdit.range.start).toEqual(at(`@test.lit '`, `@test.lit `.length))
      expect(result[0].textEdit.range.end).toEqual(at(`@test.lit 'op'`))
    })

    it('replaces the auto-closed quotes of an empty argument', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  @test.lit ''\n  status: 'a' | 'b'\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.lit '`),
      })
      expect(result[0].textEdit.newText).toBe(`'a'`)
      expect(result[0].textEdit.range.start).toEqual(at(`@test.lit `))
      expect(result[0].textEdit.range.end).toEqual(at(`@test.lit ''`))
    })

    it('keeps double quotes and sets filterText so the editor still matches the typed prefix', async () => {
      const typedPrefix = hookRepo(
        `interface Ticket {\n  @test.lit "op"\n  status: 'open' | 'closed'\n}`
      )
      const result = await typedPrefix.handlers.onCompletion!({
        textDocument: { uri },
        position: typedPrefix.at(`@test.lit "op`),
      })
      expect(labels(result)).toEqual([`"open"`, `"closed"`])
      expect(result[0].textEdit.newText).toBe(`"open"`)
      expect(result[0].filterText).toBe(`"open"`)
      expect(result[0].textEdit.range.start).toEqual(typedPrefix.at(`@test.lit `))
      expect(result[0].textEdit.range.end).toEqual(typedPrefix.at(`@test.lit "op"`))

      const empty = hookRepo(`interface Ticket {\n  @test.lit ""\n  status: 'a' | 'b'\n}`)
      const emptyResult = await empty.handlers.onCompletion!({
        textDocument: { uri },
        position: empty.at(`@test.lit "`),
      })
      expect(emptyResult[0].textEdit.newText).toBe(`"a"`)
      expect(emptyResult[0].filterText).toBe(`"a"`)
    })

    it('keeps single quotes with a matching filterText', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  @test.lit 'op'\n  status: 'open' | 'closed'\n}`
      )
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.lit 'op`),
      })
      expect(result[0].textEdit.newText).toBe(`'open'`)
      expect(result[0].filterText).toBe(`'open'`)
    })

    it('completes number values unquoted, replacing the typed number', async () => {
      const { handlers, at } = hookRepo(`interface Ticket {\n  @test.litNum 2\n  size: number\n}`)
      const result = await handlers.onCompletion!({
        textDocument: { uri },
        position: at(`@test.litNum 2`),
      })
      expect(labels(result)).toEqual(['10', '25'])
      expect(result[0].textEdit.newText).toBe('10')
      expect(result[0].filterText).toBe('10')
      expect(result[0].textEdit.range.start).toEqual(at(`@test.litNum `))
    })

    describe('annotate block in another file than the union', () => {
      const aUri = 'file:///proj/a.as'
      const bUri = 'file:///proj/b.as'
      const aSrc = `export interface Ticket {\n  status: 'open' | 'closed'\n}`
      const bSrc = (arg: string) =>
        `import { Ticket } from './a'\nannotate Ticket {\n  @test.lit ${arg}\n  status\n}`
      // the union lives in a.as; b.as only imports `Ticket`
      function twoFiles(arg: string) {
        const a = createDoc(aUri, aSrc, hookConfig)
        const b = createDoc(bUri, bSrc(arg), hookConfig)
        b.updateDependencies([a])
        const textB = td(bUri, bSrc(arg))
        const { handlers } = createTestableRepo(
          new Map([
            [aUri, td(aUri, aSrc)],
            [bUri, textB],
          ]),
          new Map([
            [aUri, a],
            [bUri, b],
          ])
        )
        const text = textB.getText()
        const at = (needle: string, shift = needle.length) =>
          textB.positionAt(text.indexOf(needle) + shift)
        return { handlers, at }
      }

      it('offers the literals although the union type is not imported', async () => {
        const { handlers, at } = twoFiles(`'op'`)
        const result = await handlers.onCompletion!({
          textDocument: { uri: bUri },
          position: at(`@test.lit 'op`),
        })
        expect(labels(result)).toEqual([`'open'`, `'closed'`])
      })

      it('jumps to the literal in the other file', async () => {
        const { handlers, at } = twoFiles(`'closed', 'Done'`)
        const result = await handlers.onDefinition!({
          textDocument: { uri: bUri },
          position: at(`@test.lit 'closed`, 12),
        })
        expect(result).toHaveLength(1)
        expect(result[0].targetUri).toBe(aUri)
        expect(result[0].targetSelectionRange.start).toEqual({
          line: 1,
          character: `  status: 'open' | `.length,
        })
      })

      it('hovers with the declaration line of the other file', async () => {
        const { handlers, at } = twoFiles(`'closed', 'Done'`)
        const result = await handlers.onHover!({
          textDocument: { uri: bUri },
          position: at(`@test.lit 'closed`, 12),
        })
        expect(result.contents.value).toMatch(/Declared in `\.\/a` at line 2/)
      })
    })

    it('jumps to the literal from inside an annotate block', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  status: 'open' | 'closed'\n}\nannotate Ticket {\n  @test.lit 'closed', 'Done'\n  status\n}`
      )
      const result = await handlers.onDefinition!({
        textDocument: { uri },
        position: at(`@test.lit 'closed`, 12),
      })
      expect(result[0].targetSelectionRange.start.line).toBe(at(`status: 'open'`).line)
    })

    it('hovers a value argument with the literal it names', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  @test.lit 'closed', 'Done'\n  status: 'open' | 'closed'\n}`
      )
      const result = await handlers.onHover!({
        textDocument: { uri },
        position: at(`@test.lit 'closed`, 12),
      })
      expect(result.contents.value).toContain(`'closed'`)
      expect(result.contents.value).toContain('Declared at line')
    })

    it('hovers a value argument inside an annotate block', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  status: 'open' | 'closed'\n}\nannotate Ticket {\n  @test.lit 'open', 'Open'\n  status\n}`
      )
      const result = await handlers.onHover!({
        textDocument: { uri },
        position: at(`@test.lit 'open`, 12),
      })
      expect(result.contents.value).toContain(`'open'`)
    })

    it('does not jump anywhere new for a value that is not one of the literals', async () => {
      const { handlers, at } = hookRepo(
        `interface Ticket {\n  @test.lit 'nope', 'X'\n  status: 'open' | 'closed'\n}`
      )
      const result = await handlers.onDefinition!({
        textDocument: { uri },
        position: at(`@test.lit 'nope`, 13),
      })
      // stays on the argument itself — never on the union's literals
      expect(result[0].targetSelectionRange.start.line).toBe(at(`@test.lit 'nope`).line)
    })
  })
})

describe('trailing comments after annotations', () => {
  const uri = 'file:///test.as'
  const source = [
    'interface User {',
    '  @meta.label "Name" // shown in forms',
    '  name: string',
    '  @expect.pattern "^//", /* flags */ ',
    '  url: string',
    '  @expect.min 5 /* lower bound */',
    '  age: number',
    '}',
  ].join('\n')

  it('parses without diagnostics errors', async () => {
    const { repo, connection, doc } = singleDocRepo(uri, source)
    await repo.checkDoc(doc)
    const { diagnostics } = connection.sendDiagnostics.mock.calls.at(-1)![0]
    expect(diagnostics.filter((d: any) => d.severity === 1)).toEqual([])
  })

  it('hovers the annotation name and argument on a commented line', async () => {
    const { handlers } = singleDocRepo(uri, source)
    const onName = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 1, character: 3 },
    })
    expect(onName.contents.value).toContain('label')
    const onArg = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 5, character: 14 },
    })
    expect(onArg.contents.kind).toBe('markdown')
  })

  it('completes argument values before a trailing comment', async () => {
    const { handlers } = singleDocRepo(uri, source)
    // after `"^//", ` (char 24) — the second (flags) argument
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 3, character: 24 },
    })
    expect(result.map((i: any) => i.label)).toEqual(["'g'", "'i'", "'gi'"])
  })

  it('gives signature help before the comment and none inside it', async () => {
    const { handlers } = singleDocRepo(uri, source)
    const before = await handlers.onSignatureHelp!({
      textDocument: { uri },
      position: { line: 5, character: 14 },
    })
    expect(before.signatures[0].label).toContain('minValue')
    const inside = await handlers.onSignatureHelp!({
      textDocument: { uri },
      position: { line: 5, character: 24 },
    })
    expect(inside).toBeUndefined()
    const insideLine = await handlers.onSignatureHelp!({
      textDocument: { uri },
      position: { line: 1, character: 30 },
    })
    expect(insideLine).toBeUndefined()
  })

  it('offers no completions inside a trailing comment', async () => {
    const { handlers } = singleDocRepo(uri, source)
    for (const position of [
      { line: 1, character: 30 },
      { line: 3, character: 30 },
      { line: 5, character: 24 },
    ]) {
      const result = await handlers.onCompletion!({ textDocument: { uri }, position })
      expect(result ?? []).toEqual([])
    }
  })

  it('treats lines inside a block comment opened on an earlier line as comment', async () => {
    const src = [
      'interface User {',
      '  /* disabled:',
      '  @expect.pattern "^//", ',
      '  */',
      '  url: string',
      '}',
    ].join('\n')
    const { handlers } = singleDocRepo(uri, src)
    const position = { line: 2, character: 24 }
    const completion = await handlers.onCompletion!({ textDocument: { uri }, position })
    expect(completion ?? []).toEqual([])
    const signature = await handlers.onSignatureHelp!({ textDocument: { uri }, position })
    expect(signature).toBeUndefined()
  })
})

// Type paths through unions (MODEL §15 CHAIN-1 U2): a path naming one field goes to it; one
// naming several fields (a union of them) goes to each field and hovers each field's docs;
// completions offer the props of every object the path reaches.
describe('type paths through unions', () => {
  const uri = 'file:///paths.as'
  const source = [
    'interface I0 {',
    '  @meta.label "I0.h"',
    '  h: string',
    '}',
    'interface I5 {',
    '  @meta.label "I5.h"',
    '  h: number',
    '  k: string',
    '}',
    'interface I2 { work: I0 }',
    'interface I3 { work: I5 }',
    'type M0 = I2 | null',
    'type U = I2 | I3',
    'interface CH {',
    '  a?: M0.work.h',
    '  b?: U.work.h',
    '  c?: U.work.',
    '}',
  ].join('\n')

  it('go-to-definition: the field, or every field', () => {
    const doc = createDoc(uri, source)
    const lines = (line: number, ch: number) =>
      doc.getToDefinitionAt(line, ch)?.map(l => l.targetRange.start.line)
    // `h` of `M0.work.h` (line 14) and of `U.work.h` (line 15)
    expect(lines(14, 14)).toEqual([2])
    expect(lines(15, 13)).toEqual([2, 6])
  })

  it('hover shows the docs of the field, or of every field', async () => {
    const { handlers } = singleDocRepo(uri, source)
    const one = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 14, character: 14 },
    })
    expect(one.contents.value).toBe('**string**')
    const many = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 15, character: 13 },
    })
    expect(many.contents.value).toBe('**string**\n\n**number**')
  })

  it('completes the props of every branch', async () => {
    const { handlers } = singleDocRepo(uri, source)
    const result = await handlers.onCompletion!({
      textDocument: { uri },
      position: { line: 16, character: 13 },
    })
    expect(result.map((i: any) => i.label)).toEqual(['h', 'k'])
  })

  it('hover notes a phantom path once, whatever the number of fields', async () => {
    const phantomSource = [
      'interface P0 { p: phantom }',
      'interface P5 { p: phantom }',
      'interface P2 { work: P0 }',
      'interface P3 { work: P5 }',
      'type PU = P2 | P3',
      'interface CH {',
      '  d?: PU.work.p',
      '}',
    ].join('\n')
    const { handlers } = singleDocRepo(uri, phantomSource)
    const hover = await handlers.onHover!({
      textDocument: { uri },
      position: { line: 6, character: 14 },
    })
    expect(hover.contents.value.split('phantom — excluded').length - 1).toBe(1)
  })

  it('reports an interface extending a union', async () => {
    const extendsSource = [
      'interface I1 { f: string }',
      'interface I2 { g: string }',
      'type U = I1 | I2',
      'type N = I1 | null',
      'export interface E extends U {}',
      'export interface C extends N {}',
    ].join('\n')
    // (the built-in primitives, `null` included)
    const builtIns = await new PluginManager({ unknownAnnotation: 'allow' }).getDocConfig()
    const { repo, connection, doc } = singleDocRepo(uri, extendsSource, builtIns)
    await repo.checkDoc(doc)
    const { diagnostics } = connection.sendDiagnostics.mock.calls.at(-1)![0]
    expect(diagnostics.map((d: any) => [d.range.start.line, d.message])).toEqual([
      [4, "An interface can't extend a union; use a merge (`U & { … }`)"],
    ])
  })
})
