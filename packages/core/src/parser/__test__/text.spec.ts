import { describe, expect, it } from 'vitest'

import { parseAnscript } from '..'

describe('multiline text', () => {
  it('must fail ', () => {
    const result = parseAnscript(`
      type Type = "text
      end"
      `)

    expect(result.messages[0]).toEqual({
      message: 'Unexpected token',
      range: {
        end: {
          character: 9,
          line: 2,
        },
        start: {
          character: 6,
          line: 2,
        },
      },
      severity: 1,
    })
  })
})
