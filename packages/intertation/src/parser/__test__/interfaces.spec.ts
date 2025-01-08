import { describe, expect, it } from 'vitest'

import { parseItn } from '..'

describe('interfaces', () => {
  it('simple interface', () => {
    const result = parseItn(`interface IName { a: string; b: number }`)
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
    const result = parseItn(`export interface IName { a: string; b: number }`)
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
    const result = parseItn(`interface IName { a: string; b?: number }`)
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
    const result = parseItn(`interface IName {
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
})

describe('referred identifiers in interfaces', () => {
  it('must detect referred identifiers', () => {
    const { nodes } = parseItn(`interface IName {prop: string}`)
    expect(nodes[0]?.referredIdentifiers.map(t => t.text)).toEqual(['string'])
  })
  it('must detect complex referred identifiers', () => {
    const { nodes } = parseItn(
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
