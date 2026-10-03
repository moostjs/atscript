/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'

import { AnnotationSpec } from '../annotations'
import { AtscriptDoc } from '../document'
import { SemanticPrimitiveNode } from '../parser/nodes/primitive-node'
import {
  analyzeQueryCursorContext,
  getFieldsForType,
  getQueryScope,
  resolveFieldRefAt,
} from './field-refs'

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set('string', new SemanticPrimitiveNode('string', { type: 'string' }))
primitives.set('number', new SemanticPrimitiveNode('number', { type: 'number' }))

const TYPES = `
interface Order {
  id: number
  amount: number
  address: {
    city: string
  }
}

interface Customer {
  name: string
}
`

function createDoc(
  body: string,
  annotations: Record<string, unknown>,
  uri = 'file:///home/test.as'
): AtscriptDoc {
  const doc = new AtscriptDoc(uri, { primitives, annotations: annotations as any })
  doc.update(`${TYPES}${body}`)
  return doc
}

/** Position of `needle` (plus `shift` chars) in the document text */
function posOf(doc: AtscriptDoc, needle: string, shift = 0) {
  const index = doc.text.indexOf(needle)
  expect(index).toBeGreaterThanOrEqual(0)
  const before = doc.text.slice(0, index + shift)
  const line = before.split('\n').length - 1
  const character = before.length - before.lastIndexOf('\n') - 1
  return { line, character }
}

function queryArg(doc: AtscriptDoc, name: string) {
  return doc.annotations.find(a => a.name === name)!.args.find(a => a.type === 'query')!
}

const orderScope = { allowedTypes: ['Order', 'Customer'], unqualifiedTarget: 'Order' }

