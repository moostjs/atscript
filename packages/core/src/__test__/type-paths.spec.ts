import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { isPhantomNode } from '../flatten'
import { getFieldsForType } from '../lsp/field-refs'
import type { SemanticNode, SemanticRefNode } from '../parser/nodes'
import { isGroup, isInterface, isPrimitive, isProp, isRef } from '../parser/nodes'
import { PluginManager } from '../plugin/plugin-manager'

/*
 * Type paths (`T.a.b`, a chain ref) through unions: one rule for every reader (MODEL §15
 * CHAIN-1). A path keeps a set of positions; a union (also through an alias, a prop typed by
 * one, a distributed merge) fans out into its branches, and each step keeps the positions that
 * have the prop. None: an unknown member; one: that field; several: the union of the fields.
 */

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  const pm = new PluginManager({ unknownAnnotation: 'allow' })
  docConfig = await pm.getDocConfig()
})

function createDoc(source: string): AtscriptDoc {
  const doc = new AtscriptDoc('file:///proj/test.as', docConfig)
  doc.update(source)
  return doc
}

/** The chain refs written as types (not annotate entries), by their text (`M0.work.h`). */
function chainRefs(doc: AtscriptDoc): Map<string, SemanticRefNode> {
  const out = new Map<string, SemanticRefNode>()
  for (const t of doc.referred) {
    const ref = t.parentNode
    if (
      isRef(ref) &&
      ref.hasChain &&
      t === ref.token('identifier') &&
      !doc.annotateBlockAt(t.range.start.line, t.range.start.character)
    ) {
      out.set([ref.id!, ...ref.chain.map(c => c.text)].join('.'), ref)
    }
  }
  return out
}

function refAt(doc: AtscriptDoc, text: string): SemanticRefNode {
  const ref = chainRefs(doc).get(text)
  expect(ref, text).toBeDefined()
  return ref!
}

/** The prop a field is (`I0.h` for the prop `h` of interface `I0`). */
function fieldName(doc: AtscriptDoc, node?: SemanticNode): string {
  if (!isProp(node)) {
    return String(node?.entity)
  }
  for (const n of doc.nodes) {
    if (isInterface(n) && n.props.get(node.id!) === node) {
      return `${n.id}.${node.id}`
    }
  }
  return `?.${node.id}`
}

const errors = (doc: AtscriptDoc) =>
  doc
    .getDiagMessages()
    .filter(m => m.severity === 1)
    .map(m => `${m.range.start.line + 1}: ${m.message}`)

const types = `
interface I0 {
  @meta.label 'I0.h'
  h: string
  p: phantom
}
interface I5 {
  @meta.label 'I5.h'
  h: number
  p: phantom
}
interface I6 {
  other: string
  p: string
}
interface I2 {
  work: I0
}
interface I3 {
  work: I5
}
interface I7 {
  work: I6
}
`

describe('type paths through unions: unwindType / unwindRef', () => {
  it('one field: the field, as through a type without a union', () => {
    const doc = createDoc(`${types}
type M0 = I2 | null
type E0 = (I2 | null) & (I2 | null)
type W = I2 | I7
interface X {
  work?: I0 | null
}
interface CH {
  a?: M0.work.h
  b?: E0.work.h
  c?: X.work.h
  d?: W.work.h
}
`)
    expect(errors(doc)).toEqual([])
    for (const text of ['M0.work.h', 'E0.work.h', 'X.work.h', 'W.work.h']) {
      const u = doc.unwindRef(refAt(doc, text))
      expect(u?.fields, text).toBeUndefined()
      expect(fieldName(doc, u?.node), text).toBe('I0.h')
      expect(isPrimitive(u?.def) && u.def.config.type, text).toBe('string')
    }
  })

  it('several fields: `fields`, `def` their union, no `node`', () => {
    const doc = createDoc(`${types}
type U = I2 | I3
interface A {
  @meta.label 'A.x'
  x: string
}
interface B {
  x: number
}
interface Q {
  u?: A | B
}
interface CH {
  a?: U.work.h
  b?: U.work
  c?: Q.u.x
}
`)
    expect(errors(doc)).toEqual([])
    const a = doc.unwindRef(refAt(doc, 'U.work.h'))
    expect(a?.node).toBeUndefined()
    expect(a?.fields?.map(f => fieldName(doc, f.node))).toEqual(['I0.h', 'I5.h'])
    expect(isGroup(a?.def) && a.def.op).toBe('|')
    expect(doc.unwindRef(refAt(doc, 'U.work'))?.fields?.map(f => f.def.id)).toEqual(['I0', 'I5'])
    expect(doc.unwindRef(refAt(doc, 'Q.u.x'))?.fields?.map(f => fieldName(doc, f.node))).toEqual([
      'A.x',
      'B.x',
    ])
  })

  it('no field: Unknown member, also where the path starts at a union', () => {
    const doc = createDoc(`${types}
type M0 = I2 | null
type WU = I0 | null
interface X {
  work: WU
}
interface CH {
  a?: M0.work.zz
  b?: X.work.zz
}
`)
    expect(errors(doc)).toEqual(['32: Unknown member "zz"', '33: Unknown member "zz"'])
    expect(doc.unwindRef(refAt(doc, 'M0.work.zz'))).toBeUndefined()
  })

  it('a branch that dead-ends deeper is skipped (only those reaching the end count)', () => {
    const doc = createDoc(`${types}
type W = I2 | I7
interface CH {
  a?: W.work.h
  b?: W.work.other
}
`)
    expect(errors(doc)).toEqual([])
    expect(fieldName(doc, doc.unwindRef(refAt(doc, 'W.work.h'))?.node)).toBe('I0.h')
    expect(fieldName(doc, doc.unwindRef(refAt(doc, 'W.work.other'))?.node)).toBe('I6.other')
  })
})

