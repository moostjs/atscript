/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'

import {
  AnnotationSpec,
  AtscriptDoc,
  SemanticPrimitiveNode,
} from '@atscript/core'
import type { TAtscriptDocConfig } from '@atscript/core'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { CompletionItemKind } from 'vscode-languageserver/node'

import { VscodeAtscriptRepo } from './repo'

// ---------------------------------------------------------------------------
// Shared primitives & annotations
// ---------------------------------------------------------------------------

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set('string', new SemanticPrimitiveNode('string', {
  type: 'string',
  extensions: {
    email: { type: 'string', annotations: { 'expect.pattern': '^.+@.+$' } },
  },
}))
primitives.set('number', new SemanticPrimitiveNode('number', {
  type: 'number',
  extensions: {
    int: { type: 'number', annotations: { 'expect.int': true } },
    positive: { type: 'number', annotations: { 'expect.min': 0 } },
  },
}))
primitives.set('boolean', new SemanticPrimitiveNode('boolean', { type: 'boolean' }))
primitives.set('phantom', new SemanticPrimitiveNode('phantom', { type: 'phantom' }))
primitives.set('ui', new SemanticPrimitiveNode('ui', {
  type: 'phantom',
  isContainer: true,
  extensions: { action: {}, divider: {} },
}))

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
        { name: 'flags', optional: true, type: 'string' as const, description: 'Regex flags.', values: ['g', 'i', 'gi'] },
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
  workspaceFiles?: (...args: any[]) => any
}

function createMockConnection() {
  const handlers: CapturedHandlers = {}
  const connection = {
    onCompletion: vi.fn((h: (...args: any[]) => any) => { handlers.onCompletion = h }),
    onCompletionResolve: vi.fn(),
    onHover: vi.fn((h: (...args: any[]) => any) => { handlers.onHover = h }),
    onDefinition: vi.fn((h: (...args: any[]) => any) => { handlers.onDefinition = h }),
    onReferences: vi.fn((h: (...args: any[]) => any) => { handlers.onReferences = h }),
    onRenameRequest: vi.fn((h: (...args: any[]) => any) => { handlers.onRenameRequest = h }),
    onSignatureHelp: vi.fn((h: (...args: any[]) => any) => { handlers.onSignatureHelp = h }),
    onDidSaveTextDocument: vi.fn((h: (...args: any[]) => any) => { handlers.onDidSaveTextDocument = h }),
    onDidChangeWatchedFiles: vi.fn(),
    onNotification: vi.fn((method: string, h: (...args: any[]) => any) => {
      if (method === 'workspace/files') { handlers.workspaceFiles = h }
    }),
    listen: vi.fn(),
    sendDiagnostics: vi.fn(),
    languages: {
      semanticTokens: {
        onRange: vi.fn((h: (...args: any[]) => any) => { handlers.semanticTokensOnRange = h }),
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
    if (doc) { return doc }
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

  async checkImports() { /* no-op */ }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createTestableRepo(
  textDocs: Map<string, TextDocument>,
  atscriptDocs: Map<string, AtscriptDoc>,
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

function singleDocRepo(uri: string, source: string) {
  const textDoc = td(uri, source)
  const asDoc = createDoc(uri, source)
  return createTestableRepo(new Map([[uri, textDoc]]), new Map([[uri, asDoc]]))
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

  it('resolveAnnotateTarget follows type alias to interface', () => {
    const doc = createDoc('file:///test.as', 'interface User {\n  name: string\n}\ntype Alias = User')
    const { repo } = singleDocRepo('file:///test.as', '')
    const target = repo.resolveAnnotateTarget(doc, 'Alias')
    expect(target).toBeDefined()
    expect(target!.props.has('name')).toBe(true)
  })

  it('getPropsFromDef extracts from interface and structure', () => {
    const doc = createDoc('file:///test.as', 'interface User {\n  name: string\n  address: { street: string }\n}')
    const { repo } = singleDocRepo('file:///test.as', '')

    // Interface props
    const iface = doc.nodes.find(n => n.entity === 'interface')!
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
    const iface = doc.nodes.find(n => n.entity === 'interface')!
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
    expect(result![0]).toEqual(expect.objectContaining({
      targetUri: 'file:///test.as',
      targetRange: expect.objectContaining({
        start: { line: 0, character: 5 },
      }),
    }))
  })

  it('jumps to cross-file import definition', () => {
    const doc1 = createDoc('file:///home/file1.as', 'export type Shared = string')
    const doc2 = createDoc('file:///home/file2.as', "import { Shared } from './file1'\ntype T = Shared")
    doc2.updateDependencies([doc1])
    // Line 1: "type T = Shared"  Shared ref at char 9
    const result = doc2.getToDefinitionAt(1, 10)
    expect(result).toBeDefined()
    expect(result![0]).toEqual(expect.objectContaining({
      targetUri: 'file:///home/file1.as',
    }))
  })

  it('jumps to nested prop via ref chain', () => {
    // Line 0: "interface I { prop: { nested: string } }"
    // Line 1: "interface I2 { p: I.prop.nested }"
    const doc = createDoc('file:///test.as',
      'interface I { prop: { nested: string } }\ninterface I2 { p: I.prop.nested }')
    // 'nested' starts at char 25 in line 1
    const result = doc.getToDefinitionAt(1, 26)
    expect(result).toBeDefined()
    expect(result![0]).toEqual(expect.objectContaining({
      targetUri: 'file:///test.as',
    }))
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
    const doc = createDoc('file:///test.as', 'type MyType = string\ninterface I { p1: MyType; p2: MyType }')
    const defToken = doc.registry.definitions.get('MyType')!
    const refs = doc.usageListFor(defToken)
    expect(refs).toBeDefined()
    expect(refs!.length).toBe(2)
  })

  it('finds cross-file references', () => {
    const doc1 = createDoc('file:///home/file1.as', 'export type Shared = string')
    const doc2 = createDoc('file:///home/file2.as',
      "import { Shared } from './file1'\ntype T = Shared\ninterface I { p: Shared }")
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
      new Map([[uri1, td(uri1, source1)], [uri2, td(uri2, source2)]]),
      new Map([[uri1, doc1], [uri2, doc2]]),
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
      new Map([[uri1, td(uri1, source1)], [uri2, td(uri2, source2)]]),
      new Map([[uri1, doc1], [uri2, doc2]]),
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

  it('suggests nested props in annotate block chain', async () => {
    const uri = 'file:///test.as'
    const source = 'interface User {\n  address: { street: string; city: string }\n}\nannotate User {\n  address.\n}'
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
    const source = 'interface User {\n  tag: phantom\n  name: string\n}\nannotate User {\n  tag\n  name\n}'
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
