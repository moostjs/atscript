/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'

import { AnnotationSpec } from '../../annotations'
import { AtscriptDoc } from '../../document'
import type { TLexicalToken } from '../../tokenizer/types'
import { SemanticPrimitiveNode } from '../nodes/primitive-node'
import type {
  SemanticExprBinaryNode,
  SemanticExprCallNode,
  SemanticExprItemNode,
  SemanticExprNumberNode,
  SemanticExprUnaryNode,
  SemanticQueryComparisonNode,
  SemanticQueryFieldRefNode,
  SemanticQueryValueNode,
} from '../nodes/query-nodes'

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set('string', new SemanticPrimitiveNode('string', { type: 'string' }))
primitives.set('number', new SemanticPrimitiveNode('number', { type: 'number' }))

const annotations = {
  t: {
    calc: new AnnotationSpec({ argument: { name: 'expression', type: 'expr' } }),
    sort: new AnnotationSpec({ argument: { name: 'order', type: 'order' } }),
    where: new AnnotationSpec({ argument: { name: 'filter', type: 'query' } }),
    loose: new AnnotationSpec({ argument: { name: 'label', type: 'string' } }),
  },
}

function docWith(annotation: string, body: string) {
  const doc = new AtscriptDoc('test', { primitives, annotations, unknownAnnotation: 'allow' })
  doc.update(`
interface A {
  a: number
  b: number
  c: number
}
interface User {
  @${annotation} \`${body}\`
  name: string
}
`)
  return doc
}

const argOf = (doc: AtscriptDoc, name: string) =>
  doc.annotations.find(a => a.name === name)!.args[0]

/** Render an expression tree as a fully parenthesized string. */
function show(node: SemanticExprItemNode): string {
  switch (node.entity as string) {
    case 'query-expr-number': {
      return String((node as SemanticExprNumberNode).value)
    }
    case 'query-expr-binary': {
      const b = node as SemanticExprBinaryNode
      return `(${show(b.left)} ${b.op} ${show(b.right)})`
    }
    case 'query-expr-unary': {
      return `(-${show((node as SemanticExprUnaryNode).operand)})`
    }
    case 'query-expr-call': {
      return `coalesce(${(node as SemanticExprCallNode).args.map(show).join(', ')})`
    }
    default: {
      const r = node as SemanticQueryFieldRefNode
      return r.typeRef ? `${r.typeRef.text}.${r.fieldRef.text}` : r.fieldRef.text
    }
  }
}

function expr(body: string) {
  const doc = docWith('t.calc', body)
  const node = argOf(doc, 't.calc').exprNode
  return { doc, node, text: node ? show(node.expression) : undefined }
}

const errors = (doc: AtscriptDoc) => doc.getDiagMessages().filter(m => m.severity === 1)

