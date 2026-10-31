import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptDocConfig } from './document'
import { AtscriptDoc } from './document'
import { flatDefinitions, isDbEntityNode, isPhantomNode } from './flatten'
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

/** The types written at `path` of interface `name` (references: by name). */
function writtenAt(doc: AtscriptDoc, name: string, path: string): Array<string | undefined> {
  return flatDefinitions(doc, getInterface(doc, name))(path).map(d => d.prop.getDefinition()?.id)
}

describe('flatDefinitions', () => {
  it('finds the props of a path through nested structures, references and arrays', () => {
    const doc = createDoc(`
      interface Address {
        street: string
        geo: { lat: number }
      }
      interface User {
        name: string
        home: Address
        contacts: { email: string }[]
        homes: Address[][]
      }
    `)
    const at = (path: string) => flatDefinitions(doc, getInterface(doc, 'User'))(path)
    expect(at('name').map(d => d.prop.id)).toEqual(['name'])
    expect(at('home.street').map(d => d.prop.id)).toEqual(['street'])
    expect(at('home.geo.lat').map(d => d.prop.id)).toEqual(['lat'])
    expect(at('contacts.email').map(d => d.prop.id)).toEqual(['email'])
    expect(at('homes.geo.lat').map(d => d.prop.id)).toEqual(['lat'])
    expect(at('missing')).toEqual([])
    expect(at('name.length')).toEqual([])
    // (the definition resolved: a reference to an interface is its structure)
    expect(at('home')[0].def.entity).toBe('structure')
  })

  it('reads inherited props (`extends`) and merges (`&`)', () => {
    const doc = createDoc(`
      interface Base { id: string, meta: { created: number } }
      interface Extra { note?: string }
      type Merged = Base & Extra
      interface User extends Base {
        name: string
        both: Merged
        inPlace: Base & { flag: boolean }
      }
    `)
    expect(writtenAt(doc, 'User', 'id')).toEqual(['string'])
    expect(writtenAt(doc, 'User', 'meta.created')).toEqual(['number'])
    expect(flatDefinitions(doc, getInterface(doc, 'User'))('both.note')[0].prop.id).toBe('note')
    expect(flatDefinitions(doc, getInterface(doc, 'User'))('both.meta.created')).toHaveLength(1)
    expect(flatDefinitions(doc, getInterface(doc, 'User'))('inPlace.flag')).toHaveLength(1)
    expect(flatDefinitions(doc, getInterface(doc, 'User'))('inPlace.id')).toHaveLength(1)
  })

  it('collects every branch of a union (`| null` too) and tuple at one path', () => {
    const doc = createDoc(`
      interface A { a: string, b: number }
      interface B { a: number, c: boolean }
      interface Data {
        field: A | B
        nullable: A | null
        pair: [A, B]
        list: (A | B)[]
      }
    `)
    expect(writtenAt(doc, 'Data', 'field.a')).toEqual(['string', 'number'])
    expect(writtenAt(doc, 'Data', 'field.b')).toEqual(['number'])
    expect(writtenAt(doc, 'Data', 'field.c')).toEqual(['boolean'])
    expect(writtenAt(doc, 'Data', 'nullable.a')).toEqual(['string'])
    expect(writtenAt(doc, 'Data', 'pair.a')).toEqual(['string', 'number'])
    expect(writtenAt(doc, 'Data', 'list.c')).toEqual(['boolean'])
  })

  it('follows chain references and recursive types one step at a time', () => {
    const doc = createDoc(`
      interface Inner { deep: { x: string } }
      interface Holder { inner: Inner }
      interface Node {
        value: string
        next?: Node
        chained: Holder.inner
      }
    `)
    expect(writtenAt(doc, 'Node', 'chained.deep.x')).toEqual(['string'])
    expect(writtenAt(doc, 'Node', 'next.next.next.value')).toEqual(['string'])
  })
})

describe('isPhantomNode', () => {
  it('detects a phantom type, through a reference', () => {
    const doc = createDoc(`
      type P = phantom
      interface T {
        a: phantom
        b: P
        c: string
      }
    `)
    const props = (getInterface(doc, 'T').getDefinition() as any).props
    expect(isPhantomNode(doc, props.get('a').getDefinition())).toBe(true)
    expect(isPhantomNode(doc, props.get('b').getDefinition())).toBe(true)
    expect(isPhantomNode(doc, props.get('c').getDefinition())).toBe(false)
  })
})

describe('isDbEntityNode', () => {
  it('accepts @db.table, @db.view and a @db.view.for-only view, nothing else', () => {
    const doc = createDoc(`
      @db.table "users"
      interface Table {
        id: string
      }
      @db.view "stats"
      interface Named {
        id: string
      }
      @db.view.for Table
      interface ForOnly {
        id: string
      }
      interface Plain {
        id: string
      }
    `)
    expect(isDbEntityNode(getInterface(doc, 'Table'))).toBe(true)
    expect(isDbEntityNode(getInterface(doc, 'Named'))).toBe(true)
    expect(isDbEntityNode(getInterface(doc, 'ForOnly'))).toBe(true)
    expect(isDbEntityNode(getInterface(doc, 'Plain'))).toBe(false)
  })
})
