/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable sonarjs/no-nested-template-literals */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { describe, expect, it } from 'vitest'

import { SemanticNode } from './nodes'
import { parseItn } from './pipes'

describe('parser', () => {
  it('new pipe', () => {
    const { ast, messages } = parseItn(
      `
 type t1 = [a | b][]

@annotation 'text', 123, , 'fasdf'
@annotation1 'text', 123, , 'fasdf'
interface t {
@label 1
@label 2
      a: [number | string][]
      true
      b: false
}
`,
      undefined,
      true
    )
    console.log(JSON.stringify(ast, null, 2))
    console.log(ast.map(n => n.toString()).join('\n'))
    console.log(
      messages
        .map(
          m => `${m.message}
          parser.spec.ts:${m.range.start.line + 13}:${m.range.start.character + 1}
          parser.spec.ts:${m.range.end.line + 13}:${m.range.end.character + 1}`
        )
        .join('\n')
    )
  })
})
