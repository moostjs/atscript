/* eslint-disable sonarjs/no-duplicate-string */
import { randomBytes } from 'crypto'
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

  it('should imports', () => {
    const doc = new ItnDocument('test', {})
    doc.update(`
      import { foo } from 'bar'
      type Type = foo
      `)
    expect(doc.imports.get('bar')?.from.text).toBe('bar')
    expect(doc.imports.get('bar')?.tokens[0].text).toBe('foo')
    expect(doc.referred).toHaveLength(1)
    expect(doc.referred[0].range).toEqual({
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
    expect(doc.getDefinitionByPos(1, 32)).toEqual({
      uri: 'file-1.itn',
      range: {
        start: {
          line: 0,
          character: 5,
        },
        end: {
          line: 0,
          character: 9,
        },
      },
    })
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
    expect(doc.getDefinitionByPos(1, 32)).toEqual({
      uri: 'file-1.itn',
      range: {
        start: {
          line: 2,
          character: 11,
        },
        end: {
          line: 2,
          character: 15,
        },
      },
    })
    expect(doc.getDefinitionByPos(3, 21)).toEqual({
      uri: 'file-1.itn',
      range: {
        start: {
          line: 1,
          character: 16,
        },
        end: {
          line: 1,
          character: 21,
        },
      },
    })
  })

  it('should return imported definitions', () => {
    const doc1 = new ItnDocument('file:///home/file-1.itn', {})
    const doc2 = new ItnDocument('file:///home/file-2.itn', {})
    doc1.update(`export type Type = string`)
    doc2.update(`import { Type } from './file-1'
      type Type2 = Type
      `)
    doc2.updateDependencies([doc1])
    expect(doc2.getDefinitionByPos(1, 22)).toEqual({
      uri: 'file:///home/file-1.itn',
      range: {
        start: {
          line: 0,
          character: 12,
        },
        end: {
          line: 0,
          character: 16,
        },
      },
    })
  })

  it('should not save definitions to referred array', () => {
    const doc = new ItnDocument('file:///home/file-1.itn', {})
    doc.update(`
      import {TName} from './file-2'
      type TName = 'text'
      interface TName { prop: 'text' }
      `)
    expect(doc.referred).toEqual([])
  })
})
