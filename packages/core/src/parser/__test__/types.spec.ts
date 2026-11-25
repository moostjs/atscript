import { describe, expect, it } from 'vitest'

import { parseAtscript } from '..'

describe('types', () => {
  it('simple type', () => {
    const result = parseAtscript(`type TypeName = string`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [ref] "string""`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('export type', () => {
    const result = parseAtscript(`export type TypeName = string`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" export: export <identifier> type: type <identifier>: [ref] "string""`
    )

    expect(result.messages).toHaveLength(0)
  })
  it('type with text', () => {
    const result = parseAtscript(`type TypeName = "text"`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [const] "text""`
    )

    expect(result.messages).toHaveLength(0)
  })
  it('type conjunction', () => {
    const result = parseAtscript(`type TypeName = string | number`)
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
    const result = parseAtscript(`type TypeName = string | number & 'text' | 123`)
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
  describe('an operator before the first member', () => {
    // Why: one member per line, each line starting with the operator, is the
    // common way to write a long union. The first operator is formatting only,
    // so the tree must equal the tree of the same type written on one line.
    const same = (multiLine: string, oneLine: string) => {
      const result = parseAtscript(multiLine)
      expect(result.messages).toHaveLength(0)
      expect(result.toString()).toBe(parseAtscript(oneLine).toString())
    }

    it('a union with a leading "|"', () => {
      same(`type T =\n  | 'a'\n  | 'b'\n  | 'c'\n`, `type T = 'a' | 'b' | 'c'`)
      same(`type T = | 'a' | 'b'`, `type T = 'a' | 'b'`)
    })

    it('an intersection with a leading "&"', () => {
      same(`type T =\n  & A\n  & B\n`, `type T = A & B`)
    })

    it('one member', () => {
      same(`type T =\n  | 'a'\n`, `type T = 'a'`)
    })

    it('keeps the priority of "&" over "|"', () => {
      same(`type T =\n  | A & B\n  | C\n`, `type T = A & B | C`)
    })

    it('a comment line between the members', () => {
      same(`type T =\n  // first\n  | 'a'\n  // second\n  | 'b'\n`, `type T = 'a' | 'b'`)
    })

    it('a property, followed by another property', () => {
      same(
        `interface I {\n  s:\n    | 'a'\n    | 'b'\n  n?:\n    | A\n    | B\n  z: C\n}`,
        `interface I {\n  s: 'a' | 'b'\n  n?: A | B\n  z: C\n}`
      )
    })

    it('inside a group', () => {
      same(`type T = (\n  | 'a'\n  | 'b'\n)[]`, `type T = ('a' | 'b')[]`)
    })

    it('each tuple element', () => {
      same(`type T = [\n  | 'a'\n  | 'b',\n  | A\n  | B\n]`, `type T = ['a' | 'b', A | B]`)
    })

    it('an operator with nothing after it is an error at the operator', () => {
      for (const [src, character] of [
        [`type T = |`, 9],
        [`type T = | | 'a'`, 9],
        [`type T = |;`, 9],
        [`type T = ( | )`, 11],
      ] as const) {
        const { messages } = parseAtscript(src)
        expect(messages.length).toBeGreaterThan(0)
        expect(messages.map(m => m.range.start.character)).toContain(character)
      }
    })

    it('an operator without a member does not hide the next property', () => {
      const result = parseAtscript(`interface I {\n  s: | ; n: A\n}`)
      expect(result.messages.map(m => m.range.start)).toEqual([{ line: 1, character: 5 }])
      expect(result.toString()).toContain('● [prop] "n": [ref] "A"')
    })

    it('an import list takes no operator', () => {
      expect(parseAtscript(`import { | A } from './x'`).messages.length).toBeGreaterThan(0)
    })

    it('a tuple does not take a leading ","', () => {
      expect(parseAtscript(`type T = [, 'a']`).messages.length).toBeGreaterThan(0)
    })
  })

  it('type simple array', () => {
    const result = parseAtscript(`type TypeName = string[]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [ref] "string""`
    )
    expect(result.messages).toHaveLength(0)
  })

  it('type simple array2', () => {
    const result = parseAtscript(`type TypeName = string[][]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [array] "[": [ref] "string""`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('type array of a literal', () => {
    for (const [src, tree] of [
      [`type T = 'y'[]`, '[array] "[": [const] "y"'],
      [`type T = 1[][]`, '[array] "[": [array] "[": [const] "1"'],
      [`type T = -1.5[]`, '[array] "[": [const] "-1.5"'],
    ]) {
      const result = parseAtscript(src)
      expect(result.toString()).toBe(`● [type] "T" type: type <identifier>: ${tree}`)
      expect(result.messages).toHaveLength(0)
    }
    // like a group of the literal: `('y')[]`
    const result = parseAtscript(`interface I { a?: 'y'[]\n b: 'z' }`)
    expect(result.messages).toHaveLength(0)
    expect(result.toString()).toContain(
      '● [prop] "a" optional: ? <punctuation>: [array] "[": [const] "y"'
    )
    expect(result.toString()).toContain('● [prop] "b": [const] "z"')
  })
  it('array of a literal binds tighter than | and &', () => {
    const result = parseAtscript(`type T = 'a' | 'b'[] | 'c'[] & string[]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "T" type: type <identifier>
        = [group] ""  (
            ● [const] "a" <|>
            ● [array] "[": [const] "b" <|>
            ● [group] ""  (
                ● [array] "[": [const] "c" <&>
                ● [array] "[": [ref] "string"
              )
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
    const tuple = parseAtscript(`type T = ['x'[], 2[]]`)
    expect(tuple.toString()).toMatchInlineSnapshot(`
      "● [type] "T" type: type <identifier>
        = [tuple] "["  (
            ● [array] "[": [const] "x" <,>
            ● [array] "[": [const] "2"
          )
      "
    `)
    expect(tuple.messages).toHaveLength(0)
  })
  it('type array of group', () => {
    const result = parseAtscript(`type TypeName = (string | number)[]`)
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
    const result = parseAtscript(`type TypeName = [string]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [tuple] "["  (
            ● [ref] "string"
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type tuple of one union item', () => {
    const result = parseAtscript(`type TypeName = [string | number]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>
        = [tuple] "["  (
            ● [group] ""  (
                ● [ref] "string" <|>
                ● [ref] "number"
              )
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  // Regression: a one-item tuple / parenthesised group adopted the item's own members.
  it('one-item tuple / group holding a structure or a tuple', () => {
    const result = parseAtscript(
      `type T1 = [{ n: string }]\ntype T2 = [[string, number]]\ntype T3 = ({ n: string })`
    )
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "T1" type: type <identifier>
        = [tuple] "["  (
            ● [structure] "{"  (
                ● [prop] "n": [ref] "string"
              )
          )

      ● [type] "T2" type: type <identifier>
        = [tuple] "["  (
            ● [tuple] "["  (
                ● [ref] "string" <,>
                ● [ref] "number"
              )
          )

      ● [type] "T3" type: type <identifier>
        = [group] "("  (
            ● [structure] "{"  (
                ● [prop] "n": [ref] "string"
              )
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
  it('type array of tuple', () => {
    const result = parseAtscript(`type TypeName = [string | number][]`)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [type] "TypeName" type: type <identifier>: [array] "["
        = [tuple] "["  (
            ● [group] ""  (
                ● [ref] "string" <|>
                ● [ref] "number"
              )
          )
      "
    `)

    expect(result.messages).toHaveLength(0)
  })
  it('type structure', () => {
    const result = parseAtscript(`type TypeName = { a: string, b: number }`)
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
    const result = parseAtscript(
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
    const result = parseAtscript(`@label 'My Type'\ntype TypeName = {
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
    const { nodes } = parseAtscript(`type TypeName = ReferredType`)
    expect(nodes[0]?.referredIdentifiers.map(t => t.text)).toEqual(['ReferredType'])
  })
  it('must detect complex referred identifiers', () => {
    const { nodes } = parseAtscript(
      `type TypeName = ReferredType | RefType2 & { prop: string, prop2: "notString" }`
    )
    expect(nodes[0]?.referredIdentifiers.map(t => t.text)).toEqual([
      'ReferredType',
      'RefType2',
      'string',
    ])
  })
})
