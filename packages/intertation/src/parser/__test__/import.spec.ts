import { describe, expect, it } from 'vitest'

import { parseItn } from '..'

describe('import', () => {
  it('single imiport', () => {
    const result = parseItn(`import { Type } from './type'`, undefined)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [import] "import" import: { <block> from: from <identifier> path: ./type <text>: [ref] "Type""`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('multiple imiport', () => {
    const result = parseItn(`import { Type1, Type2 } from './type'`, undefined)
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [import] "import" import: { <block> from: from <identifier> path: ./type <text>
        = [group] ""  (
            ● [ref] "Type1" <,>
            ● [ref] "Type2"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
  it('multiple imiports', () => {
    const result = parseItn(
      `
      import { Type1, Type2 } from './type1'
      import { Type3, Type4 } from './type2'
      `,
      undefined
    )
    expect(result.toString()).toMatchInlineSnapshot(`
      "● [import] "import" import: { <block> from: from <identifier> path: ./type1 <text>
        = [group] ""  (
            ● [ref] "Type1" <,>
            ● [ref] "Type2"
          )

      ● [import] "import" import: { <block> from: from <identifier> path: ./type2 <text>
        = [group] ""  (
            ● [ref] "Type3" <,>
            ● [ref] "Type4"
          )
      "
    `)
    expect(result.messages).toHaveLength(0)
  })
})
