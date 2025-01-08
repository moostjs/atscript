import { describe, expect, it } from 'vitest'

import { ItnDocument } from './document'

describe('document', () => {
  it('should register import', () => {
    const doc = new ItnDocument('test', {})
    doc.update(`import { foo } from 'bar'`)
    expect(doc.imports.get('bar')?.from.text).toBe('bar')
    expect(doc.imports.get('bar')?.tokens[0].text).toBe('foo')
    expect(doc.registry.definitions.has('foo')).toBeTruthy()
  })
})
