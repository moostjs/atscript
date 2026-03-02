// eslint-disable no-unsafe-optional-chaining
/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'

import { parseAtscript } from '..'
import { AtscriptDoc } from '../../document'
import type { SemanticInterfaceNode } from '../nodes/interface-node'

describe('interfaces', () => {
  it('simple interface', () => {
    const result = parseAtscript(`interface IName { a: string; b: number }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" type: interface <identifier>
        = [structure] "{"  (
            ● [prop] "a": [ref] "string" <>
            ● [prop] "b": [ref] "number"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
  it('export interface', () => {
    const result = parseAtscript(`export interface IName { a: string; b: number }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" export: export <identifier> type: interface <identifier>
        = [structure] "{"  (
            ● [prop] "a": [ref] "string" <>
            ● [prop] "b": [ref] "number"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
  it('interface with optional prop', () => {
    const result = parseAtscript(`interface IName { a: string; b?: number }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" type: interface <identifier>
        = [structure] "{"  (
            ● [prop] "a": [ref] "string" <>
            ● [prop] "b" optional: ? <punctuation>: [ref] "number"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
  it('interface with complex prop type', () => {
    const result = parseAtscript(`interface IName {
        a: string | number
        b: { c: string, d: number }
        c: [string, number]
        d: (string | number)[]
        e: string[]
        f: string | number | { g: string }
        g: { h: string, i: number } | { j: string, k: number }
        l: ({ m: string, n: number } | { o: string, p: number } & (string | number))[]
      }`)
    expect(result.toString()).toMatchSnapshot()
    expect(result.messages).toHaveLength(0)
  })

  it('interface with chains', () => {
    const result = parseAtscript(`interface IName {
        a: ref1.ref2;
        b: ref3["ref4"],
        c: ref5["ref6"]
        d: ref7["ref8"] 
      }`)
    expect(result.toString()).toMatchSnapshot()
    expect(result.messages).toHaveLength(0)
  })

  it('interface with *-wildcard key', () => {
    const result = parseAtscript(`interface IName { [*]: number }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" type: interface <identifier>
        = [structure] "{"  (
            ● [prop] "*": [ref] "number"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })

  it('interface with number consts', () => {
    const result = parseAtscript(`interface IName { a: 1 | 2 }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" type: interface <identifier>
        = [structure] "{"  (
            ● [prop] "a"
              = [group] ""  (
                  ● [const] "1" <|>
                  ● [const] "2"
                )
            
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })

  it('interface with negative number consts', () => {
    const result = parseAtscript(`interface IName { a: 1 | -2 }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" type: interface <identifier>
        = [structure] "{"  (
            ● [prop] "a"
              = [group] ""  (
                  ● [const] "1" <|>
                  ● [const] "-2"
                )
            
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })

  it('interface with regexp pattern key', () => {
    const result = parseAtscript(`interface IName { [/^abcd?$/ui]: number }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" type: interface <identifier>
        = [structure] "{"  (
            ● [prop] "/^abcd?$/ui": [ref] "number"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
})

describe('referred identifiers in interfaces', () => {
  it('must detect referred identifiers', () => {
    const { nodes } = parseAtscript(`interface IName {prop: string}`)
    expect(nodes[0]?.referredIdentifiers.map(t => t.text)).toEqual(['string'])
  })
  it('must detect complex referred identifiers', () => {
    const { nodes } = parseAtscript(
      `interface IName {prop: string, prop2: number | string, prop3: { a: Ref1; b: Ref2 }}`
    )
    expect(nodes[0]?.referredIdentifiers.map(t => t.text)).toEqual([
      'string',
      'number',
      'string',
      'Ref1',
      'Ref2',
    ])
  })
})

describe('nested props and types', () => {
  it('must return nested props', () => {
    const { nodes } = parseAtscript(`interface IName {prop: { nested: string }}`)
    const interfaceNode = nodes[0] as SemanticInterfaceNode
    interfaceNode.registerAtDocument(new AtscriptDoc('1', {}))
    const prop = interfaceNode.props.get('prop')!
    expect(prop).toBeDefined()
    expect(prop.nestedProps).toBeDefined()
    expect(prop.nestedProps?.get('nested')).toBeDefined()
  })
  it('must return deeply nested props', () => {
    const { nodes } = parseAtscript(`interface IName {prop: { nested: { nested2: string } }}`)
    const interfaceNode = nodes[0] as SemanticInterfaceNode
    interfaceNode.registerAtDocument(new AtscriptDoc('1', {}))
    const prop = interfaceNode.props.get('prop')!
    expect(prop).toBeDefined()
    expect(prop.nestedProps).toBeDefined()
    expect(prop.nestedProps?.get('nested')).toBeDefined()
    expect((prop.nestedProps?.get('nested'))!.nestedProps?.get('nested2')).toBeDefined()
  })
  it('must return nested type', () => {
    const { nodes } = parseAtscript(`interface IName {prop: SomeType}`)
    const interfaceNode = nodes[0] as SemanticInterfaceNode
    interfaceNode.registerAtDocument(new AtscriptDoc('1', {}))
    const prop = interfaceNode.props.get('prop')!
    expect(prop).toBeDefined()
    expect(prop.nestedType).toBeDefined()
    expect(prop.nestedType!.entity).toEqual('ref')
    expect(prop.nestedType!.token('identifier')!.text).toEqual('SomeType')
  })
})

describe('interface extends', () => {
  it('single extends', () => {
    const result = parseAtscript(`interface B extends A { c: string }`)
    const node = result.nodes[0] as SemanticInterfaceNode
    node.registerAtDocument(new AtscriptDoc('1', {}))
    expect(node.entity).toBe('interface')
    expect(node.id).toBe('B')
    expect(node.hasExtends).toBe(true)
    expect(node.extendsTokens).toHaveLength(1)
    expect(node.extendsTokens[0].text).toBe('A')
    expect(node.props.get('c')).toBeDefined()
    expect(result.messages).toHaveLength(0)
  })

  it('multiple extends', () => {
    const result = parseAtscript(`interface C extends A, B { d: number }`)
    const node = result.nodes[0] as SemanticInterfaceNode
    node.registerAtDocument(new AtscriptDoc('1', {}))
    expect(node.entity).toBe('interface')
    expect(node.id).toBe('C')
    expect(node.hasExtends).toBe(true)
    expect(node.extendsTokens).toHaveLength(2)
    expect(node.extendsTokens[0].text).toBe('A')
    expect(node.extendsTokens[1].text).toBe('B')
    expect(node.props.get('d')).toBeDefined()
    expect(result.messages).toHaveLength(0)
  })

  it('export interface with extends', () => {
    const result = parseAtscript(`export interface C extends A { x: string }`)
    const node = result.nodes[0] as SemanticInterfaceNode
    expect(node.token('export')?.text).toBe('export')
    expect(node.hasExtends).toBe(true)
    expect(node.extendsTokens[0].text).toBe('A')
    expect(result.messages).toHaveLength(0)
  })

  it('extends with annotations', () => {
    const result = parseAtscript(`
@meta.description 'test'
interface C extends A {
  @meta.label 'name'
  name: string
}`)
    const node = result.nodes[0] as SemanticInterfaceNode
    node.registerAtDocument(new AtscriptDoc('1', {}))
    expect(node.hasExtends).toBe(true)
    expect(node.annotations).toHaveLength(1)
    expect(node.annotations![0].name).toBe('meta.description')
    expect(node.props.get('name')).toBeDefined()
    expect(result.messages).toHaveLength(0)
  })

  it('extends tokens are references', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`
interface A { a: string }
interface B { b: number }
interface C extends A, B { c: boolean }
`)
    const node = doc.nodes[2] as SemanticInterfaceNode
    expect(node.hasExtends).toBe(true)
    // extends tokens should be in referred list
    const referredTexts = doc.referred.map(t => t.text)
    expect(referredTexts).toContain('A')
    expect(referredTexts).toContain('B')
  })

  it('no extends', () => {
    const result = parseAtscript(`interface A { a: string }`)
    const node = result.nodes[0] as SemanticInterfaceNode
    expect(node.hasExtends).toBe(false)
    expect(node.extendsTokens).toHaveLength(0)
    expect(result.messages).toHaveLength(0)
  })

  it('toString shows extends', () => {
    const result = parseAtscript(`interface C extends A, B { x: string }`)
    const node = result.nodes[0] as SemanticInterfaceNode
    expect(node.toString()).toContain('[interface extends A, B]')
  })

  it('resolveInterfaceExtends merges props', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`
interface A { a: string; b: number }
interface B { c: boolean }
interface C extends A, B { d: string }
`)
    const node = doc.nodes[2] as SemanticInterfaceNode
    const resolved = doc.resolveInterfaceExtends(node)
    expect(resolved).toBeDefined()
    expect(resolved!.entity).toBe('structure')
    const props = (resolved as any).props as Map<string, any>
    expect(props.has('a')).toBe(true)
    expect(props.has('b')).toBe(true)
    expect(props.has('c')).toBe(true)
    expect(props.has('d')).toBe(true)
  })

  it('resolveInterfaceExtends own props override parent props', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`
interface A { name: string; age: number }
interface B extends A { name: number }
`)
    const node = doc.nodes[1] as SemanticInterfaceNode
    const resolved = doc.resolveInterfaceExtends(node)
    expect(resolved).toBeDefined()
    const props = (resolved as any).props as Map<string, any>
    expect(props.has('name')).toBe(true)
    expect(props.has('age')).toBe(true)
  })

  it('resolveInterfaceExtends handles chained extends', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`
interface A { a: string }
interface B extends A { b: number }
interface C extends B { c: boolean }
`)
    const node = doc.nodes[2] as SemanticInterfaceNode
    const resolved = doc.resolveInterfaceExtends(node)
    expect(resolved).toBeDefined()
    const props = (resolved as any).props as Map<string, any>
    expect(props.has('a')).toBe(true)
    expect(props.has('b')).toBe(true)
    expect(props.has('c')).toBe(true)
  })

  it('resolveInterfaceExtends handles circular extends gracefully', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`
interface A extends B { a: string }
interface B extends A { b: number }
`)
    const node = doc.nodes[0] as SemanticInterfaceNode
    // Should not throw, just return what it can
    const resolved = doc.resolveInterfaceExtends(node)
    expect(resolved).toBeDefined()
  })

  it('self-extends reports diagnostic error', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`interface B extends B { f2: number }`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({
        severity: 1,
        message: 'Interface "B" cannot extend itself',
      })
    )
  })

  it('prop override in extends reports diagnostic error', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`
interface A { f1: string }
export interface B extends A {
  f1: number
  f2: number
}`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({
        severity: 1,
        message: 'Property "f1" already exists in parent "A" — override in extends is not allowed',
      })
    )
    // f2 should NOT be flagged
    expect(messages).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('"f2"'),
      })
    )
  })

  it('prop override from chained extends reports diagnostic error', () => {
    const doc = new AtscriptDoc('test', {})
    doc.update(`
interface A { x: string }
interface B extends A { y: number }
interface C extends B { x: boolean }`)
    const messages = doc.getDiagMessages()
    expect(messages).toContainEqual(
      expect.objectContaining({
        severity: 1,
        message: 'Property "x" already exists in parent "B" — override in extends is not allowed',
      })
    )
  })
})