describe('type paths through unions: the other readers', () => {
  it('annotations of a field reached through a union (one field: its own; several: none)', () => {
    const doc = createDoc(`${types}
type M0 = I2 | null
type U = I2 | I3
interface CH {
  a?: M0.work.h
  b?: U.work.h
}
`)
    const prop = (name: string) =>
      (doc.nodes.find(n => n.id === 'CH') as any).getDefinition().props.get(name)
    const labels = (name: string) =>
      (doc.evalAnnotationsForNode(prop(name), prop(name).annotations, true) ?? []).map(
        a => `${a.name}=${a.args[0]?.text}`
      )
    expect(labels('a')).toEqual(['meta.label=I0.h'])
    expect(labels('b')).toEqual([])
  })

  it('phantom: one phantom field, or several all phantom; a mix is a compile error', () => {
    const doc = createDoc(`${types}
type M0 = I2 | null
type U = I2 | I3
type V = I2 | I7
interface CH {
  a?: M0.work.p
  b?: U.work.p
  c?: V.work.p
}
`)
    expect(isPhantomNode(doc, refAt(doc, 'M0.work.p'))).toBe(true)
    expect(isPhantomNode(doc, refAt(doc, 'U.work.p'))).toBe(true)
    expect(isPhantomNode(doc, refAt(doc, 'V.work.p'))).toBe(false)
    expect(errors(doc)).toEqual([
      '32: "V.work.p" names phantom and non-phantom fields through a union: the fields of a type path must be all phantom or all data',
    ])
  })

  it('go-to-definition: the field, or each field of several', () => {
    const doc = createDoc(`${types}
type M0 = I2 | null
type U = I2 | I3
interface CH {
  a?: M0.work.h
  b?: U.work.h
}
`)
    const lineOf = (text: string) => doc.text.split('\n').findIndex(l => l.includes(text))
    const at = (text: string, member: string) => {
      const line = lineOf(text)
      const ch = doc.text.split('\n')[line].indexOf(text) + text.indexOf(member) + 1
      return doc.getToDefinitionAt(line, ch)?.map(l => l.targetRange.start.line + 1)
    }
    expect(at('M0.work.h', '.h')).toEqual([4])
    expect(at('U.work.h', '.h')).toEqual([4, 9])
  })

  it('field completions: the props of every object the path reaches', () => {
    const doc = createDoc(`${types}
type M0 = I2 | null
type V = I2 | I7
`)
    expect(getFieldsForType(doc, 'M0', ['work']).map(p => p.id)).toEqual(['h', 'p'])
    expect(getFieldsForType(doc, 'V', ['work']).map(p => p.id)).toEqual(['h', 'p', 'other'])
  })

  it('blocks at a field reached through a union are its annotations (`|i` path)', () => {
    const doc = createDoc(`${types}
type M0 = I2 | null
annotate M0 {
  @meta.description 'via M0'
  work.h
}
interface CH {
  a?: M0.work.h
}
`)
    expect(errors(doc)).toEqual([])
    const prop = (doc.nodes.find(n => n.id === 'CH') as any).getDefinition().props.get('a')
    const anns = doc.evalAnnotationsForNode(prop, prop.annotations, true) ?? []
    expect(anns.map(a => `${a.name}=${a.args[0]?.text}`)).toEqual([
      'meta.label=I0.h',
      'meta.description=via M0',
    ])
  })
})

describe('type paths: core and the structure model agree', () => {
  // Every chain ref of these sources resolves to the same fields in core (`unwindRef`) as in
  // the structure model generated code is built from (`exprOf`: one chain per field, `|i`
  // steps through unions).
  const sources = {
    nullable: 'type M0 = I2 | null\ninterface CH {\n  a?: M0.work.h\n  b?: M0.work\n}',
    merge: 'type E0 = (I2 | null) & (I2 | null)\ninterface CH {\n  a?: E0.work.h\n}',
    union: 'type U = I2 | I3\ninterface CH {\n  a?: U.work.h\n  b?: U.work\n  c?: U.work.p\n}',
    deep: 'type W = I2 | I7\ninterface CH {\n  a?: W.work.h\n  b?: W.work.other\n}',
    propUnion: 'interface X {\n  w?: I2 | I3 | null\n}\ninterface CH {\n  a?: X.w.work.h\n}',
    alias:
      'type U = I2 | I3\ntype UU = U | I7\ninterface CH {\n  a?: UU.work.h\n  b?: UU.work.p\n}',
    plain: 'interface CH {\n  a?: I2.work.h\n  b?: I2.work\n}',
    none: 'type M0 = I2 | null\ninterface CH {\n  a?: M0.work.zz\n}',
  }
  it.each(Object.entries(sources))('%s', (_, source) => {
    const doc = createDoc(`${types}\n${source}\n`)
    const m = doc.structure()
    for (const [text, ref] of chainRefs(doc)) {
      const u = doc.unwindRef(ref)
      const core = u ? (u.fields ?? [u]).map(f => f.def) : []
      const t = m.exprOf(doc, ref)
      const chains = t.k === 'uni' ? t.items : [t]
      const model = chains.flatMap(c => {
        const end = c.k === 'chain' ? m.slotAt(c.decl, c.path)?.ends[0]?.node : undefined
        return end ? [isRef(end) ? doc.unwindRef(end)?.def : end] : []
      })
      expect(core.length, text).toBe(model.length)
      core.forEach((d, i) => expect(d === model[i], `${text} field ${i}`).toBe(true))
    }
  })
})
