/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable sonarjs/no-duplicate-string */
import { randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'

import { ItnDocument } from './document'

const abc = ''

describe('document', () => {
  it('should register import', () => {
    const doc = new ItnDocument('file:///home/test.itn', {})
    doc.update(`import { foo } from 'bar'`)
    expect(doc.imports.get('file:///home/bar.itn')?.from.text).toBe('bar')
    expect(doc.imports.get('file:///home/bar.itn')?.imports[0].text).toBe('foo')
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

  it('should refer imports', () => {
    const doc = new ItnDocument('file:///home/test.itn', {})
    doc.update(`
      import { foo } from 'bar'
      type Type = foo
      `)
    expect(doc.imports.get('file:///home/bar.itn')?.from.text).toBe('bar')
    expect(doc.imports.get('file:///home/bar.itn')?.imports[0].text).toBe('foo')
    expect(doc.referred).toHaveLength(2)
    expect(doc.referred[1].range).toEqual({
      start: {
        line: 2,
        character: 18,
      },
      end: {
        line: 2,
        character: 21,
      },
    })
  })

  it('should return local definitions 1', () => {
    const doc = new ItnDocument('file-1.itn', {})
    doc.update(
      `type Type = string
      interface IName { prop: Type }`
    )
    const resultingRange = {
      start: {
        line: 0,
        character: 5,
      },
      end: {
        line: 0,
        character: 9,
      },
    }
    expect(doc.getToDefinitionAt(1, 32)?.[0]).toEqual(
      expect.objectContaining({
        targetUri: 'file-1.itn',
        targetRange: resultingRange,
        targetSelectionRange: resultingRange,
      })
    )
  })

  it('should return local definitions 2', () => {
    const doc = new ItnDocument('file-1.itn', {})
    doc.update(
      `
      interface IName { prop: Type }
      type Type = string
      type Type2 = IName
      `
    )
    const resultingRange1 = {
      start: {
        line: 2,
        character: 11,
      },
      end: {
        line: 2,
        character: 15,
      },
    }
    const resultingRange2 = {
      start: {
        line: 1,
        character: 16,
      },
      end: {
        line: 1,
        character: 21,
      },
    }
    expect(doc.getToDefinitionAt(1, 32)?.[0]).toEqual(
      expect.objectContaining({
        targetUri: 'file-1.itn',
        targetRange: resultingRange1,
        targetSelectionRange: resultingRange1,
      })
    )
    expect(doc.getToDefinitionAt(3, 21)?.[0]).toEqual(
      expect.objectContaining({
        targetUri: 'file-1.itn',
        targetRange: resultingRange2,
        targetSelectionRange: resultingRange2,
      })
    )
  })

  it('should return imported definitions', () => {
    const doc1 = new ItnDocument('file:///home/file-1.itn', {})
    const doc2 = new ItnDocument('file:///home/file-2.itn', {})
    doc1.update(`export type Type = string`)
    doc2.update(`import { Type } from './file-1'
      type Type2 = Type
      `)
    doc2.updateDependencies([doc1])
    const resultingRange = {
      start: {
        line: 0,
        character: 12,
      },
      end: {
        line: 0,
        character: 16,
      },
    }
    expect(doc2.getToDefinitionAt(1, 22)?.[0]).toEqual(
      expect.objectContaining({
        targetUri: 'file:///home/file-1.itn',
        targetRange: resultingRange,
        targetSelectionRange: resultingRange,
      })
    )
  })

  it('should not save definitions to referred array', () => {
    const doc = new ItnDocument('file:///home/file-1.itn', {})
    doc.update(`
      import {TName1} from './file-2'
      type TName = 'text'
      interface TName { prop: 'text' }
      `)
    expect(doc.referred).toHaveLength(1)
  })

  it('should provide local usage list', () => {
    const doc = new ItnDocument('file:///home/file-1.itn', {})
    doc.update(`
      type Type = 'text'
      interface TName { prop: Type }
      `)
    const def = doc.registry.definitions.get('Type')!
    const refs = doc.usageListFor(def)
    expect(refs).toHaveLength(1)
  })

  it('should provide global usage list', () => {
    const doc1 = new ItnDocument('file:///home/file-1.itn', {})
    const doc2 = new ItnDocument('file:///home/file-2.itn', {})
    doc1.update(`export type Type = 'text'`)
    doc2.update(`import {Type} from './file-1'
      type Type2 = Type
      interface IFace { prop: Type }
      `)
    doc2.updateDependencies([doc1])
    const def = doc1.registry.definitions.get('Type')!
    const refs = doc2.usageListFor(def)
    expect(refs).toHaveLength(3)
  })

  it('should return def token at pos', () => {
    const doc = new ItnDocument('file:///home/file-1.itn', {})
    doc.update(`
      type Type = 'text'
      interface TName { prop: Type }
      `)
    expect(doc.getTokenAt(1, 14)).toEqual(expect.objectContaining({ text: 'Type' }))
    expect(doc.getTokenAt(1, 14)).toEqual(expect.objectContaining({ text: 'Type' }))
  })

  it('should mark tokens with proper flags', () => {
    const doc = new ItnDocument('file:///home/file-1.itn', {})
    doc.update(`
      import { Imported } from './file-2'
      type Type = 'string'
      export type Exported = Imported
      interface IFace { 
        prop: Type
        prop2: string
      }
      `)
    // Imported
    let p = [1, 20] as [number, number]
    expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', 'Imported')
    expect(doc.getTokenAt(...p)).toHaveProperty('imported', true)
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.getTokenAt(...p)).toHaveProperty('isReference', true)
    // './file-2'
    p = [1, 35]
    expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', './file-2')
    expect(doc.getTokenAt(...p)).toHaveProperty('fromPath', './file-2')
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isReference', true)
    // Type
    p = [2, 14]
    expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', 'Type')
    expect(doc.getTokenAt(...p)).not.toHaveProperty('exported', true)
    expect(doc.getTokenAt(...p)).toHaveProperty('isDefinition', true)
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isReference', true)
    // 'string'
    p = [2, 23]
    expect(doc.getTokenAt(...p)).toBeUndefined()
    // Exported
    p = [3, 22]
    expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', 'Exported')
    expect(doc.getTokenAt(...p)).toHaveProperty('exported', true)
    expect(doc.getTokenAt(...p)).toHaveProperty('isDefinition', true)
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isReference', true)
    // IFace
    p = [4, 19]
    expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', 'IFace')
    expect(doc.getTokenAt(...p)).not.toHaveProperty('exported', true)
    expect(doc.getTokenAt(...p)).toHaveProperty('isDefinition', true)
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isReference', true)
    // >prop<: Type
    // p = [5, 11] // todo: add isProp flag logic
    // expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', 'prop')
    // expect(doc.getTokenAt(...p)).not.toHaveProperty('exported', true)
    // expect(doc.getTokenAt(...p)).not.toHaveProperty('isDefinition', true)
    // expect(doc.getTokenAt(...p)).toHaveProperty('isProp', true)
    // prop: >Type<
    p = [5, 17]
    expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', 'Type')
    expect(doc.getTokenAt(...p)).not.toHaveProperty('exported', true)
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.getTokenAt(...p)).toHaveProperty('isReference', true)
    // prop2: >string<
    p = [6, 17]
    expect(doc.getTokenAt(...p)).toHaveProperty('_data.text', 'string')
    expect(doc.getTokenAt(...p)).not.toHaveProperty('exported', true)
    expect(doc.getTokenAt(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.getTokenAt(...p)).toHaveProperty('isReference', true)
  })
})
