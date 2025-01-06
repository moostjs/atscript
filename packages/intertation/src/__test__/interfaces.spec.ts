import { describe, expect, it } from 'vitest'

import { parseItn } from '../parser'

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
  it('public interface', () => {
    const result = parseItn(`public interface IName { a: string; b: number }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [interface] "IName" public: public <identifier> type: interface <identifier>
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
