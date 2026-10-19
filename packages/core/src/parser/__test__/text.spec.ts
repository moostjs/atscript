import { describe, expect, it } from 'vitest'

import { parseAtscript } from '..'
import { AtscriptDoc } from '../../document'
import { tokenize } from '../../tokenizer'
import type { SemanticInterfaceNode } from '../nodes/interface-node'

describe('multiline text', () => {
  it('must fail ', () => {
    const result = parseAtscript(`
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

/** Annotation args of prop `p` as `[type, text]`, asserting a clean parse. */
function args(annotation: string) {
  const src = `interface I {\n  ${annotation}\n  p: string\n}`
  const result = parseAtscript(src)
  expect(result.messages).toEqual([])
  const node = result.nodes[0] as SemanticInterfaceNode
  node.registerAtDocument(new AtscriptDoc('1', {}))
  const ann = node.props.get('p')!.annotations![0]
  return ann.args.map(a => [a.type, a.text])
}

/** Top-level `text` token contents of `src`. */
const texts = (src: string) =>
  tokenize(src)
    .filter(t => t.type === 'text')
    .map(t => t.text)

describe('string literal termination (raw content)', () => {
  it('tokenizes top-level strings by backslash-run parity', () => {
    expect(texts('"a\\\\" , "z"')).toEqual(['a\\\\', 'z'])
    expect(texts("'a\\\\' , 'z'")).toEqual(['a\\\\', 'z'])
    expect(texts('"x\\"y"')).toEqual(['x\\"y'])
    expect(texts('"a\\\\\\"b"')).toEqual(['a\\\\\\"b'])
  })

  it('ends a double-quoted string after an escaped backslash', () => {
    expect(args('@a "a\\\\"')).toEqual([['text', 'a\\\\']])
  })

  it('ends a single-quoted string after an escaped backslash', () => {
    expect(args("@a 'a\\\\'")).toEqual([['text', 'a\\\\']])
  })

  it('keeps an escaped quote inside the string, raw', () => {
    expect(args('@a "x\\"y"')).toEqual([['text', 'x\\"y']])
    expect(args("@a 'x\\'y'")).toEqual([['text', "x\\'y"]])
  })

  it('treats an odd backslash run before a quote as an escaped quote', () => {
    expect(args('@a "a\\\\\\"b"')).toEqual([['text', 'a\\\\\\"b']])
  })

  it('splits multiple strings on one annotation', () => {
    expect(args('@a "a\\\\" , "z"')).toEqual([
      ['text', 'a\\\\'],
      ['text', 'z'],
    ])
    expect(args("@a 'a\\\\', \"x\\\"y\", 'q'")).toEqual([
      ['text', 'a\\\\'],
      ['text', 'x\\"y'],
      ['text', 'q'],
    ])
  })

  it('keeps raw regex patterns untouched', () => {
    expect(args("@a '^\\S+$'")).toEqual([['text', '^\\S+$']])
  })

  it('an escaped backslash does not swallow a following comment', () => {
    const src = `interface I {\n  @a "a\\\\" // note "x"\n  p: string\n}`
    const result = parseAtscript(src)
    expect(result.messages).toEqual([])
    const node = result.nodes[0] as SemanticInterfaceNode
    node.registerAtDocument(new AtscriptDoc('1', {}))
    expect(node.props.get('p')!.annotations![0].args.map(a => a.text)).toEqual(['a\\\\'])
  })
})
