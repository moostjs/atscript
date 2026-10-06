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

const unknownTypeErrors = (doc: AtscriptDoc, name: string) =>
  doc.getDiagMessages().filter(m => m.message.includes(name))

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
  describe('imported and unknown targets', () => {
    const config = { primitives, annotations: { some: { ref: refAnnotation } } }
    const importing = (main: string, model = 'export interface Dict {\n  code: string\n}') => {
      const modelDoc = new AtscriptDoc('file:///proj/dict.as', config)
      modelDoc.update(model)
      const mainDoc = new AtscriptDoc('file:///proj/main.as', config)
      mainDoc.update(main)
      mainDoc.updateDependencies([modelDoc])
      return { mainDoc, modelDoc }
    }

    it('a ref arg resolving to an imported type produces no unknown-type diagnostic', () => {
      const { mainDoc } = importing(
        `import { Dict } from './dict'\ninterface Host {\n  @some.ref Dict\n  name: string\n}`
      )
      expect(unknownTypeErrors(mainDoc, 'Dict')).toHaveLength(0)
    })

    it('a ref arg with an unknown name produces a diagnostic', () => {
      const { mainDoc } = importing(`interface Host {\n  @some.ref Missing\n  name: string\n}`)
      expect(unknownTypeErrors(mainDoc, 'Missing').length).toBeGreaterThan(0)
    })

    it('go-to-definition on an imported ref arg lands on the declaring document', () => {
      const { mainDoc, modelDoc } = importing(
        `import { Dict } from './dict'\ninterface Host {\n  @some.ref Dict\n  name: string\n}`
      )
      const result = mainDoc.getToDefinitionAt(2, '  @some.ref Di'.length)
      expect(result).toHaveLength(1)
      expect(result![0].targetUri).toBe(modelDoc.id)
      expect(result![0].targetSelectionRange.start.line).toBe(0)
    })

    it('go-to-definition on a local ref arg lands on the declaration (not on itself)', () => {
      const doc = new AtscriptDoc('test', config)
      doc.update(
        `interface Host {\n  @some.ref Tag\n  name: string\n}\ninterface Tag {\n  id: number\n}`
      )
      const result = doc.getToDefinitionAt(1, '  @some.ref Ta'.length)
      expect(result![0].targetSelectionRange.start.line).toBe(4)
    })

    it('records the declaring document of an annotation (annotationOrigin)', () => {
      const { mainDoc, modelDoc } = importing(
        `import { Dict } from './dict'\ninterface Host {\n  @some.ref Dict\n  name: string\n}`,
        `export interface Dict {\n  @some.ref Dict\n  code: string\n}`
      )
      const own = mainDoc.annotations[0]
      expect(mainDoc.annotationOrigin(own)).toBe(mainDoc)
      expect(modelDoc.annotationOrigin(modelDoc.annotations[0])).toBe(modelDoc)
      // lookup works from any document (annotations keep their declaring doc across refs)
      expect(mainDoc.annotationOrigin(modelDoc.annotations[0])).toBe(modelDoc)
    })
  })
  describe('inside annotate blocks', () => {
    const config = { primitives, annotations: { some: { ref: refAnnotation } } }

    it('a ref arg in an annotate entry resolves as a type, not as a property of the target', () => {
      const doc = new AtscriptDoc('test', config)
      doc.update(
        `interface Dict {\n  code: string\n}\ninterface Host {\n  name: string\n}\nannotate Host {\n  @some.ref Dict\n  name\n}`
      )
      expect(doc.getDiagMessages().filter(m => m.severity === 1)).toEqual([])
    })

    it('an unknown ref arg in an annotate entry reports an unknown identifier', () => {
      const doc = new AtscriptDoc('test', config)
      doc.update(
        `interface Host {\n  name: string\n}\nannotate Host {\n  @some.ref Missing\n  name\n}`
      )
      const messages = doc.getDiagMessages().map(m => m.message)
      expect(messages).toContain('Unknown identifier "Missing"')
      expect(messages.some(m => m.includes('Unknown property'))).toBe(false)
    })

    it('a chain ref arg in an annotate entry is not read as an entry chain', () => {
      const doc = new AtscriptDoc('test', config)
      doc.update(
        `interface Dict {\n  code: string\n}\ninterface Host {\n  name: string\n}\nannotate Host {\n  @some.ref Dict.code\n  name\n}`
      )
      expect(doc.getDiagMessages().filter(m => m.severity === 1)).toEqual([])
    })

    it('annotatedDefinition resolves an annotate entry to the target property type', () => {
      const doc = new AtscriptDoc('test', config)
      doc.update(
        `interface Host {\n  status: 'a' | 'b'\n  name: string\n}\nannotate Host {\n  @some.ref Host\n  status\n}`
      )
      const entry = doc.annotations.find(a => a.name === 'some.ref')!.token.parentNode
      const host = doc.annotatedDefinition(entry)
      expect(host?.def.entity).toBe('group')
      expect(host?.doc).toBe(doc)
    })

    it('annotatedDefinition returns the own definition for an inline prop', () => {
      const doc = new AtscriptDoc('test', config)
      doc.update(`interface Host {\n  @some.ref Host\n  name: string\n}`)
      const prop = doc.annotations[0].token.parentNode
      expect(doc.annotatedDefinition(prop)?.def.entity).toBe('ref')
    })
  })
})
