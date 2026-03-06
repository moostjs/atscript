import { describe, expect, it } from 'vitest'

import { parseAtscript } from '..'
import { AnnotationSpec } from '../../annotations'
import { AtscriptDoc } from '../../document'
import { tokenize } from '../../tokenizer'
import type { SemanticQueryComparisonNode, SemanticQueryLogicalNode } from '../nodes/query-nodes'
import { SemanticPrimitiveNode } from '../nodes/primitive-node'

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

const stringAnnotation = new AnnotationSpec({
  argument: { name: 'value', type: 'string' },
})

describe('query annotation arguments', () => {
  describe('tokenizer', () => {
    it('tokenizes backtick content as query token with children', () => {
      const tokens = tokenize("`status eq 'active'`")
      const queryToken = tokens.find(t => t.type === 'query')
      expect(queryToken).toBeDefined()
      expect(queryToken!.children).toBeDefined()
      expect(queryToken!.children!.length).toBeGreaterThan(0)

      const children = queryToken!.children!
      expect(children[0].type).toBe('identifier')
      expect(children[0].text).toBe('status')
      expect(children[1].type).toBe('identifier')
      expect(children[1].text).toBe('eq')
      expect(children[2].type).toBe('text')
      expect(children[2].text).toBe('active')
    })

    it('tokenizes qualified ref inside backticks', () => {
      const tokens = tokenize("`User.status eq 'active'`")
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
      const tokens = tokenize('`age gte 18`')
      const queryToken = tokens.find(t => t.type === 'query')
      const children = queryToken!.children!
      expect(children[2].type).toBe('number')
      expect(children[2].text).toBe('18')
    })
  })

  describe('parser', () => {
    it('parses simple comparison', () => {
      const result = parseAtscript(`
interface User {
  @some.filter \`status eq 'active'\`
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
  @some.filter \`status eq 'active'\`
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
  @some.filter \`status eq 'active'\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      expect(queryArg).toBeDefined()
      expect(queryArg!.queryNode).toBeDefined()

      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('eq')
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
  @some.filter \`User.status eq 'active'\`
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
  @some.filter \`status eq 'active' and age gte 18\`
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
  @some.filter \`role eq 'admin' or role eq 'moderator'\`
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
  @some.filter \`not status eq 'banned'\`
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
  @some.filter \`status eq 'active' and (plan eq 'premium' or role eq 'admin')\`
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

    it('parses unary operators (isNull, isNotNull)', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { filter: queryAnnotation } },
      })
      doc.update(`
interface User {
  @some.filter \`email isNotNull\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('isNotNull')
      expect(expr.left.fieldRef.text).toBe('email')
      expect(expr.right).toBeUndefined()
    })

    it('parses ref-to-ref comparison (join condition)', () => {
      const doc = new AtscriptDoc('test', {
        primitives,
        annotations: { some: { joins: queryWithRefAnnotation } },
      })
      doc.update(`
interface User {
  @some.joins User, \`Order.userId eq User.id\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.joins')?.args[1]
      expect(queryArg).toBeDefined()
      const expr = queryArg!.queryNode!.expression as SemanticQueryComparisonNode
      expect(expr.operator).toBe('eq')
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
  @some.filter \`a eq 1 and b eq 2 and c eq 3\`
  name: string
}
`)
      const queryArg = doc.annotations.find(a => a.name === 'some.filter')?.args[0]
      const expr = queryArg!.queryNode!.expression as SemanticQueryLogicalNode
      expect(expr.operator).toBe('and')
      expect(expr.operands).toHaveLength(3)
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
  @some.filter \`status eq 'active'\`
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
      expect(spec.argumentsSnippet).toBe('`${1:field eq value}`')
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
  @some.filter \`User.status eq 'active'\`
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
  @some.filter \`status eq 'active'\`
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
  @some.filter \`Order.userId eq User.id\`
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
  @some.filter \`User.status eq 'active'\`
  name: string
}
`)
      const userRefs = doc.referred.filter(t => t.text === 'User')
      expect(userRefs.length).toBeGreaterThan(0)
      expect(userRefs[0].isReference).toBe(true)
    })
  })
})
