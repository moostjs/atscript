import { describe, expect, it } from 'vitest'

import { parseAtscript } from '..'
import { AnnotationSpec } from '../../annotations'
import { AtscriptDoc } from '../../document'
import { SemanticPrimitiveNode } from '../nodes/primitive-node'

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set('string', new SemanticPrimitiveNode('string', { type: 'string' }))
primitives.set('number', new SemanticPrimitiveNode('number', { type: 'number' }))
primitives.set('boolean', new SemanticPrimitiveNode('boolean', { type: 'boolean' }))

const refAnnotation = new AnnotationSpec({
  argument: { name: 'target', type: 'ref' },
})

const stringAnnotation = new AnnotationSpec({
  argument: { name: 'value', type: 'string' },
})

describe('ref annotation arguments', () => {
  describe('parser', () => {
    it('parses simple identifier as annotation argument', () => {
      const result = parseAtscript(`
interface User {
  @some.ref PostTag
  name: string
}
`)
      expect(result.messages).toHaveLength(0)
      const node = result.nodes[0]
      // The annotation arg should exist as an identifier
      // Find the annotation on the prop
      expect(result.toString()).toContain('PostTag')
    })

    it('parses chain ref as annotation argument', () => {
      const result = parseAtscript(`
interface Order {
  @some.ref User.status
  name: string
}
`)
      expect(result.messages).toHaveLength(0)
      expect(result.toString()).toContain('User.status')
    })

    it('parses multi-hop chain ref as annotation argument', () => {
      const result = parseAtscript(`
interface Order {
  @some.ref User.address.city
  name: string
}
`)
      expect(result.messages).toHaveLength(0)
      expect(result.toString()).toContain('User.address.city')
    })

    it('boolean keywords still match before unrestricted identifier', () => {
      const result = parseAtscript(`
interface Order {
  @some.flag true
  name: string
}
`)
      expect(result.messages).toHaveLength(0)
      // 'true' should be parsed as an identifier with text 'true' (boolean keyword)
      expect(result.toString()).toContain('true')
    })
  })

  describe('annotation spec validation', () => {
    it('ref type accepts identifier token', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { ref: refAnnotation } },
      })
      doc.update(`
interface User {
  @some.ref PostTag
  name: string
}
interface PostTag {
  id: number
}
`)
      const messages = doc.getDiagMessages()
      const refErrors = messages.filter(m => m.message.includes('type reference expected'))
      expect(refErrors).toHaveLength(0)
    })

    it('ref type rejects string token', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { ref: refAnnotation } },
      })
      doc.update(`
interface User {
  @some.ref 'PostTag'
  name: string
}
`)
      const messages = doc.getDiagMessages()
      expect(messages).toContainEqual(
        expect.objectContaining({
          severity: 1,
          message: expect.stringContaining('type reference expected'),
        })
      )
    })

    it('ref type rejects number token', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { ref: refAnnotation } },
      })
      doc.update(`
interface User {
  @some.ref 42
  name: string
}
`)
      const messages = doc.getDiagMessages()
      expect(messages).toContainEqual(
        expect.objectContaining({
          severity: 1,
          message: expect.stringContaining('type reference expected'),
        })
      )
    })

    it('snippet for ref type produces bare placeholder', () => {
      const spec = new AnnotationSpec({
        argument: { name: 'target', type: 'ref' },
      })
      const d = '$'
      expect(spec.argumentsSnippet).toBe(`${d}{1:TypeName}`)
    })

    it('snippet for ref type with multiple args', () => {
      const spec = new AnnotationSpec({
        argument: [
          { name: 'target', type: 'ref' },
          { name: 'label', type: 'string' },
        ],
      })
      const d = '$'
      expect(spec.argumentsSnippet).toBe(`${d}{1:TypeName}, '${d}{2:label}'`)
    })
  })

  describe('import tracking', () => {
    it('ref arg identifier is added to doc.referred[]', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { ref: refAnnotation } },
      })
      doc.update(`
interface User {
  @some.ref PostTag
  name: string
}
interface PostTag {
  id: number
}
`)
      const referred = doc.referred.map(t => t.text)
      expect(referred).toContain('PostTag')
    })

    it('string arg is NOT added to doc.referred[]', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { label: stringAnnotation } },
      })
      doc.update(`
interface User {
  @some.label 'hello'
  name: string
}
`)
      const referred = doc.referred.map(t => t.text)
      expect(referred).not.toContain('hello')
    })

    it('chain ref pushes type-name part to referred[]', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { ref: refAnnotation } },
      })
      doc.update(`
interface User {
  status: string
}
interface Order {
  @some.ref User.status
  name: string
}
`)
      const referred = doc.referred.map(t => t.text)
      // Should contain 'User' (the type name), not 'User.status'
      expect(referred).toContain('User')
    })

    it('ref arg is marked as isReference', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { ref: refAnnotation } },
      })
      doc.update(`
interface User {
  @some.ref PostTag
  name: string
}
interface PostTag {
  id: number
}
`)
      const refTokens = doc.referred.filter(t => t.text === 'PostTag')
      expect(refTokens.length).toBeGreaterThan(0)
      expect(refTokens[0].isReference).toBe(true)
    })
  })
})
