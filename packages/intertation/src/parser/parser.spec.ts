/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable sonarjs/no-nested-template-literals */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { describe, expect, it } from 'vitest'

import { parseItn } from './pipes'
import type { TGroupedNodes, TTransformedNode } from './types'

describe('parser', () => {
  it('new pipe', () => {
    const { ast, messages } = parseItn(
      `
      type Test = number[][][][]
`,
      undefined,
      true
    )
    console.log(ast.map(n => renderNode(n, 0)).join('\n\n'))
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
  // it('swap handlers', () => {
  //   const parser = new ItnParser()
  //   const nodes = parser.parse(`
  //     public type Type = 333
  //     public type UnionType = string | number

  //     @injectable 'FOR_EVENT', 333
  //     @mongo.collection 'Users'
  //     interface MyInterface {
  //       @label 'My label'
  //       prop1: 1 & 2 | 3 & 4
  //       "text prop": string
  //       nested: {
  //         @label 'My label 2', 123
  //         prop2: string
  //         prop3?: 123
  //       }[] | string
  //     }
  //     `)
  //   console.log(parser.messages)
  //   console.log(nodes.map(n => renderNode(n, 0)).join('\n\n'))
  //   // expect({
  //   //   nodes,
  //   // }).toMatchFileSnapshot('./swap-handlers.json')
  // })
})

function renderNode(n: TTransformedNode | TGroupedNodes, level = 0): string {
  const indent = ' '.repeat(level * 2)
  if (n.isGroup) {
    return `${indent}(\n${n.nodes
      .map(_n => renderNode(_n, level + 2))
      .join(` ${n.operator || ''}\n`)}\n${indent})`
  }
  const a = n.annotations
    ? `${Object.entries(n.annotations)
        .map(
          ([k, v]) =>
            `${indent}${v?.token?.toString() || ''} ${v?.args.map(p => p.toString()).join(', ')}`
        )
        .join('\n')}\n`
    : ''

  const def = n.definition ? renderNode(n.definition, level + 2) : ''
  return `\n${indent}(${Array.from(n.flags.keys()).join('/')})[${n.entity}]\n${a}${indent}${[
    n.type,
    n.name,
    n.token,
  ]
    .filter(Boolean)
    .map(t => t?.toString())
    .join(`\n${indent}`)}${n.definition ? ': ' : ''}${
    n.definition?.isGroup ? `\n${def}` : def || ''
  }`
}
