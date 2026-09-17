import { describe, expect, it } from 'vitest'

import { parseAtscript } from '..'
import { AnnotationSpec } from '../../annotations'
import { AtscriptDoc } from '../../document'
import { tokenize } from '../../tokenizer'
import type { TLexicalToken } from '../../tokenizer/types'
import { SemanticPrimitiveNode } from '../nodes/primitive-node'
import type {
  SemanticQueryComparisonNode,
  SemanticQueryFieldRefNode,
  SemanticQueryLogicalNode,
  SemanticQueryValueNode,
} from '../nodes/query-nodes'

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set('string', new SemanticPrimitiveNode('string', { type: 'string' }))
primitives.set('number', new SemanticPrimitiveNode('number', { type: 'number' }))
primitives.set('boolean', new SemanticPrimitiveNode('boolean', { type: 'boolean' }))

const queryAnnotation = new AnnotationSpec({
  argument: { name: 'filter', type: 'query' },
})

const queryWithRefAnnotation = new AnnotationSpec({
  argument: [
    { name: 'target', type: 'ref' },
    { name: 'condition', type: 'query' },
  ],
})

/**
 * Build a document whose `@some.filter` argument is the given query expression.
 * Types `A` and `B` exist so that qualified refs resolve.
 */
function docWithQuery(expr: string) {
  const doc = new AtscriptDoc('test', {
    primitives,
    annotations: { some: { filter: queryAnnotation } },
  })
  doc.update(`
interface A {
  at: number
  start: number
  end: number
}
interface B {
  at: number
  start: number
  end: number
}
interface User {
  @some.filter \`${expr}\`
  name: string
}
`)
  return doc
}

const filterArg = (doc: AtscriptDoc) => doc.annotations.find(a => a.name === 'some.filter')!.args[0]

const filterExpr = (doc: AtscriptDoc) => filterArg(doc).queryNode!.expression

/**
 * Flatten a token tree, descending into queries and blocks only — leaf tokens
 * carry their own raw text as an "unknown" child by design.
 */
const flatTokens = (t: TLexicalToken): TLexicalToken[] =>
  t.type === 'query' || t.type === 'block' ? [t, ...(t.children ?? []).flatMap(flatTokens)] : [t]

/** Assert that a diagnostic position sits inside the query token it belongs to */
const expectInsideQuery = (position: { line: number; character: number }, doc: AtscriptDoc) => {
  const q = filterArg(doc).range
  expect(position.line).toBe(q.start.line)
  expect(position.character).toBeGreaterThanOrEqual(q.start.character)
  expect(position.character).toBeLessThanOrEqual(q.end.character)
}

