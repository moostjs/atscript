import { describe, expect, it } from 'vitest'

import { parseItn } from '../parser'

describe('types', () => {
  it('simple type', () => {
    const result = parseItn(`type TypeName = string`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [ref] "string""`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('public type', () => {
    const result = parseItn(`public type TypeName = string`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" public: public <identifier> type: type <identifier>: [ref] "string""`
    )

    expect(result.messages).toHaveLength(0)
  })
  it('type with text', () => {
    const result = parseItn(`type TypeName = "text"`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [const] "text""`
    )

    expect(result.messages).toHaveLength(0)
  })
  it('type conjunction', () => {
    const result = parseItn(`type TypeName = string | number`)
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
    const result = parseItn(`type TypeName = string | number & 'text' | 123`)
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
    const result = parseItn(`type TypeName = string[]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [ref] "string""`
    )

    expect(result.messages).toHaveLength(0)
  })
  it('type array of group', () => {
    const result = parseItn(`type TypeName = (string | number)[]`)
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
    const result = parseItn(`type TypeName = [string]`)
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
    const result = parseItn(`type TypeName = [string | number]`)
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
    const result = parseItn(`type TypeName = [string | number][]`)
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
    const result = parseItn(`type TypeName = { a: string, b: number }`)
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
    const result = parseItn(`type TypeName = { a: string, b: number } | {c: boolean; d: string}`)
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
})
