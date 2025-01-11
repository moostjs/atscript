import { describe, expect, it } from 'vitest'

import { parseItn } from '..'

describe('refs chain', () => {
  it('dot chain', () => {
    const result = parseItn(`type TypeName = ref1.ref2`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [ref] "ref1".["ref2"]"`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('string chain [""]', () => {
    const result = parseItn(`type TypeName = ref1["ref2"]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [ref] "ref1".["ref2"]"`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('combined dot and string chain [""]', () => {
    const result = parseItn(`type TypeName = ref1.ref2["ref3"]["ref4"].ref5`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [ref] "ref1".["ref2"].["ref3"].["ref4"].["ref5"]"`
    )
    expect(result.messages).toHaveLength(0)
  })

  it('dot chain with Array', () => {
    const result = parseItn(`type TypeName = ref1.ref2[]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [ref] "ref1".["ref2"]"`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('string chain [""] with Array', () => {
    const result = parseItn(`type TypeName = ref1["ref2"][]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [ref] "ref1".["ref2"]"`
    )
    expect(result.messages).toHaveLength(0)
  })
  it('combined dot and string chain [""] with Array', () => {
    const result = parseItn(`type TypeName = ref1.ref2["ref3"]["ref4"].ref5[]`)
    expect(result.toString()).toMatchInlineSnapshot(
      `"● [type] "TypeName" type: type <identifier>: [array] "[": [ref] "ref1".["ref2"].["ref3"].["ref4"].["ref5"]"`
    )
    expect(result.messages).toHaveLength(0)
  })
})
