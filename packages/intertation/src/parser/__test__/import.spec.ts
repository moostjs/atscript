import { describe, expect, it } from 'vitest'

import { parseItn } from '..'

describe('import', () => {
  it('single import', () => {
    const result = parseItn(`import { Type } from './type'`, undefined)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [import] "import" inner: { <block> from: from <identifier> path: ./type <text>: [ref] "Type""`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('multiple import', () => {
    const result = parseItn(`import { Type1, Type2 } from './type'`, undefined)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [import] "import" inner: { <block> from: from <identifier> path: ./type <text>
        = [group] ""  (
            ● [ref] "Type1" <,>
            ● [ref] "Type2"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
  it('multiple imports', () => {
    const result = parseItn(
      `
      import { Type1, Type2 } from './type1'
      import { Type3, Type4 } from './type2'
      `,
      undefined
    )
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [import] "import" inner: { <block> from: from <identifier> path: ./type1 <text>
        = [group] ""  (
            ● [ref] "Type1" <,>
            ● [ref] "Type2"
          )

      ● [import] "import" inner: { <block> from: from <identifier> path: ./type2 <text>
        = [group] ""  (
            ● [ref] "Type3" <,>
            ● [ref] "Type4"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })

  it('should parse empty import', () => {
    // for autocomplete
    const result = parseItn(`import {  } from './type'`, undefined)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [import] "import" inner: { <block> from: from <identifier> path: ./type <text>
        = [group] ""  (
  
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })

  it('should parse import with comma', () => {
    // for autocomplete
    const result = parseItn(`import { abc,  } from './type'`, undefined)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [import] "import" inner: { <block> from: from <identifier> path: ./type <text>: [ref] "abc""`
    )
  })
})
