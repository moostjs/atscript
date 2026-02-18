/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'

import { AnnotationSpec } from '../../annotations'
import { AtscriptDoc } from '../../document'
import { parseAtscript } from '..'
import type { SemanticAnnotateNode } from '../nodes/annotate-node'
import { SemanticPrimitiveNode } from '../nodes/primitive-node'

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set('string', new SemanticPrimitiveNode('string', { type: 'string' }))
primitives.set('number', new SemanticPrimitiveNode('number', { type: 'number' }))
primitives.set('boolean', new SemanticPrimitiveNode('boolean', { type: 'boolean' }))

describe('annotate', () => {
  it('basic mutating annotate', () => {
    const result = parseAtscript(`
interface MyInterface {
  prop1: string
}
annotate MyInterface {
  @meta.label 'prop1'
  prop1
}
`)
    expect(result.messages).toHaveLength(0)
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[1].entity).toBe('annotate')
    const annotateNode = result.nodes[1] as SemanticAnnotateNode
    expect(annotateNode.isMutating).toBe(true)
    expect(annotateNode.targetName).toBe('MyInterface')
    expect(annotateNode.token('identifier')).toBeUndefined()
  })

  it('non-mutating annotate with as', () => {
    const result = parseAtscript(`
interface MyInterface {
  prop1: string
}
annotate MyInterface as MyInterface2 {
  @meta.label 'prop1'
  prop1
}
`)
    expect(result.messages).toHaveLength(0)
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[1].entity).toBe('annotate')
    const annotateNode = result.nodes[1] as SemanticAnnotateNode
    expect(annotateNode.isMutating).toBe(false)
    expect(annotateNode.targetName).toBe('MyInterface')
    expect(annotateNode.id).toBe('MyInterface2')
  })

  it('export non-mutating annotate', () => {
    const result = parseAtscript(`
interface MyInterface {
  prop1: string
}
export annotate MyInterface as MyInterface2 {
  @meta.label 'prop1'
  prop1
}
`)
    expect(result.messages).toHaveLength(0)
    expect(result.nodes).toHaveLength(2)
    const annotateNode = result.nodes[1] as SemanticAnnotateNode
    expect(annotateNode.token('export')).toBeDefined()
    expect(annotateNode.id).toBe('MyInterface2')
  })

  it('export mutating annotate produces error', () => {
    const source = `
interface MyInterface {
  prop1: string
}
export annotate MyInterface {
  @meta.label 'prop1'
  prop1
}
`
    const doc = new AtscriptDoc('test', {})
    doc.update(source)
    const messages = doc.messages
    expect(messages.some(m => m.message.includes('Cannot export mutating ad-hoc annotations'))).toBe(true)
  })

  it('entries with dot-chain references', () => {
    const result = parseAtscript(`
annotate MyInterface {
  @meta.label 'nested prop'
  obj.prop2
  @meta.label 'deep nested'
  obj.inner.prop3
}
`)
    expect(result.messages).toHaveLength(0)
    const annotateNode = result.nodes[0] as SemanticAnnotateNode
    const entries = annotateNode.entries
    expect(entries).toHaveLength(2)
    expect(entries[0].id).toBe('obj')
    expect(entries[0].chain.map(t => t.text)).toEqual(['prop2'])
    expect(entries[1].id).toBe('obj')
    expect(entries[1].chain.map(t => t.text)).toEqual(['inner', 'prop3'])
  })

  it('entries with annotations', () => {
    const result = parseAtscript(`
annotate MyInterface {
  @meta.label 'Label 1'
  @meta.description 'Desc 1'
  prop1
  @meta.label 'Label 2'
  prop2
}
`)
    expect(result.messages).toHaveLength(0)
    const annotateNode = result.nodes[0] as SemanticAnnotateNode
    const entries = annotateNode.entries
    expect(entries).toHaveLength(2)
    expect(entries[0].annotations).toHaveLength(2)
    expect(entries[0].annotations![0].name).toBe('meta.label')
    expect(entries[0].annotations![1].name).toBe('meta.description')
    expect(entries[1].annotations).toHaveLength(1)
    expect(entries[1].annotations![0].name).toBe('meta.label')
  })

  it('registration: target is marked as reference', () => {
    const source = `
interface MyInterface { prop1: string }
annotate MyInterface {
  prop1
}
`
    const doc = new AtscriptDoc('test', {})
    doc.update(source)
    const referred = doc.referred.map(t => t.text)
    expect(referred).toContain('MyInterface')
  })

  it('registration: identifier is marked as definition (non-mutating)', () => {
    const source = `
interface MyInterface { prop1: string }
annotate MyInterface as MyInterface2 {
  prop1
}
`
    const doc = new AtscriptDoc('test', {})
    doc.update(source)
    expect(doc.registry.definitions.has('MyInterface2')).toBe(true)
  })

  it('registration: non-mutating with export registers export', () => {
    const source = `
interface MyInterface { prop1: string }
export annotate MyInterface as MyInterface2 {
  prop1
}
`
    const doc = new AtscriptDoc('test', {})
    doc.update(source)
    expect(doc.exports.has('MyInterface2')).toBe(true)
  })

  it('getAnnotateNodesFor returns matching annotate nodes', () => {
    const source = `
interface MyInterface { prop1: string }
annotate MyInterface {
  @meta.label 'Label'
  prop1
}
annotate MyInterface as MyInterface2 {
  @meta.description 'Desc'
  prop1
}
`
    const doc = new AtscriptDoc('test', {})
    doc.update(source)
    const annotateNodes = doc.getAnnotateNodesFor('MyInterface')
    expect(annotateNodes).toHaveLength(2)
  })

  it('toString renders annotate node', () => {
    const result = parseAtscript(`
annotate MyInterface as MyInterface2 {
  @meta.label 'prop1'
  prop1
  @meta.label 'nested'
  obj.prop2
}
`)
    expect(result.nodes[0].toString()).toMatchSnapshot()
  })

  it('should detect duplicate entries', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  firstName: string
  lastName: string
}
annotate User {
  firstName
  lastName
  firstName
}
`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({ severity: 1, message: 'Duplicate annotate entry' })
    )
  })

  it('should detect duplicate chained entries with full range', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  address: {
    city: string
    zip: string
  }
}
annotate User {
  address.city
  address.zip
  address.city
}
`)
    const messages = doc.getDiagMessages()
    const dupMsg = messages.find(m => m.message === 'Duplicate annotate entry')
    expect(dupMsg).toBeDefined()
    // Range should span from "address" to "city" (the full chained entry)
    expect(dupMsg!.range.start).not.toEqual(dupMsg!.range.end)
    expect(dupMsg!.range.end.character).toBeGreaterThan(dupMsg!.range.start.character)
  })

  it('should report unknown property for invalid entry', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  firstName: string
}
annotate User {
  nonExistent
}
`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({
        severity: 1,
        message: 'Unknown property "nonExistent" in "User"',
      })
    )
  })

  it('should report unknown chained property', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  address: {
    city: string
  }
}
annotate User {
  address.unknown
}
`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({
        severity: 1,
        message: expect.stringContaining('Unknown property'),
      })
    )
  })

  it('should not report errors for valid entries', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  firstName: string
  address: {
    city: string
    zip: string
  }
}
annotate User {
  firstName
  address.city
  address.zip
}
`)
    const messages = doc.getDiagMessages()
    const entryErrors = messages.filter(
      m => m.message.includes('Unknown property') || m.message.includes('Unknown identifier')
    )
    expect(entryErrors).toHaveLength(0)
  })

  it('should not report errors for entries in merged intersection properties', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  contact: {
    type: 'phone' | 'fax' | 'email'
    value: string
  } & {
    isMobile?: boolean
  }
}
annotate User {
  contact.type
  contact.value
  contact.isMobile
}
`)
    const messages = doc.getDiagMessages()
    const entryErrors = messages.filter(
      m => m.message.includes('Unknown property') || m.message.includes('Unknown identifier')
    )
    expect(entryErrors).toHaveLength(0)
  })

  it('should report unknown property on primitive/combined type', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
type TString = string | number
annotate TString {
  unknownProp
}
`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({
        severity: 1,
        message: 'Unknown property "unknownProp" in "TString"',
      })
    )
  })

  it('should report unknown property on union-of-objects type', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
type TO = {
  name: string
  age: number
} | {
  kind: string
}
annotate TO {
  unknownProp
}
`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({
        severity: 1,
        message: 'Unknown property "unknownProp" in "TO"',
      })
    )
  })

  it('should not report errors for valid entries on union-of-objects type', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
type TO = {
  name: string
  age: number
} | {
  kind: string
}
annotate TO {
  name
  age
  kind
}
`)
    const messages = doc.getDiagMessages()
    const entryErrors = messages.filter(
      m => m.message.includes('Unknown property') || m.message.includes('Unknown identifier')
    )
    expect(entryErrors).toHaveLength(0)
  })

  it('should allow comments after entries', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  firstName: string
  lastName: string
}
annotate User {
  firstName // this is a comment
  lastName
}
`)
    const messages = doc.getDiagMessages()
    const unexpectedErrors = messages.filter(m => m.message.includes('Unexpected'))
    expect(unexpectedErrors).toHaveLength(0)
  })

  it('non-mutating annotate alias resolves like target via unwindType', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  firstName: string
  address: {
    city: string
  }
}
annotate User as UserForm {
  firstName
}
`)
    // UserForm should resolve to the same structure as User
    const userDef = doc.unwindType('User')
    const formDef = doc.unwindType('UserForm')
    expect(userDef?.def.entity).toBe('interface')
    expect(formDef?.def.entity).toBe('interface')
    expect(formDef?.def).toBe(userDef?.def)

    // Chained resolution should also work
    const userCity = doc.unwindType('User', ['address', 'city'])
    const formCity = doc.unwindType('UserForm', ['address', 'city'])
    expect(userCity?.def).toBeDefined()
    expect(formCity?.def).toBeDefined()
    expect(formCity?.def).toBe(userCity?.def)
  })

  it('entry refs are in referred for navigation', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  firstName: string
  address: { city: string }
}
annotate User {
  firstName
  address.city
}
`)
    const referred = doc.referred.map(t => t.text)
    expect(referred).toContain('User')
    expect(referred).toContain('firstName')
    expect(referred).toContain('address')
  })

  it('go-to-definition works for annotate entry identifiers', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  firstName: string
  address: {
    city: string
  }
}
annotate User {
  firstName
}
`)
    // "firstName" entry is at line 8, char 2
    const def = doc.getToDefinitionAt(8, 2)
    expect(def).toBeDefined()
    expect(def![0].targetUri).toBe('test')
    // Should point to the firstName prop definition in User (line 2)
    expect(def![0].targetRange.start.line).toBe(2)
  })

  it('should allow prop-only annotations on annotate block entries', () => {
    const propOnlyAnnotation = new AnnotationSpec({
      nodeType: ['prop'],
      argument: { name: 'value', type: 'string' },
    })
    const doc = new AtscriptDoc('test', {
      primitives,
      annotations: {
        deep: {
          nested: {
            leaf: propOnlyAnnotation,
          },
        },
      },
    })
    doc.update(`
interface User {
  name: string
}
annotate User {
  @deep.nested.leaf 'test'
  name
}
`)
    const messages = doc.getDiagMessages()
    const nodeTypeErrors = messages.filter(m => m.message.includes('applies only to'))
    expect(nodeTypeErrors).toHaveLength(0)
  })

  it('go-to-definition works for annotate entry chain tokens', () => {
    const doc = new AtscriptDoc('test', { primitives })
    doc.update(`
interface User {
  address: {
    city: string
  }
}
annotate User {
  address.city
}
`)
    // "city" chain token is at line 7, around char 10
    const def = doc.getToDefinitionAt(7, 10)
    expect(def).toBeDefined()
    expect(def![0].targetUri).toBe('test')
    // Should point to the city prop definition (line 3)
    expect(def![0].targetRange.start.line).toBe(3)
  })
})