describe('plugin-owned LSP scopes', () => {
  describe('fieldScope on query arguments', () => {
    it('resolves the query scope through the argument hook', () => {
      const fieldScope = vi.fn(() => orderScope)
      const doc = createDoc(
        `
interface Report {
  @test.where \`amount > 5 and Customer.name = 'x'\`
  total: number
}
`,
        {
          test: {
            where: new AnnotationSpec({ argument: { name: 'filter', type: 'query', fieldScope } }),
          },
        }
      )
      const arg = queryArg(doc, 'test.where')
      expect(getQueryScope(arg, doc)).toEqual(orderScope)
      expect(fieldScope).toHaveBeenCalledWith(arg, doc)
    })

    it('lets the hook override the built-in rules for the same annotation name', () => {
      const doc = createDoc(
        `
@db.view.for Order
interface Report {
  @db.view.filter \`amount > 5\`
  total: number
}
`,
        {
          db: {
            view: {
              for: new AnnotationSpec({ argument: { name: 'entry', type: 'ref' } }),
              filter: new AnnotationSpec({
                argument: { name: 'filter', type: 'query', fieldScope: () => undefined },
              }),
            },
          },
        }
      )
      expect(getQueryScope(queryArg(doc, 'db.view.filter'), doc)).toBeUndefined()
    })

    it('falls back to the built-in rules when the argument declares no hook', () => {
      const doc = createDoc(
        `
@db.view.for Order
@db.view.filter \`amount > 5\`
@db.view.joins Customer, \`Customer.name = Order.id\`
interface Report {
  total: number
}
`,
        {
          db: {
            view: {
              for: new AnnotationSpec({ argument: { name: 'entry', type: 'ref' } }),
              filter: new AnnotationSpec({ argument: { name: 'filter', type: 'query' } }),
              joins: new AnnotationSpec({
                multiple: true,
                argument: [
                  { name: 'target', type: 'ref' },
                  { name: 'condition', type: 'query' },
                ],
              }),
            },
          },
        }
      )
      expect(getQueryScope(queryArg(doc, 'db.view.filter'), doc)).toEqual({
        allowedTypes: ['Order', 'Customer'],
        unqualifiedTarget: 'Order',
      })
      expect(getQueryScope(queryArg(doc, 'db.view.joins'), doc)).toEqual({
        allowedTypes: ['Customer', 'Order'],
        unqualifiedTarget: 'Order',
      })
    })

    it('returns no scope for an unknown annotation without a hook', () => {
      const doc = createDoc(
        `
interface Report {
  @test.where \`amount > 5\`
  total: number
}
`,
        { test: { where: new AnnotationSpec({ argument: { name: 'filter', type: 'query' } }) } }
      )
      expect(getQueryScope(queryArg(doc, 'test.where'), doc)).toBeUndefined()
    })

    it('drives go-to-definition and find-references of query field refs', () => {
      const doc = createDoc(
        `
interface Report {
  @test.where \`amount > 5 and Customer.name = 'x'\`
  total: number
}
`,
        {
          test: {
            where: new AnnotationSpec({
              argument: { name: 'filter', type: 'query', fieldScope: () => orderScope },
            }),
          },
        }
      )
      // an unqualified field ref resolves against the hook's `unqualifiedTarget`
      const amountDef = posOf(doc, 'amount: number')
      const unqualified = posOf(doc, 'amount > 5', 1)
      expect(
        doc.getToDefinitionAt(unqualified.line, unqualified.character)?.[0].targetSelectionRange
          .start
      ).toEqual(amountDef)

      const usages = doc.getUsageListAt(amountDef.line, amountDef.character)
      expect(usages?.map(u => u.range.start)).toEqual([posOf(doc, 'amount > 5')])
    })
  })

  describe('fieldScope on expr and order arguments', () => {
    const exprOrderAnnotations = {
      test: {
        calc: new AnnotationSpec({
          argument: { name: 'expression', type: 'expr', fieldScope: () => orderScope },
        }),
        sort: new AnnotationSpec({
          argument: { name: 'order', type: 'order', fieldScope: () => orderScope },
        }),
      },
    }
    const body = `
interface Report {
  @test.calc \`coalesce(amount, 0) * 2 + id\`
  @test.sort \`id desc, Order.amount\`
  total: number
}
`

    it('resolves an expr leaf and an order key to the property', () => {
      const doc = createDoc(body, exprOrderAnnotations)
      const amountDef = posOf(doc, 'amount: number')
      const inExpr = posOf(doc, 'amount, 0', 1)
      expect(
        doc.getToDefinitionAt(inExpr.line, inExpr.character)?.[0].targetSelectionRange.start
      ).toEqual(amountDef)
      const inOrder = posOf(doc, 'Order.amount', 'Order.'.length + 1)
      expect(
        doc.getToDefinitionAt(inOrder.line, inOrder.character)?.[0].targetSelectionRange.start
      ).toEqual(amountDef)
      const token = doc.tokensIndex.at(inExpr.line, inExpr.character)!
      expect(resolveFieldRefAt(token, doc)?.prop.id).toBe('amount')
    })

    it('lists expr leaves and order keys among the references of the property', () => {
      const doc = createDoc(body, exprOrderAnnotations)
      const idDef = posOf(doc, 'id: number')
      const usages = doc.getUsageListAt(idDef.line, idDef.character)
      expect(usages?.map(u => u.range.start)).toEqual([posOf(doc, 'id`'), posOf(doc, 'id desc')])
    })
  })

  describe('cursor context by argument mode', () => {
    it.each([
      ['', 'field-start'],
      ['a + ', 'field-start'],
      ['coalesce(', 'field-start'],
      ['coalesce(a, ', 'field-start'],
      ['a * (', 'field-start'],
      ['amo', 'field-start'],
      ['a ', 'after-operand'],
      ['a + 10 ', 'after-operand'],
      ['(a + b) ', 'after-operand'],
      ['10', 'after-operand'],
    ])('expr: %j → %s', (text, type) => {
      expect(analyzeQueryCursorContext(text, 'expr').type).toBe(type)
    })

    it('expr: after a dot', () => {
      expect(analyzeQueryCursorContext('a + Order.', 'expr')).toEqual({
        type: 'after-dot',
        typeName: 'Order',
      })
    })

    it.each([
      ['', 'field-start'],
      ['a, ', 'field-start'],
      ['ra', 'field-start'],
      ['raisedAt ', 'after-order-key'],
      ['raisedAt de', 'after-order-key'],
      ['raisedAt desc ', 'after-order-direction'],
      ['raisedAt desc, i', 'field-start'],
    ])('order: %j → %s', (text, type) => {
      expect(analyzeQueryCursorContext(text, 'order').type).toBe(type)
    })

    it('query mode is unchanged by arithmetic characters', () => {
      expect(analyzeQueryCursorContext('amount > -5 ')).toEqual({ type: 'after-comparison' })
      expect(analyzeQueryCursorContext('amount ')).toEqual({ type: 'after-field' })
    })
  })

  describe('fieldScope on string arguments', () => {
    const fieldScope = vi.fn(() => ({ allowedTypes: [], unqualifiedTarget: 'Order' }))
    const annotations = {
      test: {
        field: new AnnotationSpec({
          argument: [
            { name: 'field', type: 'string', fieldScope },
            { name: 'label', type: 'string', optional: true },
          ],
        }),
        plain: new AnnotationSpec({ argument: { name: 'field', type: 'string' } }),
      },
    }
    const body = `
interface Report {
  @test.field 'amount', 'Amount'
  total: number

  @test.field 'address.city'
  city: string

  @test.field 'missing'
  other: string

  @test.plain 'amount'
  plain: number
}
`

    it('jumps from a field-path string to the property it names', () => {
      const doc = createDoc(body, annotations)
      const arg = posOf(doc, `'amount', 'Amount'`, 2)
      const def = doc.getToDefinitionAt(arg.line, arg.character)?.[0]
      const amountDef = posOf(doc, 'amount: number')
      expect(def?.targetUri).toBe('file:///home/test.as')
      expect(def?.targetSelectionRange.start).toEqual(amountDef)
      // origin covers the string content, not the quotes
      const content = posOf(doc, `'amount', 'Amount'`, 1)
      expect(def?.originSelectionRange).toEqual({
        start: content,
        end: { line: content.line, character: content.character + 6 },
      })
      expect(fieldScope).toHaveBeenCalledWith(
        doc.annotations.find(a => a.name === 'test.field')!.args[0],
        doc
      )
    })

    it('resolves a dotted path up to the segment under the cursor', () => {
      const doc = createDoc(body, annotations)
      const onAddress = posOf(doc, `'address.city'`, 2)
      const onCity = posOf(doc, `'address.city'`, 10)
      expect(
        doc.getToDefinitionAt(onAddress.line, onAddress.character)?.[0].targetSelectionRange.start
      ).toEqual(posOf(doc, 'address: {'))
      const cityDef = doc.getToDefinitionAt(onCity.line, onCity.character)?.[0]
      expect(cityDef?.targetSelectionRange.start).toEqual(posOf(doc, 'city: string'))
      expect(cityDef?.originSelectionRange.start).toEqual(posOf(doc, `'address.city'`, 9))
    })

    it('leaves unresolved paths and hook-less string args unchanged', () => {
      const doc = createDoc(body, annotations)
      const missing = posOf(doc, `'missing'`, 2)
      expect(doc.getToDefinitionAt(missing.line, missing.character)?.[0].targetRange).toEqual(
        doc.tokensIndex.at(missing.line, missing.character)!.range
      )
      const plain = posOf(doc, `@test.plain 'amount'`, 14)
      const plainToken = doc.tokensIndex.at(plain.line, plain.character)!
      expect(resolveFieldRefAt(plainToken, doc)).toBeUndefined()
      expect(doc.getToDefinitionAt(plain.line, plain.character)?.[0].targetRange).toEqual(
        plainToken.range
      )
    })

    it('lists field-path strings among the references of the property', () => {
      const doc = createDoc(body, annotations)
      const amountDef = posOf(doc, 'amount: number')
      const content = posOf(doc, `'amount', 'Amount'`, 1)
      expect(doc.getUsageListAt(amountDef.line, amountDef.character)?.map(u => u.range)).toEqual([
        { start: content, end: { line: content.line, character: content.character + 6 } },
      ])

      // find-references from the string itself resolves to the property's usages
      const fromArg = posOf(doc, `'amount', 'Amount'`, 3)
      expect(doc.getUsageListAt(fromArg.line, fromArg.character)?.map(u => u.range)).toEqual([
        { start: content, end: { line: content.line, character: content.character + 6 } },
      ])
    })

    it('lists every segment of a dotted field path that names the property', () => {
      const doc = createDoc(body, annotations)
      const addressDef = posOf(doc, 'address: {')
      const segment = posOf(doc, `'address.city'`, 1)
      const segmentRange = {
        start: segment,
        end: { line: segment.line, character: segment.character + 7 },
      }
      expect(doc.getUsageListAt(addressDef.line, addressDef.character)?.map(u => u.range)).toEqual([
        segmentRange,
      ])

      // from the intermediate segment itself (rename / find-references there)
      const onAddress = posOf(doc, `'address.city'`, 3)
      expect(doc.getUsageListAt(onAddress.line, onAddress.character)?.map(u => u.range)).toEqual([
        segmentRange,
      ])
    })

    it('lists field-path strings across files', () => {
      const types = new AtscriptDoc('file:///home/types.as', { primitives })
      types.update(`export interface Order {\n  amount: number\n}`)
      const view = new AtscriptDoc('file:///home/view.as', {
        primitives,
        annotations: annotations as any,
      })
      view.update(
        `import { Order } from './types'\ninterface Report {\n  @test.field 'amount'\n  total: number\n}`
      )
      view.updateDependencies([types])

      const def = view.getToDefinitionAt(2, 16)?.[0]
      expect(def?.targetUri).toBe('file:///home/types.as')
      expect(def?.targetSelectionRange.start).toEqual({ line: 1, character: 2 })

      const usages = types.getUsageListAt(1, 3)
      expect(usages?.map(u => ({ uri: u.uri, start: u.range.start }))).toEqual([
        { uri: 'file:///home/view.as', start: { line: 2, character: 15 } },
      ])
    })
  })

  describe('getFieldsForType', () => {
    it('returns the fields of a nested path', () => {
      const doc = createDoc('', {})
      expect(getFieldsForType(doc, 'Order').map(p => p.id)).toEqual(['id', 'amount', 'address'])
      expect(getFieldsForType(doc, 'Order', ['address']).map(p => p.id)).toEqual(['city'])
      expect(getFieldsForType(doc, 'Order', ['nope'])).toEqual([])
    })

    it('resolves extends and intersections of an imported type', () => {
      const types = new AtscriptDoc('file:///home/types.as', { primitives })
      types.update(
        `interface Base {\n  id: number\n}\nexport interface Order extends Base {\n  amount: number\n}\nexport type Tagged = Base & { tag: string }`
      )
      const view = new AtscriptDoc('file:///home/view.as', { primitives })
      view.update(`import { Order, Tagged } from './types'`)
      view.updateDependencies([types])
      expect(getFieldsForType(view, 'Order').map(p => p.id)).toEqual(
        expect.arrayContaining(['id', 'amount'])
      )
      expect(getFieldsForType(view, 'Tagged').map(p => p.id)).toEqual(
        expect.arrayContaining(['id', 'tag'])
      )
    })
  })
})
