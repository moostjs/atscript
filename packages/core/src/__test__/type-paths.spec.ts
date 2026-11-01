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
    samePosition:
      'type U = I2 | I7\ntype UU = U | I2\ntype D = I2 | I2\ntype M0 = I2 | null\ntype MM = M0 | I2\ninterface CH {\n  a?: UU.work.h\n  b?: D.work.h\n  c?: MM.work.h\n}',
    branchBlock:
      'interface I9 {\n  work: I0\n}\ntype U = I2 | I9\nannotate I2 {\n  @meta.description "blk"\n  work.h\n}\ninterface CH {\n  a?: U.work.h\n}',
  }
  it.each(Object.entries(sources))('%s', (_, source) => {
    const doc = createDoc(`${types}\n${source}\n`)
    const m = doc.structure()
    for (const [text, ref] of chainRefs(doc)) {
      const u = doc.unwindRef(ref)
      const core = u ? (u.fields ?? [u]).map(f => f.def) : []
      const t = m.exprOf(doc, ref)
      if (t.k === 'scalar') {
        // (several fields, all phantom: the model's `phantom` type — U4)
        expect(isPhantomNode(doc, ref) && core.length > 1, text).toBe(true)
        continue
      }
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

describe('type paths through unions: one position (POS-1)', () => {
  // Branches are one position when they reach the same declared field with the same blocks on
  // the way (MODEL §15 POS-1): core (`unwindRef`) and the structure model (`exprOf`) alike.
  const fieldsOf = (doc: AtscriptDoc, text: string) => {
    const ref = refAt(doc, text)
    const u = doc.unwindRef(ref)
    const t = doc.structure().exprOf(doc, ref)
    return {
      core: (u?.fields ?? (u ? [u] : [])).map(f => fieldName(doc, f.node)),
      model: (t.k === 'uni' ? t.items : [t]).map(c => (c.k === 'chain' ? c.path.join('.') : c.k)),
    }
  }

  it('the same declared field through several branches is one field', () => {
    const doc = createDoc(`${types}
interface I8 extends I2 {
  z: string
}
interface I4 {
  @meta.label 'I4.k'
  k: string
}
type U = I2 | I7
type UU = U | I2
type D = I2 | I2
type M0 = I2 | null
type MM = M0 | I2
type X8 = I8 | I2
type DM = (I2 | I3) & I4
interface CH {
  a?: UU.work.h
  b?: D.work.h
  c?: MM.work.h
  d?: X8.work
  e?: X8.work.h
  f?: DM.k
}
`)
    expect(errors(doc)).toEqual([])
    expect(fieldsOf(doc, 'UU.work.h')).toEqual({ core: ['I0.h'], model: ['|0.|0.work.h'] })
    expect(fieldsOf(doc, 'D.work.h')).toEqual({ core: ['I0.h'], model: ['|0.work.h'] })
    expect(fieldsOf(doc, 'MM.work.h')).toEqual({ core: ['I0.h'], model: ['|0.work.h'] })
    // (an inherited prop is the parent's node)
    expect(fieldsOf(doc, 'X8.work')).toEqual({ core: ['I2.work'], model: ['|0.work'] })
    expect(fieldsOf(doc, 'X8.work.h')).toEqual({ core: ['I0.h'], model: ['|0.work.h'] })
    // (a field one operand of a distributed merge declares: that node on every branch)
    expect(fieldsOf(doc, 'DM.k')).toEqual({ core: ['I4.k'], model: ['|0.k'] })
  })

  it("the same block on every branch: one field, with the block's annotations", () => {
    const doc = createDoc(`${types}
interface I9 {
  work: I0
}
type V = I2 | I9
annotate V {
  @meta.description 'blkV'
  work.h
}
interface CH {
  b?: V.work.h
}
`)
    expect(errors(doc)).toEqual([])
    expect(fieldsOf(doc, 'V.work.h')).toEqual({ core: ['I0.h'], model: ['|0.work.h'] })
    const prop = (doc.nodes.find(n => n.id === 'CH') as any).getDefinition().props.get('b')
    const anns = doc.evalAnnotationsForNode(prop, prop.annotations, true) ?? []
    expect(anns.map(a => `${a.name}=${a.args[0]?.text}`)).toEqual([
      'meta.label=I0.h',
      'meta.description=blkV',
    ])
  })

  it('a block on some branches only: a union of the fields (the same declared field twice)', () => {
    const doc = createDoc(`${types}
interface I9 {
  work: I0
}
interface I8 extends I2 {
  z: string
}
type U = I2 | I9
type X8 = I8 | I2
annotate I2 {
  @meta.description 'blkI2'
  work.h
}
annotate I8 {
  @meta.description 'blkI8'
  work.h
}
interface CH {
  a?: U.work.h
  b?: X8.work.h
}
`)
    expect(errors(doc)).toEqual([])
    expect(fieldsOf(doc, 'U.work.h')).toEqual({
      core: ['I0.h', 'I0.h'],
      model: ['|0.work.h', '|1.work.h'],
    })
    expect(fieldsOf(doc, 'X8.work.h')).toEqual({
      core: ['I0.h', 'I0.h'],
      model: ['|0.work.h', '|1.work.h'],
    })
    // (go-to-definition: each field)
    const line = doc.text.split('\n').findIndex(l => l.includes('U.work.h'))
    const ch = doc.text.split('\n')[line].indexOf('U.work.h') + 'U.work.'.length + 1
    expect(doc.getToDefinitionAt(line, ch)?.length).toBe(2)
  })

  it('an entry through a prop typed by such a path follows its final positions', () => {
    const doc = createDoc(`${types}
interface X {
  x: string
}
interface J0 {
  h: X
}
interface J2 {
  work: J0
}
interface J9 {
  work: J0
}
type U = J2 | J9
interface CH {
  a?: U.work.h
}
annotate CH {
  @meta.description 'blkCH'
  a.x
}
annotate J2 {
  @meta.description 'blkJ2'
  work.h
}
`)
    expect(errors(doc)).toEqual([])
    const m = doc.structure()
    const block = m.blocks.find(b => b.target.name === 'CH')
    expect(block?.entries[0].paths.map(p => p.join('.'))).toEqual(['a.|0.x', 'a.|1.x'])
  })
})

/** The compile error of an interface extending union `name` (MODEL §15 EXT-U). */
const extendsUnion = (name: string) =>
  `An interface can't extend a union; use a merge (\`${name} & { … }\`)`

describe('interfaces extending a union (EXT-U)', () => {
  it('extending a union of two or more branches that are not null is a compile error', () => {
    const doc = createDoc(`${types}
type U = I2 | I3
type S = string | number
type M = I2 | string
type N3 = I2 | I3 | null
type DU = (I2 | I3) & { z: string }
interface E1 extends U { q?: string }
interface E2 extends S { q?: string }
interface E3 extends M { q?: string }
interface E4 extends N3 { q?: string }
interface E5 extends DU { q?: string }
`)
    expect(errors(doc).map(e => e.replace(/^\d+: /, ''))).toEqual(
      ['U', 'S', 'M', 'N3', 'DU'].map(extendsUnion)
    )
    // (reported at the name extended)
    const e1 = doc.getDiagMessages().find(m => m.message === extendsUnion('U'))!
    const line = doc.text.split('\n')[e1.range.start.line]
    expect(line.slice(e1.range.start.character, e1.range.end.character)).toBe('U')
  })

  it('`extends X | null` is `extends X` in every reader', () => {
    const doc = createDoc(`${types}
interface J1 {
  f?: string
}
type N0 = J1 | null
type M1 = J1 & { g?: string }
type N1 = M1 | null
interface C0 extends N0 {}
interface C1 extends N1 {}
interface CH {
  v?: C0.f
  w?: C1.g
}
`)
    expect(errors(doc)).toEqual([])
    expect(fieldName(doc, doc.unwindRef(refAt(doc, 'C0.f'))?.node)).toBe('J1.f')
    expect(getFieldsForType(doc, 'C1').map(p => p.id)).toEqual(['f', 'g'])
    const m = doc.structure()
    expect(m.slotAt(m.declOf(doc, 'C1')!, ['g'])).toBeDefined()
  })
})
