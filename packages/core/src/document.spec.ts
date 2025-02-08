// eslint-disable max-lines
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable sonarjs/no-duplicate-string */
import { describe, expect, it } from 'vitest'

import { AnnotationSpec } from './annotations'
import { AtscriptDoc } from './document'
import { SemanticPrimitiveNode } from './parser/nodes/primitive-node'
import type { SemanticStructureNode } from './parser/nodes/structure-node'
import { isGroup, isPrimitive, SemanticGroup, SemanticInterfaceNode } from './parser/nodes'

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set(
  'string',
  new SemanticPrimitiveNode('string', {
    type: 'string',
    extensions: {
      email: {
        type: 'string',
        expect: { pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$' },
      },
    },
  })
)
primitives.set(
  'number',
  new SemanticPrimitiveNode('number', {
    type: 'number',
    extensions: { int: { type: 'number', expect: { int: true } } },
  })
)

describe('document', () => {
  it('should register import', () => {
    const doc = new AtscriptDoc('file:///home/test.as', {})
    doc.update(`import { foo } from 'bar'`)
    expect(doc.imports.get('file:///home/bar.as')?.from.text).toBe('bar')
    expect(doc.imports.get('file:///home/bar.as')?.imports[0].text).toBe('foo')
    expect(doc.registry.definitions.has('foo')).toBeTruthy()
  })

  it('should register multiline error', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`type Type = "text
      end"`)
    const mes = doc.getDiagMessages()
    expect(mes).toHaveLength(2)
    expect(mes).toContainEqual(expect.objectContaining({ message: 'Unexpected end of string' }))
  })

  it('should refer imports', () => {
    const doc = new AtscriptDoc('file:///home/test.as', {})
    doc.update(`
      import { foo } from 'bar'
      type Type = foo
      `)
    expect(doc.imports.get('file:///home/bar.as')?.from.text).toBe('bar')
    expect(doc.imports.get('file:///home/bar.as')?.imports[0].text).toBe('foo')
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
    const doc = new AtscriptDoc('file-1.as', {})
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
        targetUri: 'file-1.as',
        targetRange: resultingRange,
        targetSelectionRange: resultingRange,
      })
    )
  })

  it('should return local definitions 2', () => {
    const doc = new AtscriptDoc('file-1.as', {})
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
        targetUri: 'file-1.as',
        targetRange: resultingRange1,
        targetSelectionRange: resultingRange1,
      })
    )
    expect(doc.getToDefinitionAt(3, 21)?.[0]).toEqual(
      expect.objectContaining({
        targetUri: 'file-1.as',
        targetRange: resultingRange2,
        targetSelectionRange: resultingRange2,
      })
    )
  })

  it('should return imported definitions', () => {
    const doc1 = new AtscriptDoc('file:///home/file-1.as', {})
    const doc2 = new AtscriptDoc('file:///home/file-2.as', {})
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
        targetUri: 'file:///home/file-1.as',
        targetRange: resultingRange,
        targetSelectionRange: resultingRange,
      })
    )
  })

  it('should not save definitions to referred array', () => {
    const doc = new AtscriptDoc('file:///home/file-1.as', {})
    doc.update(`
      import {TName1} from './file-2'
      type TName = 'text'
      interface TName { prop: 'text' }
      `)
    expect(doc.referred).toHaveLength(1)
  })

  it('should provide local usage list', () => {
    const doc = new AtscriptDoc('file:///home/file-1.as', {})
    doc.update(`
      type Type = 'text'
      interface TName { prop: Type }
      `)
    const def = doc.registry.definitions.get('Type')!
    const refs = doc.usageListFor(def)
    expect(refs).toHaveLength(1)
  })

  it('should provide global usage list', () => {
    const doc1 = new AtscriptDoc('file:///home/file-1.as', {})
    const doc2 = new AtscriptDoc('file:///home/file-2.as', {})
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
    const doc = new AtscriptDoc('file:///home/file-1.as', {})
    doc.update(`
      type Type = 'text'
      interface TName { prop: Type }
      `)
    expect(doc.tokensIndex.at(1, 14)).toEqual(expect.objectContaining({ text: 'Type' }))
    expect(doc.tokensIndex.at(1, 14)).toEqual(expect.objectContaining({ text: 'Type' }))
  })

  it('should mark tokens with proper flags', () => {
    const doc = new AtscriptDoc('file:///home/file-1.as', {})
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
    expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', 'Imported')
    expect(doc.tokensIndex.at(...p)).toHaveProperty('imported', true)
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.tokensIndex.at(...p)).toHaveProperty('isReference', true)
    // './file-2'
    p = [1, 35]
    expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', './file-2')
    expect(doc.tokensIndex.at(...p)).toHaveProperty('fromPath', './file-2')
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isReference', true)
    // Type
    p = [2, 14]
    expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', 'Type')
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('exported', true)
    expect(doc.tokensIndex.at(...p)).toHaveProperty('isDefinition', true)
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isReference', true)
    // 'string'
    p = [2, 23]
    expect(doc.tokensIndex.at(...p)).toBeUndefined()
    // Exported
    p = [3, 22]
    expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', 'Exported')
    expect(doc.tokensIndex.at(...p)).toHaveProperty('exported', true)
    expect(doc.tokensIndex.at(...p)).toHaveProperty('isDefinition', true)
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isReference', true)
    // IFace
    p = [4, 19]
    expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', 'IFace')
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('exported', true)
    expect(doc.tokensIndex.at(...p)).toHaveProperty('isDefinition', true)
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isReference', true)
    // >prop<: Type
    // p = [5, 11] // todo: add isProp flag logic
    // expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', 'prop')
    // expect(doc.tokensIndex.at(...p)).not.toHaveProperty('exported', true)
    // expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isDefinition', true)
    // expect(doc.tokensIndex.at(...p)).toHaveProperty('isProp', true)
    // prop: >Type<
    p = [5, 17]
    expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', 'Type')
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('exported', true)
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.tokensIndex.at(...p)).toHaveProperty('isReference', true)
    // prop2: >string<
    p = [6, 17]
    expect(doc.tokensIndex.at(...p)).toHaveProperty('_data.text', 'string')
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('exported', true)
    expect(doc.tokensIndex.at(...p)).not.toHaveProperty('isDefinition', true)
    expect(doc.tokensIndex.at(...p)).toHaveProperty('isReference', true)
  })

  it('should recognize primitives', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {prop: string}`)
    expect(doc.registry.isDefined('string')).toBeTruthy()
  })

  it('should detect duplicate props', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {
        prop: string
        prop: number
      }`)
    expect(doc.getDiagMessages()).toMatchObject([
      {
        severity: 1,
        message: 'Duplicate prop identifier',
        range: {
          start: { character: 8, line: 2 },
          end: { character: 12, line: 2 },
        },
      },
    ])
  })

  it('should register structure block in map', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {
        prop: string
        prop: number
      }`)
    const block = doc.blocksIndex.at(1, 2)
    expect(block).toBeDefined()
    expect(block?.blockType).toBe('structure')
  })

  it('should unwind primitive types', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {
        prop: { nested1: { nested2: string } }
      }`)
    const str = doc.unwindType('string')
    expect(str).toBeDefined()
    expect(str?.def).toBeDefined()
    expect(str?.def.entity).toEqual('primitive')
    const num = doc.unwindType('number')
    expect(num).toBeDefined()
    expect(num?.def).toBeDefined()
    expect(num?.def.entity).toEqual('primitive')
  })

  it('should unwind extended primitive types', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {
        prop: { nested1: { nested2: string } }
      }`)
    const str = doc.unwindType('string', ['email'])
    expect(str).toBeDefined()
    expect(str?.def).toBeDefined()
    expect(str?.def.entity).toEqual('primitive')
    if (isPrimitive(str?.def)) {
      expect(str.def.config.expect).toHaveProperty('pattern')
      expect(str.def.annotations).toHaveLength(1)
      expect(str.def.annotations?.[0]?.name).toBe('expect.pattern')
    }
    const num = doc.unwindType('number', ['int'])
    expect(num).toBeDefined()
    expect(num?.def).toBeDefined()
    expect(num?.def.entity).toEqual('primitive')
    if (isPrimitive(num?.def)) {
      expect(num.def.config.expect).toHaveProperty('int')
      expect(num.def.annotations).toHaveLength(1)
      expect(num.def.annotations?.[0]?.name).toBe('expect.int')
    }
  })

  it('must call unwind watch on every intermediate definition', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {
        prop1: {
          prop2: string.email
        }
      }
      type Type = IFace.prop1.prop2
      interface IFace2 {
        prop: Type
      }  
      `)
    const intermediates = [] as string[]
    const n1 = doc.getDeclarationOwnerNode('Type')!.node!
    console.log('n1', n1.id)
    const unwound = doc.unwindType('IFace2', ['prop'], node => intermediates.push(node.id!))
    expect(unwound?.def?.id).toBe('email')
    expect(intermediates).toEqual(['Type', 'prop2', 'email'])
  })

  it('should unwind interfaces props in simple interface', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {
        prop: { nested1: { nested2: string } }
      }`)
    const prop = doc.unwindType('IFace', ['prop'])?.def
    const nested1 = doc.unwindType('IFace', ['prop', 'nested1'])?.def
    // const nested2 = doc.unwindType('IFace', ['prop', 'nested1', 'nested2'])
    expect(prop).toBeDefined()
    expect(prop!.entity).toBe('structure')
    expect(nested1).toBeDefined()
    expect(nested1!.entity).toBe('structure')
    // expect(nested2).toBeDefined()
  })
  it('should unwind interfaces via type', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace {
        prop: { nested1: { nested2: string } }
      }
      type TFace1 = IFace
      type TFace2 = TFace1`)
    const type = doc.unwindType('TFace2')?.def
    const prop = doc.unwindType('TFace2', ['prop'])?.def
    const nested1 = doc.unwindType('TFace2', ['prop', 'nested1'])?.def
    // const nested2 = doc.unwindType('TFace2', ['prop', 'nested1', 'nested2'])
    expect(type).toBeDefined()
    expect(type!.entity).toBe('interface')
    expect(prop).toBeDefined()
    expect(prop!.entity).toBe('structure')
    expect(nested1).toBeDefined()
    expect(nested1!.entity).toBe('structure')
    // expect(nested2).toBeDefined()
  })
  it('should unwind interfaces with nested interfaces', () => {
    const doc = new AtscriptDoc('file:///home/test.as', { primitives })
    doc.update(`interface IFace1 {
        prop: { nested1: { nested2: string } }
      }
      interface IFace2 {
          prop1: IFace1
          prop2: IFace1.prop
          prop3: IFace1.prop.nested1
          prop4: IFace1.prop.nested1.nested2
        }
      }`)
    const prop1 = doc.unwindType('IFace2', ['prop1'])?.def
    expect(prop1).toBeDefined()
    expect(prop1?.entity).toBe('interface')
    const prop2 = doc.unwindType('IFace2', ['prop2'])?.def
    expect(prop2).toBeDefined()
    expect(prop2?.entity).toBe('structure')
    expect(Array.from((prop2 as SemanticStructureNode).props.keys())).toEqual(['nested1'])
    const prop2Nested = doc.unwindType('IFace2', ['prop2', 'nested1'])?.def
    expect(prop2Nested).toBeDefined()
    expect(prop2Nested?.entity).toBe('structure')
    expect(Array.from((prop2Nested as SemanticStructureNode).props.keys())).toEqual(['nested2'])
    const prop2Nested2 = doc.unwindType('IFace2', ['prop2', 'nested1', 'nested2'])?.def
    expect(prop2Nested2).toBeDefined()
    expect(prop2Nested2?.entity).toBe('primitive')
    expect(prop2Nested2?.id).toBe('string')
    const prop3 = doc.unwindType('IFace2', ['prop3'])?.def
    expect(prop3).toBeDefined()
    expect(prop3?.entity).toBe('structure')
    expect(Array.from((prop3 as SemanticStructureNode).props.keys())).toEqual(['nested2'])
    const prop4 = doc.unwindType('IFace2', ['prop4'])?.def
    expect(prop4).toBeDefined()
    expect(prop4?.entity).toBe('primitive')
    expect(prop4?.id).toBe('string')
  })

  it('should return definition for chained ref level 2', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(
      `
       interface IName { prop: { prop2: string } }
       interface IName2 { prop2: IName.prop.prop2 }
      `
    )
    const resultingRange = {
      start: {
        line: 1,
        character: 33,
      },
      end: {
        line: 1,
        character: 38,
      },
    }
    const def = doc.getToDefinitionAt(2, 47)?.[0]
    expect(def).toEqual(
      expect.objectContaining({
        targetUri: 'file-1.as',
        targetRange: resultingRange,
        targetSelectionRange: resultingRange,
      })
    )
  })

  it('should return definition for chained ref level 1', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(
      `
       interface IName { prop: { prop2: string } }
       interface IName2 { prop2: IName.prop.prop2 }
      `
    )
    const resultingRange = {
      start: {
        line: 1,
        character: 25,
      },
      end: {
        line: 1,
        character: 29,
      },
    }
    const def = doc.getToDefinitionAt(2, 42)?.[0]
    expect(def).toEqual(
      expect.objectContaining({
        targetUri: 'file-1.as',
        targetRange: resultingRange,
        targetSelectionRange: resultingRange,
      })
    )
  })

  it('should resolve annotation spec', () => {
    const doc = new AtscriptDoc('file-1.as', {
      primitives,
      annotations: {
        level1: {
          level2: new AnnotationSpec({}),
        },
      },
    })
    expect(doc.resolveAnnotation('level1.level2')).toBeDefined()
    expect(doc.resolveAnnotation('level1.level2.config')).toBeUndefined()
    expect(doc.resolveAnnotation('level1')).toBeUndefined()
  })

  it('should eval annotations for node', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`
    export interface Contact {
        label: string
        type: ContactType
        value: string
    }

    @label 'Contact Type'
    export type ContactType = 'email' | 'phone'
`)
    const node = doc.nodes[0].getDefinition() as SemanticInterfaceNode
    const typeProp = node.props.get('type')
    expect(typeProp).toBeDefined()
    const annotations = doc.evalAnnotationsForNode(typeProp!)
    expect(annotations).toHaveLength(1)
    expect(annotations![0].name).toBe('label')
    expect(annotations![0].args[0]!.text).toBe('Contact Type')
  })
  it('should eval annotations for node and overwrite it', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`
    export interface Contact {
        label: string
        @label 'New Contact Type'
        type: ContactType
        value: string
    }

    @label 'Contact Type'
    export type ContactType = 'email' | 'phone'
`)
    const node = doc.nodes[0].getDefinition() as SemanticInterfaceNode
    const typeProp = node.props.get('type')
    expect(typeProp).toBeDefined()
    const annotations = doc.evalAnnotationsForNode(typeProp!)
    expect(annotations).toHaveLength(1)
    expect(annotations![0].name).toBe('label')
    expect(annotations![0].args[0]!.text).toBe('New Contact Type')
  })
  it('should merge annotations from primitives', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`
    export interface Contact {
      @expect.maxLength 20
      str: string.email

      @expect.max 5
      num: number.int
    }
`)
    const node = doc.nodes[0].getDefinition() as SemanticInterfaceNode
    const typeProp = node.props.get('str')
    expect(typeProp).toBeDefined()
    const sAnnotations = doc.evalAnnotationsForNode(typeProp!)
    expect(sAnnotations).toHaveLength(2)
    expect(sAnnotations![0].name).toBe('expect.maxLength')
    expect(sAnnotations![0].args[0]!.text).toBe('20')
    expect(sAnnotations![1].name).toBe('expect.pattern')

    const numProp = node.props.get('num')
    expect(numProp).toBeDefined()
    const nAnnotations = doc.evalAnnotationsForNode(numProp!)
    expect(nAnnotations).toHaveLength(2)
    expect(nAnnotations![0].name).toBe('expect.max')
    expect(nAnnotations![0].args[0]!.text).toBe('5')
    expect(nAnnotations![1].name).toBe('expect.int')
  })
})

