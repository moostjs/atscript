// eslint-disable no-unsafe-optional-chaining
/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'

import { AtscriptDoc } from '../../document'
import { parseAtscript } from '..'
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
})
