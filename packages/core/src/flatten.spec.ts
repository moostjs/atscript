import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptDocConfig } from './document'
import { AtscriptDoc } from './document'
import { flattenInterfaceNode } from './flatten'
import type { SemanticInterfaceNode } from './parser/nodes/interface-node'
import { PluginManager } from './plugin/plugin-manager'

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  const pm = new PluginManager({ unknownAnnotation: 'allow' })
  docConfig = await pm.getDocConfig()
})

function createDoc(source: string): AtscriptDoc {
  const doc = new AtscriptDoc('test.as', docConfig)
  doc.update(source)
  return doc
}

function getInterface(doc: AtscriptDoc, name?: string): SemanticInterfaceNode {
  const node = name
    ? doc.nodes.find(n => n.entity === 'interface' && n.id === name)
    : doc.nodes.find(n => n.entity === 'interface')
  return node as SemanticInterfaceNode
}

describe('flattenInterfaceNode', () => {
  it('should flatten simple flat interface', () => {
    const doc = createDoc(`
      @db.table "test"
      interface User {
        name: string
        age: number
        active: boolean
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    expect(Array.from(flat.keys())).toEqual(['name', 'age', 'active'])
    // All are leaf entries
    expect(flat.get('name')!.intermediate).toBeFalsy()
    expect(flat.get('age')!.intermediate).toBeFalsy()
  })

  it('should flatten nested inline object with intermediate entry', () => {
    const doc = createDoc(`
      @db.table "test"
      interface User {
        name: string
        address: {
          street: string
          city: string
        }
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    expect(Array.from(flat.keys())).toEqual([
      'name',
      'address',
      'address.street',
      'address.city',
    ])
    // address is intermediate (structure)
    expect(flat.get('address')!.intermediate).toBe(true)
    // sub-paths are leaves
    expect(flat.get('address.street')!.intermediate).toBeFalsy()
    expect(flat.get('address.city')!.intermediate).toBeFalsy()
  })

  it('should flatten named nested type via ref with intermediate entry', () => {
    const doc = createDoc(`
      interface Address {
        street: string
        city: string
      }

      @db.table "test"
      interface User {
        name: string
        home: Address
      }
    `)
    const node = getInterface(doc, 'User')
    const flat = flattenInterfaceNode(doc, node)

    expect(Array.from(flat.keys())).toEqual([
      'name',
      'home',
      'home.street',
      'home.city',
    ])
    expect(flat.get('home')!.intermediate).toBe(true)
    expect(flat.get('home.street')!.intermediate).toBeFalsy()
  })

  it('should flatten through arrays with intermediate for complex elements', () => {
    const doc = createDoc(`
      @db.table "test"
      interface User {
        tags: string[]
        contacts: {
          name: string
          email: string
        }[]
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    expect(Array.from(flat.keys())).toEqual([
      'tags',
      'contacts',
      'contacts.name',
      'contacts.email',
    ])
    // tags is array of primitive — leaf
    expect(flat.get('tags')!.intermediate).toBeFalsy()
    // contacts is array of structure — intermediate
    expect(flat.get('contacts')!.intermediate).toBe(true)
    expect(flat.get('contacts.name')!.intermediate).toBeFalsy()
  })

  it('should stop flattening at @db.json fields', () => {
    const doc = createDoc(`
      @db.table "test"
      interface User {
        name: string
        @db.json
        metadata: {
          key: string
          value: string
        }
        @db.json
        items: {
          label: string
        }[]
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    // metadata and items should be leaves — no sub-paths
    expect(Array.from(flat.keys())).toEqual(['name', 'metadata', 'items'])
    // @db.json fields are NOT intermediate — they are opaque leaf entries
    expect(flat.get('metadata')!.intermediate).toBeFalsy()
    expect(flat.get('items')!.intermediate).toBeFalsy()
    // @db.json flag is set
    expect(flat.get('metadata')!.dbJson).toBe(true)
    expect(flat.get('items')!.dbJson).toBe(true)
    expect(flat.get('name')!.dbJson).toBeFalsy()
  })

  it('should merge union branch paths with intermediate entry', () => {
    const doc = createDoc(`
      @db.table "test"
      interface Data {
        field: { a: string, b: number } | { a: number, c: boolean }
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    const keys = Array.from(flat.keys())
    // Union of only structures — 'field' is intermediate
    expect(keys).toContain('field')
    expect(flat.get('field')!.intermediate).toBe(true)
    expect(keys).toContain('field.a') // merged from both branches
    expect(keys).toContain('field.b') // only in first branch
    expect(keys).toContain('field.c') // only in second branch
  })

  it('should track optional fields with propagation', () => {
    const doc = createDoc(`
      @db.table "test"
      interface User {
        name: string
        nickname?: string
        address?: {
          street: string
        }
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    expect(flat.get('name')!.optional).toBe(false)
    expect(flat.get('nickname')!.optional).toBe(true)
    // address is intermediate, still tracked as optional
    expect(flat.get('address')!.optional).toBe(true)
    expect(flat.get('address')!.intermediate).toBe(true)
    // sub-path inherits optional from parent
    expect(flat.get('address.street')!.optional).toBe(true)
  })

  it('should include inherited fields from extends', () => {
    const doc = createDoc(`
      interface Base {
        id: string
        createdAt: number
      }

      @db.table "test"
      interface User extends Base {
        name: string
        email: string
      }
    `)
    const node = getInterface(doc, 'User')
    const flat = flattenInterfaceNode(doc, node)

    const keys = Array.from(flat.keys())
    expect(keys).toContain('id')
    expect(keys).toContain('createdAt')
    expect(keys).toContain('name')
    expect(keys).toContain('email')
  })

  it('should skip pattern properties', () => {
    const doc = createDoc(`
      @db.table "test"
      interface Config {
        name: string
        [*]: string
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    expect(Array.from(flat.keys())).toEqual(['name'])
  })

  it('should flatten deep nesting with intermediate entries', () => {
    const doc = createDoc(`
      @db.table "test"
      interface Data {
        level1: {
          level2: {
            level3: string
          }
        }
      }
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    expect(Array.from(flat.keys())).toEqual([
      'level1',
      'level1.level2',
      'level1.level2.level3',
    ])
    expect(flat.get('level1')!.intermediate).toBe(true)
    expect(flat.get('level1.level2')!.intermediate).toBe(true)
    expect(flat.get('level1.level2.level3')!.intermediate).toBeFalsy()
  })

  it('should return empty map for empty interface', () => {
    const doc = createDoc(`
      @db.table "test"
      interface Empty {}
    `)
    const node = getInterface(doc)
    const flat = flattenInterfaceNode(doc, node)

    expect(flat.size).toBe(0)
  })
})