describe('document/merging intersections', () => {
  it('must merge two structures', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`type MyType = {a: string} & {b: number}`)
    const def = doc.nodes[0].getDefinition()
    expect(isGroup(def)).toBeTruthy()
    expect(doc.mergeIntersection(def as SemanticGroup).toString()).toMatchInlineSnapshot(`
      "
      ● [structure] ""  (
          
          ● [prop] "a": [ref] "string" <>
          
          ● [prop] "b": [ref] "number"
        )"
    `)
  })
  it('must merge two intersected structures', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`type MyType = {a: string; c: string} & {b: number, c: string}`)
    const def = doc.nodes[0].getDefinition()
    expect(isGroup(def)).toBeTruthy()
    expect(doc.mergeIntersection(def as SemanticGroup).toString()).toMatchInlineSnapshot(`
      "
      ● [structure] ""  (
          
          ● [prop] "a": [ref] "string" <>
          
          ● [prop] "c": [ref] "string" <>
          
          ● [prop] "b": [ref] "number"
        )"
    `)
  })
  it('must merge two intersected structures with conflicting prop type', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`type MyType = {a: string; c: string} & {b: number, c: number}`)
    const def = doc.nodes[0].getDefinition()
    expect(isGroup(def)).toBeTruthy()
    expect(doc.mergeIntersection(def as SemanticGroup).toString()).toMatchInlineSnapshot(`
      "
      ● [structure] ""  (
          
          ● [prop] "a": [ref] "string" <>
          
          ● [prop] "c": [ref] "never" <>
          
          ● [prop] "b": [ref] "number"
        )"
    `)
  })
  it('must merge two deep objects', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`type MyType = {a: string; b: { c: number }} & {b: { c: number, d: string }}`)
    const def = doc.nodes[0].getDefinition()
    expect(isGroup(def)).toBeTruthy()
    expect(doc.mergeIntersection(def as SemanticGroup).toString()).toMatchInlineSnapshot(`
      "
      ● [structure] ""  (
          
          ● [prop] "a": [ref] "string" <>
          
          ● [prop] "b"
            
            = [structure] ""  (
                
                ● [prop] "c": [ref] "number" <>
                
                ● [prop] "d": [ref] "string"
              )
          
        )"
    `)
  })
  it('must merge object and non-object', () => {
    const doc = new AtscriptDoc('file-1.as', { primitives })
    doc.update(`type MyType = {a: string } & number`)
    const def = doc.nodes[0].getDefinition()
    expect(isGroup(def)).toBeTruthy()
    expect(doc.mergeIntersection(def as SemanticGroup).toString()).toMatchInlineSnapshot(
      `"● [ref] "never""`
    )
  })
})