describe('query annotation arguments', () => {
  describe('tokenizer', () => {
    it('tokenizes backtick content as query token with children', () => {
      const tokens = tokenize("`status = 'active'`")
      const queryToken = tokens.find(t => t.type === 'query')
      expect(queryToken).toBeDefined()
      expect(queryToken!.children).toBeDefined()
      expect(queryToken!.children!.length).toBeGreaterThan(0)

      const children = queryToken!.children!
      expect(children[0].type).toBe('identifier')
      expect(children[0].text).toBe('status')
      expect(children[1].type).toBe('punctuation')
      expect(children[1].text).toBe('=')
      expect(children[2].type).toBe('text')
      expect(children[2].text).toBe('active')
    })

    it('tokenizes qualified ref inside backticks', () => {
      const tokens = tokenize("`User.status = 'active'`")
      const queryToken = tokens.find(t => t.type === 'query')
      const children = queryToken!.children!
      expect(children[0].type).toBe('identifier')
      expect(children[0].text).toBe('User')
      expect(children[1].type).toBe('punctuation')
      expect(children[1].text).toBe('.')
      expect(children[2].type).toBe('identifier')
      expect(children[2].text).toBe('status')
    })

    it('tokenizes parentheses inside backticks', () => {
      const tokens = tokenize("`role in ('admin', 'user')`")
      const queryToken = tokens.find(t => t.type === 'query')
      const children = queryToken!.children!
      // role, in, (block with children)
      expect(children[0].text).toBe('role')
      expect(children[1].text).toBe('in')
      expect(children[2].type).toBe('block')
      expect(children[2].text).toBe('(')
    })

    it('tokenizes empty backticks', () => {
      const tokens = tokenize('``')
      const queryToken = tokens.find(t => t.type === 'query')
      expect(queryToken).toBeDefined()
      expect(queryToken!.children!.length).toBe(0)
    })

    it('tokenizes number literals in backticks', () => {
      const tokens = tokenize('`age >= 18`')
      const queryToken = tokens.find(t => t.type === 'query')
      const children = queryToken!.children!
      expect(children[0].type).toBe('identifier')
      expect(children[0].text).toBe('age')
      expect(children[1].type).toBe('punctuation')
      expect(children[1].text).toBe('>=')
      expect(children[2].type).toBe('number')
      expect(children[2].text).toBe('18')
    })

    it('tokenizes multi-char symbolic operators', () => {
      const tokens = tokenize('`a != 1`')
      const queryToken = tokens.find(t => t.type === 'query')
      const children = queryToken!.children!
      expect(children[1].type).toBe('punctuation')
      expect(children[1].text).toBe('!=')
    })

    it.each(['=', '!=', '>', '>=', '<', '<='])(
      'tokenizes "%s" as a single operator token inside parentheses',
      op => {
        const tokens = tokenize(`\`(a ${op} b)\``)
        const block = tokens.find(t => t.type === 'query')!.children![0]
        expect(block.type).toBe('block')
        expect(block.text).toBe('(')
        expect(block.children!.map(t => `${t.type}:${t.text}`)).toEqual([
          'identifier:a',
          `punctuation:${op}`,
          'identifier:b',
        ])
      }
    )

    it('tokenizes operators inside nested parentheses', () => {
      const tokens = tokenize('`((a <= 1) or (b >= 2))`')
      const outer = tokens.find(t => t.type === 'query')!.children![0]
      expect(outer.type).toBe('block')
      const [left, or, right] = outer.children!
      expect(left.type).toBe('block')
      expect(left.children!.map(t => t.text)).toEqual(['a', '<=', '1'])
      expect(or.text).toBe('or')
      expect(right.type).toBe('block')
      expect(right.children!.map(t => t.text)).toEqual(['b', '>=', '2'])
    })

    it('emits no unknown tokens for operators inside parentheses', () => {
      const tokens = tokenize('`A.at >= B.start and (B.end = null or A.at <= B.end)`')
      expect(tokens.flatMap(flatTokens).filter(t => t.type === 'unknown')).toEqual([])
    })

    it('leaves "[" and "{" blocks inside queries on the generic block token', () => {
      const tokens = tokenize('`a in [b < c]`')
      const block = tokens.find(t => t.type === 'query')!.children![2]
      expect(block.type).toBe('block')
      expect(block.text).toBe('[')
      // generic block: no query operators, so "<" stays unknown
      expect(block.children!.map(t => `${t.type}:${t.text}`)).toEqual([
        'identifier:b',
        'unknown:<',
        'identifier:c',
      ])
    })

    it('leaves parentheses outside queries on the generic block token', () => {
      const [block] = tokenize('(a < b)')
      expect(block.type).toBe('block')
      expect(block.text).toBe('(')
      expect(block.children!.map(t => `${t.type}:${t.text}`)).toEqual([
        'identifier:a',
        'unknown:<',
        'identifier:b',
      ])
    })
  })

  describe('parser', () => {
    it('parses simple comparison', () => {
      const result = parseAtscript(`
interface User {
  @some.filter \`status = 'active'\`
  name: string
}
`)
      expect(result.messages).toHaveLength(0)
    })

    it('parses query token as annotation argument', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`status = 'active'\`
  name: string
}
`)
      const messages = doc.getDiagMessages()
      const queryErrors = messages.filter(m => m.message.includes('query expression expected'))
      expect(queryErrors).toHaveLength(0)
    })

    it('query annotation builds correct AST for simple comparison', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`status = 'active'\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      expect(queryArg).toBeDefined()
      expect(queryArg!.queryNode).toBeDefined()

      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('=')
      expect(expr.left.typeRef).toBeUndefined() // unqualified
      expect(expr.left.fieldRef.text).toBe('status')
    })

    it('query annotation builds correct AST for qualified ref', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`User.status = 'active'\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.left.typeRef).toBeDefined()
      expect(expr.left.typeRef!.text).toBe('User')
      expect(expr.left.fieldRef.text).toBe('status')
    })

    it('parses AND expression', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`status = 'active' and age >= 18\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      expect(expr.operands).toHaveLength(2)
    })

    it('parses OR expression', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`role = 'admin' or role = 'moderator'\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryLogicalNode
      expect(expr.operator).toBe('or')
      expect(expr.operands).toHaveLength(2)
    })

    it('parses NOT expression', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`not (status = 'banned')\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryLogicalNode
      expect(expr.operator).toBe('not')
      expect(expr.operands).toHaveLength(1)
    })

    it('parses parenthesized subexpression', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`status = 'active' and (plan = 'premium' or role = 'admin')\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      expect(expr.operands).toHaveLength(2)
      const orExpr = expr.operands[1] as SemanticQueryLogicalNode
      expect(orExpr.operator).toBe('or')
      expect(orExpr.operands).toHaveLength(2)
    })

    it('parses in operator with value list', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`role in ('admin', 'moderator')\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('in')
      expect(expr.left.fieldRef.text).toBe('role')
      expect('values' in expr.right!).toBe(true)
    })

    it('parses not in operator with value list', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`role not in ('admin', 'moderator')\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('not in')
      expect(expr.left.fieldRef.text).toBe('role')
      expect('values' in expr.right!).toBe(true)
    })

    it('parses exists operator', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`email exists\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('exists')
      expect(expr.left.fieldRef.text).toBe('email')
      expect(expr.right).toBeUndefined()
    })

    it('parses not exists operator', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`email not exists\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('not exists')
      expect(expr.left.fieldRef.text).toBe('email')
      expect(expr.right).toBeUndefined()
    })

    it('parses matches operator with regex', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`name matches /^admin/i\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('matches')
      expect(expr.left.fieldRef.text).toBe('name')
      expect(expr.right).toBeDefined()
    })

    it('parses != operator', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`status != 'banned'\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('!=')
      expect(expr.left.fieldRef.text).toBe('status')
    })

    it('parses < and <= operators', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`age < 100 and score <= 50\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      const left = expr.operands[0] as SemanticQueryComparisonNode
      const right = expr.operands[1] as SemanticQueryComparisonNode
      expect(left.operator).toBe('<')
      expect(right.operator).toBe('<=')
    })

    it('parses ref-to-ref comparison (join condition)', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { joins: queryWithRefAnnotation } },
      })
      doc.update(`
interface User {
  @some.joins User, \`Order.userId = User.id\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.joins')?.args[1]
      expect(queryArg).toBeDefined()
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('=')
      expect(expr.left.typeRef!.text).toBe('Order')
      expect(expr.left.fieldRef.text).toBe('userId')
      // right is a field ref
      const right = expr.right as import('../nodes/query-nodes').SemanticQueryFieldRefNode
      expect(right.typeRef!.text).toBe('User')
      expect(right.fieldRef.text).toBe('id')
    })

    it('parses flat AND with 3 operands', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`a = 1 and b = 2 and c = 3\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      expect(expr.operands).toHaveLength(3)
    })
  })

  describe('parenthesized expressions', () => {
    it.each(['=', '!=', '>', '>=', '<', '<='])(
      'parses field-to-field "%s" inside parentheses',
      op => {
        const doc = docWithQuery(`A.at = 1 and (A.start ${op} B.end)`)
        expect(doc.getDiagMessages()).toHaveLength(0)
        const expr = filterExpr(doc) as SemanticQueryLogicalNode
        const inner = expr.operands[1] as SemanticQueryComparisonNode
        expect(inner.operator).toBe(op)
        expect(inner.left.typeRef!.text).toBe('A')
        expect(inner.left.fieldRef.text).toBe('start')
        const right = inner.right as SemanticQueryFieldRefNode
        expect(right.typeRef!.text).toBe('B')
        expect(right.fieldRef.text).toBe('end')
      }
    )

    it.each(['=', '!=', '>', '>=', '<', '<='])(
      'parses field-to-value "%s" inside parentheses',
      op => {
        const doc = docWithQuery(`(at ${op} 18)`)
        expect(doc.getDiagMessages()).toHaveLength(0)
        const expr = filterExpr(doc) as SemanticQueryComparisonNode
        expect(expr.operator).toBe(op)
        expect(expr.left.fieldRef.text).toBe('at')
        expect((expr.right as SemanticQueryValueNode).valueToken.text).toBe('18')
      }
    )

    it('parses the join-condition example', () => {
      const doc = docWithQuery('A.at >= B.start and (B.end = null or A.at <= B.end)')
      expect(doc.getDiagMessages()).toHaveLength(0)

      const expr = filterExpr(doc) as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      expect(expr.operands).toHaveLength(2)

      const first = expr.operands[0] as SemanticQueryComparisonNode
      expect(first.operator).toBe('>=')
      expect(first.left.typeRef!.text).toBe('A')
      expect(first.left.fieldRef.text).toBe('at')
      expect((first.right as SemanticQueryFieldRefNode).typeRef!.text).toBe('B')
      expect((first.right as SemanticQueryFieldRefNode).fieldRef.text).toBe('start')

      const or = expr.operands[1] as SemanticQueryLogicalNode
      expect(or.operator).toBe('or')
      expect(or.operands).toHaveLength(2)

      const isNull = or.operands[0] as SemanticQueryComparisonNode
      expect(isNull.operator).toBe('=')
      expect(isNull.left.typeRef!.text).toBe('B')
      expect(isNull.left.fieldRef.text).toBe('end')
      expect((isNull.right as SemanticQueryValueNode).valueToken.text).toBe('null')

      const lte = or.operands[1] as SemanticQueryComparisonNode
      expect(lte.operator).toBe('<=')
      expect(lte.left.typeRef!.text).toBe('A')
      expect(lte.left.fieldRef.text).toBe('at')
      expect((lte.right as SemanticQueryFieldRefNode).fieldRef.text).toBe('end')
    })

    it('parses nested parentheses', () => {
      const doc = docWithQuery('((at < 1 or at > 9) and (start != end))')
      expect(doc.getDiagMessages()).toHaveLength(0)

      const expr = filterExpr(doc) as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      const or = expr.operands[0] as SemanticQueryLogicalNode
      expect(or.operator).toBe('or')
      expect((or.operands[0] as SemanticQueryComparisonNode).operator).toBe('<')
      expect((or.operands[1] as SemanticQueryComparisonNode).operator).toBe('>')
      const neq = expr.operands[1] as SemanticQueryComparisonNode
      expect(neq.operator).toBe('!=')
    })

    it('parentheses override and/or precedence', () => {
      const flat = docWithQuery('at = 1 or at = 2 and start = 3')
      const flatExpr = filterExpr(flat) as SemanticQueryLogicalNode
      expect(flatExpr.operator).toBe('or')
      expect(flatExpr.operands).toHaveLength(2)
      expect((flatExpr.operands[1] as SemanticQueryLogicalNode).operator).toBe('and')

      const grouped = docWithQuery('(at = 1 or at = 2) and start = 3')
      const groupedExpr = filterExpr(grouped) as SemanticQueryLogicalNode
      expect(groupedExpr.operator).toBe('and')
      expect(groupedExpr.operands).toHaveLength(2)
      expect((groupedExpr.operands[0] as SemanticQueryLogicalNode).operator).toBe('or')
    })

    it('parses "not" applied to a parenthesized group with operators', () => {
      const doc = docWithQuery('not (at >= 1 and at <= 9)')
      expect(doc.getDiagMessages()).toHaveLength(0)

      const expr = filterExpr(doc) as SemanticQueryLogicalNode
      expect(expr.operator).toBe('not')
      const and = expr.operands[0] as SemanticQueryLogicalNode
      expect(and.operator).toBe('and')
      expect((and.operands[0] as SemanticQueryComparisonNode).operator).toBe('>=')
      expect((and.operands[1] as SemanticQueryComparisonNode).operator).toBe('<=')
    })

    it('keeps "in (...)" value lists working inside parentheses', () => {
      const doc = docWithQuery('(at in (1, 2) or start not in (3, 4)) and end <= 5')
      expect(doc.getDiagMessages()).toHaveLength(0)

      const expr = filterExpr(doc) as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      const or = expr.operands[0] as SemanticQueryLogicalNode
      const inExpr = or.operands[0] as SemanticQueryComparisonNode
      expect(inExpr.operator).toBe('in')
      expect(
        (inExpr.right as { values: SemanticQueryValueNode[] }).values.map(v => v.valueToken.text)
      ).toEqual(['1', '2'])
      const notInExpr = or.operands[1] as SemanticQueryComparisonNode
      expect(notInExpr.operator).toBe('not in')
      expect(
        (notInExpr.right as { values: SemanticQueryValueNode[] }).values.map(v => v.valueToken.text)
      ).toEqual(['3', '4'])
    })
  })

  describe('diagnostic ranges', () => {
    it('points an error inside parentheses at the offending position', () => {
      const doc = docWithQuery('at = 1 and (start ~ 2)')
      const messages = doc
        .getDiagMessages()
        .filter(m => m.message === 'Expected operator after field reference')
      expect(messages).toHaveLength(1)
      expect(messages[0].range.start.line).toBeGreaterThan(0)
      expectInsideQuery(messages[0].range.start, doc)
      expectInsideQuery(messages[0].range.end, doc)
    })

    it('points a top-level unexpected token at the offending position', () => {
      const doc = docWithQuery('at = 1 ~ start')
      const messages = doc
        .getDiagMessages()
        .filter(m => m.message.startsWith('Unexpected token in query expression'))
      expect(messages).toHaveLength(1)
      expect(messages[0].range.start.line).toBeGreaterThan(0)
      expectInsideQuery(messages[0].range.start, doc)
      expectInsideQuery(messages[0].range.end, doc)
    })

    it('does not throw on an unclosed parenthesis', () => {
      expect(() => docWithQuery('at = 1 and (start < 2').getDiagMessages()).not.toThrow()
    })

    it('falls back to the query token range when nothing better is known', () => {
      const doc = docWithQuery('~')
      const messages = doc.getDiagMessages().filter(m => m.message === 'Expected field reference')
      expect(messages).toHaveLength(1)
      expect(messages[0].range).toEqual(filterArg(doc).range)
    })
  })

  describe('annotation spec validation', () => {
    it('query type accepts query token', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`status = 'active'\`
  name: string
}
`)
      const messages = doc.getDiagMessages()
      const queryErrors = messages.filter(m => m.message.includes('query expression expected'))
      expect(queryErrors).toHaveLength(0)
    })

    it('query type rejects string token', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter 'not a query'
  name: string
}
`)
      const messages = doc.getDiagMessages()
      expect(messages).toContainEqual(
        expect.objectContaining({
          severity: 1,
          message: expect.stringContaining('query expression expected'),
        })
      )
    })

    it('snippet for query type produces backtick placeholder', () => {
      const spec = new AnnotationSpec({
        argument: { name: 'filter', type: 'query' },
      })
      const d = '$'
      expect(spec.argumentsSnippet).toBe(`\`${d}{1:field = value}\``)
    })
  })

  describe('import tracking', () => {
    it('qualified type ref in query is added to doc.referred[]', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  status: string
}
interface Order {
  @some.filter \`User.status = 'active'\`
  name: string
}
`)
      const referred = doc.referred.map(t => t.text)
      expect(referred).toContain('User')
    })

    it('unqualified ref does NOT add to doc.referred[]', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`status = 'active'\`
  name: string
}
`)
      // 'status' is unqualified — should not be in referred
      const referred = doc.referred.map(t => t.text)
      expect(referred).not.toContain('status')
    })

    it('multiple qualified refs in query are all tracked', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface Order {
  @some.filter \`Order.userId = User.id\`
  name: string
}
interface User {
  id: number
}
`)
      const referred = doc.referred.map(t => t.text)
      expect(referred).toContain('Order')
      expect(referred).toContain('User')
    })

    it('type ref tokens are marked as isReference', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`User.status = 'active'\`
  name: string
}
`)
      const userRefs = doc.referred.filter(t => t.text === 'User')
      expect(userRefs.length).toBeGreaterThan(0)
      expect(userRefs[0].isReference).toBe(true)
    })
  })
})