describe('expr annotation arguments', () => {
  describe('tokenizer', () => {
    const lexed = (tokens: TLexicalToken[]) => tokens.map(t => `${t.type}:${t.text}`)
    const children = (doc: AtscriptDoc, name: string) => lexed(argOf(doc, name).children)

    it('lexes * and - as punctuation inside backticks', () => {
      expect(children(docWith('t.calc', 'a * b - c'), 't.calc')).toEqual([
        'identifier:a',
        'punctuation:*',
        'identifier:b',
        'punctuation:-',
        'identifier:c',
      ])
    })

    it('keeps an adjacent sign on a number', () => {
      expect(children(docWith('t.calc', 'a -5'), 't.calc')).toEqual(['identifier:a', 'number:-5'])
    })

    it('does not lex a / b / c as a regexp', () => {
      expect(children(docWith('t.calc', 'a / b / c'), 't.calc')).toEqual([
        'identifier:a',
        'punctuation:/',
        'identifier:b',
        'punctuation:/',
        'identifier:c',
      ])
    })

    it('still lexes a regexp after matches (also inside parentheses)', () => {
      const doc = docWith('t.where', `(name matches /^a\\/b/i) and a > -5`)
      const block = argOf(doc, 't.where').children[0]
      expect(lexed(block.children!)).toEqual([
        'identifier:name',
        'identifier:matches',
        'regexp:/^a\\/b/i',
      ])
      const cmp = argOf(doc, 't.where').queryNode!.expression as unknown as {
        operands: SemanticQueryComparisonNode[]
      }
      expect((cmp.operands[0].right as SemanticQueryValueNode).valueToken.text).toBe('/^a\\/b/i')
      expect((cmp.operands[1].right as SemanticQueryValueNode).valueToken.text).toBe('-5')
      expect(errors(doc)).toHaveLength(0)
    })

    it('lexes a regexp right after matches without a space (0.1.98 form)', () => {
      const doc = docWith('t.where', 'name matches/^a-b*/i')
      expect(children(doc, 't.where')).toEqual([
        'identifier:name',
        'identifier:matches',
        'regexp:/^a-b*/i',
      ])
      expect(errors(doc)).toHaveLength(0)
    })
  })

  describe('parser', () => {
    it.each([
      ['a + b * c', '(a + (b * c))'],
      ['(a + b) * c', '((a + b) * c)'],
      ['a - b - c', '((a - b) - c)'],
      ['a / b / c', '((a / b) / c)'],
      ['-(a - b) * 2', '((-(a - b)) * 2)'],
      ['a - -1', '(a - -1)'],
      ['- -a', '(-(-a))'],
      ['a -5', '(a - 5)'],
      ['a+1', '(a + 1)'],
      ['a -5 * 2', '(a - (5 * 2))'],
      ['2.5e2 * a', '(250 * a)'],
      ['coalesce(a, 0) * 100 + b', '((coalesce(a, 0) * 100) + b)'],
      ['coalesce(a / b, c, 1)', 'coalesce((a / b), c, 1)'],
      ['A.a + b', '(A.a + b)'],
    ])('parses %s', (body, expected) => {
      const { doc, text } = expr(body)
      expect(errors(doc)).toEqual([])
      expect(text).toBe(expected)
    })

    it('collects field refs in source order', () => {
      const { node } = expr('coalesce(a, b) * c + a')
      expect(node!.fieldRefs().map(r => r.fieldRef.text)).toEqual(['a', 'b', 'c', 'a'])
    })

    it('registers field refs with the argument token', () => {
      const { doc, node } = expr('a + b')
      const arg = argOf(doc, 't.calc')
      expect(node!.fieldRefs().every(r => r.queryArgToken === arg)).toBe(true)
      expect(doc.queryFieldRefs).toHaveLength(2)
    })

    it.each([
      ['a %', 'Unexpected token in expression: "%"'],
      ['a = 1', 'Unexpected token in expression: "="'],
      ['a asc', 'Unexpected token in expression: "asc"'],
      ['a +', 'Expected operand after "+"'],
      ['a * ()', 'Empty parenthesized expression'],
      ['coalesce(a)', 'coalesce() requires at least 2 arguments'],
      ['coalesce()', 'coalesce() requires at least 2 arguments'],
      ["a + 'x'", `Unexpected token in expression: "x"`],
      ['a + null', '"null" is not allowed in an arithmetic expression'],
      ['1e999 * a', 'Number literal "1e999" is out of range'],
      ['a / 1e-400', 'Number literal "1e-400" underflows to 0'],
      [
        'a * 9007199254740993',
        'Number literal "9007199254740993" exceeds the safe integer range (±2^53 - 1)',
      ],
      ['a - -1e16', 'Number literal "-1e16" exceeds the safe integer range (±2^53 - 1)'],
      ['', 'Empty expression'],
    ])('reports %s', (body, message) => {
      const { doc } = expr(body)
      const msgs = errors(doc).map(m => m.message)
      expect(msgs).toContain(message)
      const arg = argOf(doc, 't.calc').range
      for (const m of errors(doc)) {
        expect(m.range.start.line).toBe(arg.start.line)
      }
    })

    it.each([
      ['a * 9007199254740991', '(a * 9007199254740991)'],
      ['a + 0.0e5', '(a + 0)'],
      ['a + 0.000', '(a + 0)'],
      ['a * 1e-300', '(a * 1e-300)'],
    ])('accepts the boundary literal in %s', (body, expected) => {
      const { doc, text } = expr(body)
      expect(errors(doc)).toEqual([])
      expect(text).toBe(expected)
    })

    it('emits no predicate diagnostics for an expr argument', () => {
      const { doc } = expr('openCount * 10 + overdueCount')
      expect(errors(doc)).toEqual([])
      expect(argOf(doc, 't.calc').queryNode).toBeUndefined()
    })
  })

  describe('order lists', () => {
    const order = (body: string) => {
      const doc = docWith('t.sort', body)
      return { doc, node: argOf(doc, 't.sort').orderNode }
    }

    it('parses keys with directions', () => {
      const { doc, node } = order('a, b desc, A.c asc')
      expect(errors(doc)).toEqual([])
      expect(
        node!.items.map(i => `${i.ref.typeRef?.text ?? ''}.${i.ref.fieldRef.text}:${i.desc}`)
      ).toEqual(['.a:false', '.b:true', 'A.c:false'])
      expect(node!.items[1].dirToken?.text).toBe('desc')
      expect(node!.items[0].dirToken).toBeUndefined()
      expect(node!.fieldRefs().map(r => r.fieldRef.text)).toEqual(['a', 'b', 'c'])
    })

    it.each([
      ['a,, b', 'Expected field reference'],
      ['a asc asc', 'Unexpected token in order list: "asc" (expected "," or "asc" / "desc")'],
      ['a b', 'Unexpected token in order list: "b" (expected "," or "asc" / "desc")'],
      ['a,', 'Expected field reference'],
      ['', 'Empty order list'],
    ])('reports %s', (body, message) => {
      expect(errors(order(body).doc).map(m => m.message)).toContain(message)
    })
  })

  describe('parse by argument spec', () => {
    it('keeps query parsing (and its diagnostics) for spec-less backticks', () => {
      const doc = docWith('unknown.thing', 'a +')
      expect(argOf(doc, 'unknown.thing').exprNode).toBeUndefined()
      expect(errors(doc).map(m => m.message)).toContain('Expected operator after field reference')
    })

    it('keeps query parsing for a non-backtick spec type', () => {
      const doc = docWith('t.loose', 'a = 1')
      expect(argOf(doc, 't.loose').queryNode).toBeDefined()
      expect(errors(doc).map(m => m.message)).toEqual(['@t.loose at argument #1: string expected.'])
    })

    it('rejects a non-backtick value for expr and order arguments', () => {
      const doc = new AtscriptDoc('test', { primitives, annotations })
      doc.update(`
interface User {
  @t.calc 'a + b'
  @t.sort 'a'
  name: string
}
`)
      expect(errors(doc).map(m => m.message)).toEqual([
        '@t.calc at argument #1: expression expected (use backticks).',
        '@t.sort at argument #1: order list expected (use backticks).',
      ])
    })

    describe('annotations that are never registered', () => {
      const diag = (source: string) => {
        const doc = new AtscriptDoc('test', { primitives, annotations, unknownAnnotation: 'allow' })
        doc.update(source)
        return errors(doc).map(m => `${m.range.start.line}:${m.message}`)
      }

      it('reports parse errors of a dangling annotation at EOF', () => {
        expect(diag('interface A { a: number }\n@t.where `a =`\n')).toEqual([
          '1:Expected value or field reference after "="',
        ])
      })

      it('reports parse errors of an annotation followed by a syntax error', () => {
        expect(diag('@t.where `a =`\ntype X {\n')).toContain(
          '0:Expected value or field reference after "="'
        )
      })

      it('parses by the argument spec of the dangling annotation', () => {
        expect(diag('interface A { a: number }\n@t.calc `a +`\n')).toContain(
          '1:Expected operand after "+"'
        )
        expect(diag('interface A { a: number }\n@t.calc `a + b`\n')).toEqual([])
        expect(diag('interface A { a: number }\n@unknown.x `a`, `b =`\n')).toEqual([
          '1:Expected operator after field reference',
          '1:Expected value or field reference after "="',
        ])
      })

      it('does not duplicate diagnostics of registered annotations', () => {
        expect(diag('interface A {\n  @t.where `a =`\n  a: number\n}\n')).toEqual([
          '1:Expected value or field reference after "="',
        ])
      })
    })

    it('uses backticks in argument snippets', () => {
      expect(annotations.t.calc.argumentsSnippet).toBe(`\`\${1:field + 1}\``)
      expect(annotations.t.sort.argumentsSnippet).toBe(`\`\${1:field asc}\``)
    })
  })
})
