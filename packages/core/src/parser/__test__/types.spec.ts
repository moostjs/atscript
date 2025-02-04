import { describe, expect, it } from 'vitest'

import { parseAnscript } from '..'

describe('types', () => {
  it('simple type', () => {
    const result = parseAnscript(`type TypeName = string`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [ref] "string""`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('export type', () => {
    const result = parseAnscript(`export type TypeName = string`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" export: export <identifier> type: type <identifier>: [ref] "string""`
    )

    expect(result.messages).toHaveLength(0)
  })
  it('type with text', () => {
    const result = parseAnscript(`type TypeName = "text"`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [const] "text""`
    )

    expect(result.messages).toHaveLength(0)
  })
  it('type conjunction', () => {
    const result = parseAnscript(`type TypeName = string | number`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [group] ""  (
            ● [ref] "string" <|>
            ● [ref] "number"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type complex conjunction intersection', () => {
    const result = parseAnscript(`type TypeName = string | number & 'text' | 123`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [group] ""  (
            ● [ref] "string" <|>
            ● [group] ""  (
                ● [ref] "number" <&>
                ● [const] "text"
              ) <|>
            ● [const] "123"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type simple array', () => {
    const result = parseAnscript(`type TypeName = string[]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [ref] "string""`
    )
    expect(result.messages).toHaveLength(0)
  })

  it('type simple array2', () => {
    const result = parseAnscript(`type TypeName = string[][]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [array] "[": [ref] "string""`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('type array of group', () => {
    const result = parseAnscript(`type TypeName = (string | number)[]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>: [array] "["
        = [group] "("  (
            ● [ref] "string" <|>
            ● [ref] "number"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type tuple of single type', () => {
    const result = parseAnscript(`type TypeName = [string]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [tuple] "["  (
            ● [ref] "string"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type tuple of multiple types', () => {
    const result = parseAnscript(`type TypeName = [string | number]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [tuple] "["  (
            ● [ref] "string" <|>
            ● [ref] "number"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type array of tuple', () => {
    const result = parseAnscript(`type TypeName = [string | number][]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>: [array] "["
        = [tuple] "["  (
            ● [ref] "string" <|>
            ● [ref] "number"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type structure', () => {
    const result = parseAnscript(`type TypeName = { a: string, b: number }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [structure] "{"  (
            ● [prop] "a": [ref] "string" <>
            ● [prop] "b": [ref] "number"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type structure conjunction', () => {
    const result = parseAnscript(
      `type TypeName = { a: string, b: number } | {c: boolean; d: string}`
    )
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [group] ""  (
            ● [structure] "{"  (
                ● [prop] "a": [ref] "string" <>
                ● [prop] "b": [ref] "number"
              ) <|>
            ● [structure] "{"  (
                ● [prop] "c": [ref] "boolean" <>
                ● [prop] "d": [ref] "string"
              )
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })

  it('must contain annotations', () => {
    const result = parseAnscript(`@label 'My Type'\ntype TypeName = {
      @label 'A'
      a: string
      @label 'B'
      b: number
    }`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "@label "My Type"
      ● [type] "TypeName" type: type <identifier>
        = [structure] "{"  (
            @label "A"
            ● [prop] "a": [ref] "string" <>
            @label "B"
            ● [prop] "b": [ref] "number"
          )
      "
    `)
  })
})

describe('referred identifiers in type', () => {
  it('must detect referred identifiers', () => {
    const { nodes } = parseAnscript(`type TypeName = ReferredType`)
    expect(nodes[0]?.referredIdentifiers.map(t => t.text)).toEqual(['ReferredType'])
  })
  it('must detect complex referred identifiers', () => {
    const { nodes } = parseAnscript(
      `type TypeName = ReferredType | RefType2 & { prop: string, prop2: "notString" }`
    )
    expect(nodes[0]?.referredIdentifiers.map(t => t.text)).toEqual([
      'ReferredType',
      'RefType2',
      'string',
    ])
  })
})
