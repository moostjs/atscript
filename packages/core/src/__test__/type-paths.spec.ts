import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { isPhantomNode } from '../flatten'
import { getFieldsForType } from '../lsp/field-refs'
import type { SemanticNode, SemanticRefNode } from '../parser/nodes'
import { isGroup, isInterface, isPrimitive, isProp, isRef } from '../parser/nodes'
import { PluginManager } from '../plugin/plugin-manager'
import { SELF_SPLIT } from '../structure'

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
    // (go-to-definition: the two positions are one declared prop — one link)
    const line = doc.text.split('\n').findIndex(l => l.includes('U.work.h'))
    const ch = doc.text.split('\n')[line].indexOf('U.work.h') + 'U.work.'.length + 1
    expect(doc.getToDefinitionAt(line, ch)?.length).toBe(1)
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

  it('POS-1a: only blocks at or below the end field count, not one on a step before it', () => {
    const doc = createDoc(`${types}
interface I9 {
  work: I0
}
interface J2 {
  work: I0
}
interface J9 {
  work: I0
}
type U = I2 | I9
type W = J2 | J9
annotate I2 {
  @meta.description 'blkI2'
  work
}
annotate J2 {
  @meta.description 'blkJ2'
  work.h
}
interface CH {
  a?: U.work.h
  b?: W.work
}
`)
    expect(errors(doc)).toEqual([])
    expect(fieldsOf(doc, 'U.work.h')).toEqual({ core: ['I0.h'], model: ['|0.work.h'] })
    expect(fieldsOf(doc, 'W.work')).toEqual({
      core: ['J2.work', 'J9.work'],
      model: ['|0.work', '|1.work'],
    })
  })

  it('POS-1b: a merged field is identified by its contributors (and their blocks)', () => {
    const doc = createDoc(`${types}
interface A {
  @meta.label 'A.k'
  k: string
}
interface B {
  @meta.description 'B.k'
  k: string
}
interface C {
  c: string
}
interface E {
  e: string
}
type DM = (C | E) & A & B
type D2 = (A & B) | (A & B)
type X = C & A & B
type Y = E & A & B
type X2 = C & A & B
type Y2 = E & A & B
type U = X | Y
type U2 = X2 | Y2
annotate X2 {
  @meta.description 'blkX2'
  k
}
interface CH {
  a?: DM.k
  b?: D2.k
  c?: U.k
  d?: U2.k
  e?: X.k
}
`)
    expect(errors(doc)).toEqual([])
    expect(fieldsOf(doc, 'DM.k')).toEqual({ core: ['?.k'], model: ['|0.k'] })
    expect(fieldsOf(doc, 'D2.k')).toEqual({ core: ['?.k'], model: ['|0.k'] })
    expect(fieldsOf(doc, 'U.k')).toEqual({ core: ['?.k'], model: ['|0.k'] })
    // (a block on one of them: two positions)
    expect(fieldsOf(doc, 'U2.k')).toEqual({ core: ['?.k', '?.k'], model: ['|0.k', '|1.k'] })
    // (one field: its annotations, as through the merge without the union)
    const prop = (doc.nodes.find(n => n.id === 'CH') as any).getDefinition().props.get('a')
    const anns = doc.evalAnnotationsForNode(prop, prop.annotations, true) ?? []
    expect(anns.map(a => `${a.name}=${a.args[0]?.text}`).sort()).toEqual([
      'meta.description=B.k',
      'meta.label=A.k',
    ])
    // (go-to-definition: as for the field of the merge without the union)
    const def = (text: string) => {
      const line = doc.text.split('\n').findIndex(l => l.includes(text))
      const ch = doc.text.split('\n')[line].indexOf(text) + text.length
      return doc.getToDefinitionAt(line, ch)?.map(l => l.targetRange.start.line)
    }
    expect(def('DM.k')).toEqual(def('X.k'))
    expect(def('DM.k')).toHaveLength(1)
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

/** Review 30 st2: half of two type paths crossing each other (`H<i>.x` is `U<j>.work.h`). */
const stHalf = (i: number, j: number) => [
  `interface H${i} {\n  y: string\n  x?: U${j}.work.h\n}`,
  `interface I${i} {\n  h: H${i}\n}`,
  `interface A${i} {\n  work: I${i}\n}`,
  `interface B${i} {\n  work: I${i}\n}`,
  `type U${i} = A${i} | B${i}`,
  `annotate A${i} {\n  @meta.label 'a${i}'\n  work.h.x.y\n}`,
]

/** Review 30 (SELF-SPLIT): `H.x` is `U.work.h`, a type path through T or I9 to `W.h`; `blocks` below. */
const crossing = (blocks: string) => `
interface H {
x?: U.work.h
y: string
}
interface W {
h: H
}
interface T {
work: W
other?: U.work.h
}
interface I9 {
work: W
}
type U = T | I9
${blocks}
`

describe('type paths: positions resolved with the blocks they depend on (review 29)', () => {
  const fieldsOf = (doc: AtscriptDoc, text: string) => {
    const ref = refAt(doc, text)
    const u = doc.unwindRef(ref)
    const t = doc.structure().exprOf(doc, ref)
    return {
      core: (u?.fields ?? (u ? [u] : [])).map(f => fieldName(doc, f.node)),
      model: (t.k === 'uni' ? t.items : [t]).map(c => (c.k === 'chain' ? c.path.join('.') : c.k)),
    }
  }
  const decls = [
    'interface K {\n  k: string\n}',
    'interface H {\n  x: K\n  y: string\n}',
    'interface J0 {\n  h: H\n}',
    'interface J2 {\n  work: J0\n}',
    'interface J9 {\n  work: J0\n}',
    'type U = J2 | J9',
    "annotate J2 {\n  @meta.label 'a'\n  work.h.x.k\n}",
    'interface Q {\n  x: K\n}',
    'interface X {\n  v: U.work.h | Q\n}',
    'interface Y {\n  p: X.v.x\n}',
    "annotate Y {\n  @meta.label 'w'\n  p.k\n}",
    'interface Z {\n  z: Y.p.k\n}',
  ]

  it('a type path through one split by a block: its positions in any declaration order', () => {
    // (`U.work.h`: two positions, J2's block below `h`; `X.v.x` through them and `Q`: three —
    // H.x twice, J2's block at `x.k` below it on one; `Y.p.k`: two — K.k via J2's block, and
    // the rest)
    for (const order of [decls, [...decls].reverse(), [...decls.slice(9), ...decls.slice(0, 9)]]) {
      const doc = createDoc(order.join('\n'))
      expect(errors(doc)).toEqual([])
      expect(fieldsOf(doc, 'U.work.h')).toEqual({
        core: ['J0.h', 'J0.h'],
        model: ['|0.work.h', '|1.work.h'],
      })
      expect(fieldsOf(doc, 'X.v.x')).toEqual({
        core: ['H.x', 'H.x', 'Q.x'],
        model: ['v.|0.|0.x', 'v.|0.|1.x', 'v.|1.x'],
      })
      expect(fieldsOf(doc, 'Y.p.k')).toEqual({ core: ['K.k', 'K.k'], model: ['p.|0.k', 'p.|1.k'] })
      const y = doc.structure().blocks.find(b => b.target.name === 'Y')
      expect(y?.entries[0].paths.map(p => p.join('.'))).toEqual(['p.|0.k', 'p.|1.k', 'p.|2.k'])
    }
  })

  it('a block whose own path crosses the type path it splits is a compile error (MODEL §15 SELF-SPLIT)', () => {
    // (`T`'s block is below `T.work.h` and crosses `H.x`, typed `U.work.h` itself: where it lands
    // depends on the positions it decides. The type path goes without it: one field)
    const doc = createDoc(`
interface H {
  x?: U.work.h
  y: string
}
interface W {
  h: H
}
interface T {
  work: W
}
interface I9 {
  work: W
}
type U = T | I9
annotate T {
  @meta.label 'a'
  work.h.x.y
}
interface X {
  v: U.work.h
}
`)
    expect(errors(doc)).toEqual([`18: ${SELF_SPLIT}`])
    expect(fieldsOf(doc, 'U.work.h')).toEqual({ core: ['W.h'], model: ['|0.work.h'] })
    const t = doc.structure().blocks.find(b => b.target.name === 'T')
    expect(t?.entries[0].paths).toEqual([])
  })

  it('SELF-SPLIT: a block crossing a type path it does not split is no error', () => {
    // (on every branch — the shared field's own type —, or below another node of the same unit:
    // the type path stays one field; the block lands through it)
    for (const blocks of [
      "annotate W {\n  @meta.label 'w'\n  h.x.y\n}",
      "annotate U {\n  @meta.label 'u'\n  work.h.x.y\n}",
      "annotate T {\n  @meta.label 'o'\n  other.y\n}",
    ]) {
      const doc = createDoc(crossing(blocks))
      expect(errors(doc)).toEqual([])
      expect(fieldsOf(doc, 'U.work.h').core).toEqual(['W.h'])
    }
  })

  it('SELF-SPLIT-3: blocks landing through each other’s splits are both errors, in any order', () => {
    // (review 30 st2 / review 31 tr1: A0's block crosses U1.work.h and splits U0.work.h, A1's
    // the reverse — each landing depends on itself through the other's)
    const decls = [...stHalf(0, 1), ...stHalf(1, 0)]
    for (const order of [decls, [...decls].reverse()]) {
      const doc = createDoc(order.join('\n'))
      expect(errors(doc).map(e => e.replace(/^\d+: /, ''))).toEqual([SELF_SPLIT, SELF_SPLIT])
      expect(fieldsOf(doc, 'U0.work.h').core).toEqual(['I0.h'])
      expect(fieldsOf(doc, 'U1.work.h').core).toEqual(['I1.h'])
    }
  })

  it('SELF-SPLIT-2: every route crosses (a chain hop, a merge operand); SELF-SPLIT-4', () => {
    const route = (
      h: string,
      extra = '',
      block = "annotate T {\n  @meta.label 'a'\n  work.h.x.y\n}"
    ) =>
      `${extra}\ninterface H {\n  x?: ${h}\n  y: string\n}\ninterface W {\n  h: H\n}\ninterface T {\n  work: W\n}\ninterface I9 {\n  work: W\n}\ntype U = T | I9\n${block}\ninterface X {\n  v: U.work.h\n}`
    for (const [h, extra] of [
      ['Z.k', 'interface Z {\n  k?: U.work.h\n}'],
      ['U.work.h & E', 'interface E {\n  e?: string\n}'],
      ['UH', 'type UH = U.work.h'],
      ['(U.work.h)[]', ''],
      ['U.work.h | null', ''],
    ]) {
      expect(errors(createDoc(route(h, extra))).map(e => e.replace(/^\d+: /, ''))).toEqual([
        SELF_SPLIT,
      ])
    }
    // (another block splitting the path already: still an error — SELF-SPLIT-4)
    const both = route(
      'U.work.h',
      '',
      "annotate T {\n  @meta.description 'd'\n  work.h.y\n}\nannotate T {\n  @meta.label 'a'\n  work.h.x.y\n}"
    )
    expect(errors(createDoc(both)).map(e => e.replace(/^\d+: /, ''))).toEqual([SELF_SPLIT])
  })

  it('a block landing at a field typed by a type path being resolved: no crossing (fuzz 196, 1474, 1578)', () => {
    // (it lands at `c1`, written `U0.work.h | null`, and splits U0.work.h: the field's type is
    // not resolved by the landing — it threw an internal cycle abort out of the diagnostics)
    const doc = createDoc(`export interface H0 {
  c1?: U0.work.h | null
}
export interface I0 {
  h: H0
}
export interface C0 {
  work: I0
}
export interface C1 {
  work: I0
}
export type U0 = C0 | C1
annotate C1 {
  @meta.label 'L'
  work.h.c1
}`)
    expect(errors(doc)).toEqual([])
  })

  it('SELF-SPLIT does not depend on the order declarations are written in (fuzz 999, 852, 1598)', () => {
    // (a block's layers at a node count wherever the node's shells put them)
    const written = `export interface K0 {
  k: string
  j?: string
  z0?: G0.k
}
export interface H0 {
  x: K0
  y: string
  z1?: U0.work.h & E9
}
export interface I0 {
  h: H0
}
export interface C0 {
  work?: I0
}
export interface C1 {
  work?: I0
}
export type U0 = C0 | C1
annotate C1 {
  @meta.label 'L3.0:9'
  work.h.x.k
}
annotate C0 {
  @meta.label 'L5.0:12'
  work.h.x
}
export interface G0 {
  k?: U0.work.h.x
}
annotate U0 {
  @meta.label 'Z0.1:15'
  work.h.x.z0.j
}
export interface E9 {
}
annotate U0 {
  @meta.label 'Z1.0:16'
  work.h.z1.y
}`
    const reversed = `annotate U0 {
  @meta.label 'Z1.0:16'
  work.h.z1.y
}
export interface E9 {
}
annotate U0 {
  @meta.label 'Z0.1:15'
  work.h.x.z0.j
}
export interface G0 {
  k?: U0.work.h.x
}
annotate C0 {
  @meta.label 'L5.0:12'
  work.h.x
}
annotate C1 {
  @meta.label 'L3.0:9'
  work.h.x.k
}
export type U0 = C0 | C1
export interface C1 {
  work?: I0
}
export interface C0 {
  work?: I0
}
export interface I0 {
  h: H0
}
export interface H0 {
  x: K0
  y: string
  z1?: U0.work.h & E9
}
export interface K0 {
  k: string
  j?: string
  z0?: G0.k
}`
    expect(errors(createDoc(written))).toEqual([])
    expect(errors(createDoc(reversed))).toEqual([])
  })

  it('a type path resolved first (hover) and then the whole model: the model completed first (fuzz 1478)', () => {
    const source = `export interface H0 {
  y: string
  c0?: U0.work.h.y
  z0?: U0.work.h & E9
}
export interface I0 {
  h: H0
}
export interface I1 {
  h: H0
}
export interface C0 {
  work?: I0
}
export interface C1 {
  work: I1
}
export type U0 = C0 | C1
annotate C1 {
  @meta.label 'L0.0:1'
  work.h.c0
}
export interface E9 {
}
annotate C0 {
  @meta.label 'Z0.0:8'
  work.h.z0.c0
}`
    // (every def the final model has at every path, to depth 4)
    const state = (doc: AtscriptDoc) => {
      const m = doc.componentStructure().complete()
      const out: string[] = []
      const walk = (d: (typeof m.decls)[number], p: string[], depth: number) => {
        const def = m.defAt(d, p)
        out.push(`${d.name}:${p.join('.')}=${def?.key ?? '-'}`)
        if (depth === 0 || !def) {
          return
        }
        for (const n of def.names?.() ?? []) {
          walk(d, [...p, n], depth - 1)
        }
        for (let i = 0; i < (def.size ?? 0); i++) {
          walk(d, [...p, `|${i}`], depth - 1)
        }
      }
      for (const d of m.decls) {
        walk(d, [], 4)
      }
      for (const b of m.blocks) {
        for (const e of b.entries) {
          out.push(`${b.target.name}:${e.names.join('.')}=${e.error ?? JSON.stringify(e.paths)}`)
        }
      }
      return out
    }
    const base = state(createDoc(source))
    const refs = [...chainRefs(createDoc(source)).keys()]
    expect(refs.length).toBeGreaterThan(0)
    for (const text of refs) {
      const doc = createDoc(source)
      doc.unwindRef(chainRefs(doc).get(text)!)
      expect(state(doc)).toEqual(base)
    }
  })

  it('a block path through a merge without fields is an unknown property, in every form (review 32 sc3)', () => {
    const doc = createDoc(`interface X { a: string }
interface T {
  m5: (X | null) & null
  m6: X[] & string[]
}
annotate T {
  @meta.label 'L5'
  m5.a
  @meta.label 'L6'
  m6.a
}`)
    expect(errors(doc).map(e => e.replace(/^\d+: /, ''))).toEqual([
      'Unknown property "m5.a" in "T"',
      'Unknown property "m6.a" in "T"',
    ])
  })

  it('a block on an alias of `X | null` counts for a type path through it, resolved first (review 33 cnt1)', () => {
    const doc = createDoc(`export interface H0 {
  x: K0
}
export interface K0 {
  k: string
}
export interface I0 {
  h?: H0
}
export interface C1 {
  work?: I0
}
export type U1 = C1 | null
export type U2 = U1 | C1
export interface X1 {
  v: U2.work.h
}
annotate U1 {
  @meta.label 'Z'
  work.h.x.k
}`)
    // (its blocks land in U1's unit, though the branch's def is C1's: two positions, lazily too)
    const m = doc.componentStructure()
    const U2 = m.decls.find(d => d.name === 'U2')!
    expect(m.typePathPositions(U2, ['work', 'h'])).toEqual([
      ['|0', 'work', 'h'],
      ['|1', 'work', 'h'],
    ])
  })

  it('a block on a named distributed merge writes each branch', () => {
    const doc = createDoc(`
interface C0 {
  e?: string
}
interface C1 {
  f?: string
}
type U1 = (C0 | C1) & {
  q?: string
}
annotate U1 {
  @meta.label 'b'
  q
}
annotate U1 as Cc0 {
  @meta.description 'c'
  q
}
`)
    expect(errors(doc)).toEqual([])
    expect(
      doc.structure().blocks.map(b => b.entries.map(e => e.paths.map(p => p.join('.'))))
    ).toEqual([[['|0.q', '|1.q']], [['|0.q', '|1.q']]])
  })

  it("a chain ref's annotations: the blocks every type on the way writes on its field", () => {
    const doc = createDoc(`
interface I0 {
  g: string
}
interface C0 {
  work: I0
}
annotate I0 {
  @meta.label 'I0 block'
  g
}
annotate C0 {
  @meta.description 'C0 block'
  work.g
}
interface X {
  v: C0.work.g
  w: I0.g
}
`)
    expect(errors(doc)).toEqual([])
    const props = (doc.nodes.find(n => n.id === 'X')!.getDefinition() as any).props
    const anns = (k: string) =>
      doc
        .evalAnnotationsForNode(props.get(k), props.get(k).annotations, true)
        ?.map(a => `${a.name}=${a.args[0]?.text}`)
    expect(anns('v')).toEqual(['meta.label=I0 block', 'meta.description=C0 block'])
    expect(anns('w')).toEqual(['meta.label=I0 block'])
  })

  it('a type path through an intersection with an unknown operand: diagnostics, no endless walk', () => {
    // (what does not merge stays an intersection: merging it again is the same)
    const doc = createDoc(`
interface C1 {
  f?: string
}
type U1 = C0 & C1
type U2 = (C0 | C1) & {
  q?: string
}
interface X {
  v: U1.f
  w: U2.q
}
`)
    expect(errors(doc).some(e => e.includes('Unknown identifier "C0"'))).toBe(true)
  })

  it("a chain ref through an `as` copy: the target's blocks below the copy's", () => {
    // (U1's branches are one merge: its block at `e` is on U1, not on a field's shell)
    const doc = createDoc(`
interface C1 {
  e?: string
  f?: string
}
type U1 = (C1 | C1) & {
  q: string
}
annotate U1 {
  @meta.label 'U1 block'
  @meta.description 'U1 block'
  e
  @meta.label 'U1 block'
  f
}
annotate U1 as Cc0 {
  @meta.label 'copy'
  e
}
interface X {
  v: Cc0.e
  w: Cc0.f
}
`)
    expect(errors(doc)).toEqual([])
    const props = (doc.nodes.find(n => n.id === 'X')!.getDefinition() as any).props
    const anns = (k: string) =>
      doc
        .evalAnnotationsForNode(props.get(k), props.get(k).annotations, true)
        ?.map(a => `${a.name}=${a.args[0]?.text}`)
    expect(anns('v')?.sort()).toEqual(['meta.description=U1 block', 'meta.label=copy'])
    expect(anns('w')).toEqual(['meta.label=U1 block'])
  })

  /** Core's fields and the complete model's positions of type path `text` of `doc`. */
  const both = (doc: AtscriptDoc, text: string) => {
    const u = doc.unwindRef(refAt(doc, text))
    const m = doc.componentStructure().complete()
    const [head, ...path] = text.split('.')
    const d = m.decls.find(x => x.name === head)!
    return { core: u?.fields?.length ?? (u ? 1 : 0), model: m.typePathPositions(d, path) }
  }

  it('the blocks of a named distributed merge split a type path through it (fuzz 5689, 3824)', () => {
    const doc = createDoc(`interface I0 { g: string }
interface C0 { work?: I0 }
interface C2 { work: I0 }
interface C3 { work: I0 }
type U1 = (C0 | C2) & { q: string }
type U2 = U1 | C3
interface X0 { v: U2.work.g }
annotate U1 {
  @meta.description 'L'
  work.g
}`)
    expect(errors(doc)).toEqual([])
    // (U1's two branches: one field with U1's block; C3's: the plain one)
    expect(both(doc, 'U2.work.g')).toEqual({
      core: 2,
      model: [
        ['|0', '|0', 'work', 'g'],
        ['|1', 'work', 'g'],
      ],
    })
  })

  it("an `as` copy of a union: its entries split a type path through the copy's branches (fuzz 1711)", () => {
    const doc = createDoc(`interface H0 { y: string }
interface I0 { h: H0 }
interface C1 { work: I0 }
interface C2 { }
type U1 = C2 | C1
annotate U1 as Cc0 {
  @meta.label 'cp'
  work.h.y
}
interface X0 { w: Cc0.work.h | H0 }
type Z0 = X0.w.y`)
    expect(errors(doc)).toEqual([])
    expect(both(doc, 'X0.w.y')).toEqual({
      core: 2,
      model: [
        ['w', '|0', 'y'],
        ['w', '|1', 'y'],
      ],
    })
  })

  it('a type path resolved while another block is normalized: walked with the layers added before (fuzz 924782)', () => {
    // (the complete model normalizes V0's block, then U1's, whose path crosses G0.k = U2.work.h.x;
    // that walk normalizes C1's block, whose own walk rebuilds the defs: the outer walk restarts
    // on them, so V0's block splits U2.work.h.x as when the path is resolved first)
    const source = `type U0 = C0 | C1
type U1 = (U0 | null) | C1
type U2 = U1 | C0
type V0 = U0
annotate V0 {
  @meta.label 'L'
  work.h.x
}
interface G0 { k?: U2.work.h.x }
annotate U1 {
  @meta.label 'M'
  work.h.x.z0.j
}
interface C0 { work?: I1 }
interface C1 { work: I1 }
annotate C1 {
  @meta.label 'N'
  work.h.z1.y
}
interface K0 { z0?: G0.k }
interface H0 {
  x: K0
  z1?: V0.work.h[]
}
interface I1 { h: H0 }`
    const doc = createDoc(source)
    const m = doc.componentStructure().complete()
    const U2 = m.decls.find(d => d.name === 'U2')!
    const positions = [
      ['|0', '|0', '|0', 'work', 'h', 'x'],
      ['|0', '|1', 'work', 'h', 'x'],
    ]
    expect(m.typePathPositions(U2, ['work', 'h', 'x'])).toEqual(positions)
    const lazy = createDoc(source)
    expect(lazy.unwindRef(refAt(lazy, 'U2.work.h.x'))?.fields?.length).toBe(2)
    const l = lazy.componentStructure()
    expect(l.typePathPositions(l.decls.find(d => d.name === 'U2')!, ['work', 'h', 'x'])).toEqual(
      positions
    )
  })

  it("a chain ref into a merged field: each contributor's blocks over its own annotations, later first (review 35 aliasblk)", () => {
    const doc = createDoc(`interface I0 {
  s: string
}
interface I2 {
  @meta.label 's36'
  s: string
}
type B0 = I2
annotate B0 {
  @meta.label 'b0'
  s
}
interface I3 {
  s: string
}
annotate I3 {
  @meta.label 'blk'
  s
}
type M0 = I0 & I2
type M1 = I3 & I2
type M2 = I2 & I3
interface Q {
  d?: M0.s
  e?: M1.s
  f?: M2.s
}`)
    expect(errors(doc)).toEqual([])
    const props = (doc.nodes.find(n => n.id === 'Q')!.getDefinition() as any).props
    const label = (k: string) =>
      doc
        .evalAnnotationsForNode(props.get(k), props.get(k).annotations, true)
        ?.find(a => a.name === 'meta.label')?.args[0]?.text
    // (I2's block beats its own label; a later contributor's own label beats an earlier one's
    // block; a later one's block beats an earlier one's own — as the runtime layers them)
    expect([label('d'), label('e'), label('f')]).toEqual(['b0', 'b0', 'blk'])
  })
})

describe('type paths: review 36 (fix 18j)', () => {
  const label = (doc: AtscriptDoc, holder: string, k: string) => {
    const props = (doc.nodes.find(n => n.id === holder)!.getDefinition() as any).props
    return doc
      .evalAnnotationsForNode(props.get(k), props.get(k).annotations, true)
      ?.find(a => a.name === 'meta.label')?.args[0]?.text
  }

  it("a chain ref into a merged field one contributor of which is a merged field with blocks: that merge's blocks too (F3)", () => {
    const doc = createDoc(`interface I0 {
  @meta.label 'I0'
  s: string
}
interface I1 {
  s: string
}
type M0 = I0 & I1
annotate M0 {
  @meta.label 'B'
  s
}
type M3 = M0 & I1
interface Q {
  p?: M3.s
  q?: M0.s
}`)
    expect(errors(doc)).toEqual([])
    // (M3.s layers over M0.s, whose own layer has M0's block — as the runtime reads it)
    expect([label(doc, 'Q', 'p'), label(doc, 'Q', 'q')]).toEqual(['B', 'B'])
  })

  it('a merge operand repeated through named merges counts at its latest place (F4, MODEL §15 DEDUP-2)', () => {
    const doc = createDoc(`interface I2 {
  @meta.label 'I2'
  s: string
}
interface I3 {
  @meta.label 'I3'
  s: string
}
type M0 = I2 & I2
type M2 = M0 & I3
type M3 = I2 & M2 & M0
type M4 = I2 & M2 & I2
interface Q {
  p?: M3.s
  q?: M4.s
}`)
    expect(errors(doc)).toEqual([])
    expect([label(doc, 'Q', 'p'), label(doc, 'Q', 'q')]).toEqual(['I2', 'I2'])
  })

  it('a scalar merge of a type path split by a block: the same `never` warning as without the block (F5)', () => {
    const source = `interface H { y?: string }
interface I0 { h: H }
interface I2 { work: I0 }
interface I9 { work: I0 }
type U = I2 | I9
type S = U.work.h.y & string
type S2 = U.work.h.y & number
`
    const block = `annotate I2 {
  @meta.label 'L'
  work.h.y
}`
    const warnings = (doc: AtscriptDoc) =>
      doc
        .getDiagMessages()
        .filter(m => m.severity === 2 && /cannot be merged/.test(m.message))
        .map(m => `${m.range.start.line + 1}: ${m.message}`)
    const plain = warnings(createDoc(source))
    expect(plain).toEqual([
      '7: Intersection of values with nothing in common cannot be merged in "S2"; the type resolves to never',
    ])
    expect(warnings(createDoc(`${source}${block}`))).toEqual(plain)
  })

  it('positions of one type are one for structure whatever field they come from: core and the model (MODEL §15 STRUCT-N3-DEF)', () => {
    const doc = createDoc(`interface H { y?: string }
interface K { k?: number }
interface A { h: H }
interface B { h?: H }
interface C { h: K }
type U = A | B | C
type Z = U.h
type ZH = Z & H
interface P { z?: U.h }`)
    expect(errors(doc)).toEqual([])
    // (core: two types — H and K —, three fields)
    const u = doc.unwindRef(refAt(doc, 'U.h'))!
    expect(u.fields!.map(f => fieldName(doc, f.node))).toEqual(['A.h', 'B.h', 'C.h'])
    expect(isGroup(u.def) ? u.def.unwrap().length : 1).toBe(2)
    // (the model: the same rule)
    const m = doc.componentStructure()
    const d = m.decls.find(x => x.name === 'U')!
    const types = m.typePathTypes(d, ['h'])!
    expect([types[0] === types[1], types[0] === types[2]]).toEqual([true, false])
    // (`Z & H`: H's merge with each type — two branches, not one per field)
    expect(m.shapeAt(m.decls.find(x => x.name === 'ZH')!, [])).toMatchObject({ k: 'uni', n: 2 })
  })

  it('a merge with a type path split by a block reads the declared field, as without the block (STRUCT-N3-META)', () => {
    const source = `interface H { y?: string }
interface I0 {
  @meta.label 'F'
  h: H
}
interface I2 { work: I0 }
interface I9 { work: I0 }
type U = I2 | I9
type Z = U.work.h
type ZE = Z & { e?: string }
type WE = U.work.h & { e?: string }
`
    const block = `annotate I2 {
  @meta.description 'D'
  work.h.y
}`
    const roots = (doc: AtscriptDoc) =>
      ['ZE', 'WE'].map(n =>
        doc
          .intersectionAnnotations(doc.nodes.find(x => x.id === n)!.getDefinition() as any, true)
          .map(p => `${p.an.name}=${p.an.args[0]?.text}`)
      )
    expect(roots(createDoc(source))).toEqual([['meta.label=F'], ['meta.label=F']])
    expect(roots(createDoc(`${source}${block}`))).toEqual(roots(createDoc(source)))
  })

  it('an alias of a type path split by a block, read by core before the model: no escaping abort', () => {
    const doc = createDoc(`interface H { y?: string }
interface I0 { h: H }
interface I2 { work: I0 }
interface I9 { work: I0 }
type U = I2 | I9
type Z = U.work.h
interface X extends Z { q?: string }
type Z2 = Z
type Z3 = (Z)
annotate I2 {
  @meta.label 'L'
  work.h
}`)
    expect(errors(doc)).toEqual([])
  })
})

describe('type paths: review 37 (fix 18k)', () => {
  const typeLabels = (doc: AtscriptDoc, name: string) =>
    doc
      .evalAnnotationsForNode(doc.nodes.find(n => n.id === name)!, undefined, true)
      ?.filter(a => a.name === 'meta.label')
      .map(a => a.args[0]?.text) ?? []

  it('a merge with a group of several fields of one type gets the type only, in every order (R1, MODEL §15 STRUCT-N3-GROUP-META, STRUCT-N3-ALIAS)', () => {
    const viaChain = (u: string) => `interface H { y?: string }
interface A {
  @meta.label 'F'
  h: H
}
interface B { h: A.h }
interface C { h: H }
type U = ${u}
type Z = U.h
type ZE = Z & { e?: string }`
    const viaAlias = (u: string) => `interface H { y?: string }
@meta.label 'P'
type P = H
interface A { h: H }
interface B { h: P }
type U = ${u}
type Z = U.h
type ZE = Z & { e?: string }
interface X extends Z { q?: string }`
    for (const source of [
      viaChain('C | B'),
      viaChain('B | C'),
      viaAlias('A | B'),
      viaAlias('B | A'),
    ]) {
      const doc = createDoc(source)
      expect(errors(doc)).toEqual([])
      expect(typeLabels(doc, 'ZE')).toEqual([])
    }
  })

  it('a field whose type reaches the field itself through a merge: a compile error, no crash (R7)', () => {
    const circular = (name: string) => `Circular chain reference "${name}.c": it resolves to itself`
    for (const [source, name] of [
      [
        `interface I0 { c?: M0.c }\ninterface I2 { c?: string; d?: number }\ntype M0 = I0 & I2`,
        'M0',
      ],
      [
        `interface I0 { c?: X0.c }\ninterface I2 { c?: string; d?: number }\ntype M0 = I0 & I2\nannotate M0 as X0 {}`,
        'M0',
      ],
      [`interface I0 { c?: M0.c | null }\ninterface I2 { c?: string }\ntype M0 = I0 & I2`, 'M0'],
      [`interface I0 { c?: J.c }\ninterface I2 { c?: string }\ninterface J extends I0, I2 {}`, 'J'],
      [
        `interface I0 { c?: J.c }\ninterface I2 { c?: string }\ninterface J extends I0, I2 {}\ntype T = J.c & string`,
        'J',
      ],
    ]) {
      expect(errors(createDoc(source)).map(e => e.replace(/^\d+: /, ''))).toContain(circular(name))
    }
  })
})
