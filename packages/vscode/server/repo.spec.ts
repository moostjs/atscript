import {
  AnnotationSpec,
  AtscriptDoc,
  SemanticInterfaceNode,
  SemanticPrimitiveNode,
} from '@atscript/core'
import type { SemanticNode, TAtscriptDocConfig } from '@atscript/core'
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
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
  it('resolveAnnotateTarget resolves interface with props', () => {
    const doc = createDoc('file:///test.as', 'interface User {\n  name: string\n  age: number\n}')
    const { repo } = singleDocRepo('file:///test.as', '')
    const target = repo.resolveAnnotateTarget(doc, 'User')
    expect(target).toBeDefined()
    expect(target!.props.size).toBe(2)
    expect(target!.props.has('name')).toBe(true)
    expect(target!.props.has('age')).toBe(true)
  })

  it('resolveAnnotateTarget returns undefined for non-existent type', () => {
    const doc = createDoc('file:///test.as', 'interface User { name: string }')
    const { repo } = singleDocRepo('file:///test.as', '')
    expect(repo.resolveAnnotateTarget(doc, 'NonExistent')).toBeUndefined()
  })

  it('resolveAnnotateTarget includes inherited props from extends chain', () => {
    const source = [
      'interface Credentials {',
      '  username: string',
      '  password: string',
      '}',
      'interface ArbacCredentials extends Credentials {',
      '  roles: string[]',
      '}',
    ].join('\n')
    const doc = createDoc('file:///test.as', source)
    const { repo } = singleDocRepo('file:///test.as', '')
    const target = repo.resolveAnnotateTarget(doc, 'ArbacCredentials')
    expect(target).toBeDefined()
    const propNames = Array.from(target!.props.keys())
    expect(propNames).toContain('roles')
    expect(propNames).toContain('username')
    expect(propNames).toContain('password')
  })

  it('resolveAnnotateTarget follows type alias to interface', () => {
    const doc = createDoc(
      'file:///test.as',
      'interface User {\n  name: string\n}\ntype Alias = User'
    )
    const { repo } = singleDocRepo('file:///test.as', '')
    const target = repo.resolveAnnotateTarget(doc, 'Alias')
    expect(target).toBeDefined()
    expect(target!.props.has('name')).toBe(true)
  })

  it('getPropsFromDef extracts from interface and structure', () => {
    const doc = createDoc(
      'file:///test.as',
      'interface User {\n  name: string\n  address: { street: string }\n}'
    )
    const { repo } = singleDocRepo('file:///test.as', '')

    // Interface props
    const iface = doc.nodes.find(n => n.entity === 'interface')! as SemanticInterfaceNode
    const ifaceProps = repo.getPropsFromDef(iface)
    expect(ifaceProps).toBeDefined()
    expect(ifaceProps!.length).toBe(2)

    // Nested structure props
    const addressProp = iface.props.get('address')!
    const structDef = addressProp.getDefinition()!
    const structProps = repo.getPropsFromDef(structDef)
    expect(structProps).toBeDefined()
    expect(structProps!.some(p => p.id === 'street')).toBe(true)
  })

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

  it('closes a changed file that is not open in the editor and re-checks its dependants', async () => {
    const { repo, connection, a, b } = importerRepo([aUri])
    repo.checksDelay = 0

    await repo.onAsFileChanged(bUri)

    expect((repo as any).atscripts.has(bUri)).toBe(false)
    expect((repo as any).atscripts.has(aUri)).toBe(true)
    expect((repo as any).revalidateQueue).toEqual([aUri])
    // The dependant keeps its wiring until its own check re-opens the import.
    expect(a.dependencies.has(b)).toBe(true)

    await repo.currentCheck
    expect(connection.sendDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ uri: aUri }))
    // The changed file itself is not re-opened: it may no longer exist.
    expect(connection.sendDiagnostics).not.toHaveBeenCalledWith(
      expect.objectContaining({ uri: bUri })
    )
  })

  it('leaves a file that is open in the editor alone', async () => {
    const { repo } = importerRepo([aUri, bUri])
    await repo.onAsFileChanged(bUri)
    expect((repo as any).atscripts.has(bUri)).toBe(true)
    expect((repo as any).revalidateQueue).toEqual([])
  })

  it('ignores a file the repo never opened', async () => {
    const { repo } = importerRepo([aUri])
    await repo.onAsFileChanged('file:///c.as')
    expect((repo as any).atscripts.size).toBe(2)
    expect((repo as any).revalidateQueue).toEqual([])
  })

  it('drops a cached open that failed without queueing anything', async () => {
    const { repo } = importerRepo([aUri])
    const cUri = 'file:///c.as'
    ;(repo as any).atscripts.set(cUri, Promise.reject(new Error('Document not found')))
    await repo.onAsFileChanged(cUri)
    expect((repo as any).atscripts.has(cUri)).toBe(false)
    expect((repo as any).revalidateQueue).toEqual([])
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
    expect(spy).toHaveBeenCalledWith(bUri)
  })
})

// ---------------------------------------------------------------------------
// Plugin-owned LSP hooks (fieldScope / refFilter)
// ---------------------------------------------------------------------------

describe('plugin LSP hooks', () => {
  const refFilter = vi.fn(
    (decl: SemanticNode, _doc: AtscriptDoc) =>
      decl.annotations?.some(a => a.name === 'test.table') ?? false
  )
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
})
