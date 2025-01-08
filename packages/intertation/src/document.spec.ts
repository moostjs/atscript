import { describe, expect, it } from 'vitest'

import { ItnDocument } from './document'

const abc = ''

describe('document', () => {
  it('should register import', () => {
    const doc = new ItnDocument('test', {})
    doc.update(`import { foo } from 'bar'`)
    expect(doc.imports.get('bar')?.from.text).toBe('bar')
    expect(doc.imports.get('bar')?.tokens[0].text).toBe('foo')
    expect(doc.registry.definitions.has('foo')).toBeTruthy()
  })
  it('should register multiline error', () => {
    const doc = new ItnDocument('test', {})
    doc.update(`type Type = "text
      end"`)
    const mes = doc.getDiagMessages()
    expect(mes).toHaveLength(2)
    expect(mes).toContainEqual(expect.objectContaining({ message: 'Unexpected end of string' }))
  })
})
