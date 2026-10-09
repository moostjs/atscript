import { beforeAll, describe, expect, it } from 'vitest'

import { nonNullishMembers } from '../annotations'
import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { isArray, isPrimitive } from '../parser/nodes'
import { PluginManager } from '../plugin/plugin-manager'

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  const pm = new PluginManager({ unknownAnnotation: 'allow' })
  docConfig = await pm.getDocConfig()
})

function createDoc(source: string): AtscriptDoc {
  const doc = new AtscriptDoc('test.as', docConfig)
  doc.update(source)
  return doc
}

function createImportingDoc(main: string, model: string): AtscriptDoc {
  const modelDoc = new AtscriptDoc('file:///proj/model.as', docConfig)
  modelDoc.update(model)
  const mainDoc = new AtscriptDoc('file:///proj/main.as', docConfig)
  mainDoc.update(main)
  mainDoc.updateDependencies([modelDoc])
  return mainDoc
}

function targetErrors(doc: AtscriptDoc) {
  return doc
    .getDiagMessages()
    .filter(m => /Expected type is|requires an array field/.test(m.message))
    .map(m => m.message)
}

describe('type-guarded annotations on nullable unions', () => {
  it('accepts number constraints on number | null', () => {
    const doc = createDoc(`
interface Foo {
  @expect.min 0
  @expect.max 10
  @expect.int
  a: number | null
}
`)
    expect(targetErrors(doc)).toEqual([])
  })

  it('accepts string constraints on string | null', () => {
    const doc = createDoc(`
interface Foo {
  @expect.minLength 1
  @expect.maxLength 5
  @expect.pattern "^[a-z]+$"
  b: string | null
}
`)
    expect(targetErrors(doc)).toEqual([])
  })

  it('accepts array constraints and uniqueItems on string[] | null', () => {
    const doc = createDoc(`
interface Foo {
  @expect.minLength 1
  @expect.maxLength 2
  @expect.array.uniqueItems
  e: string[] | null
}
`)
    expect(targetErrors(doc)).toEqual([])
  })

  it('accepts a union alias, a primitive extension and undefined members', () => {
    const doc = createDoc(`
type NN = number | null
type Pct = number
interface Foo {
  @expect.min 1
  c: NN
  @expect.min 0
  f: number.int | null
  @expect.max 100
  g: Pct | null
  @expect.min 0
  h: number | null | undefined
  @expect.min 0
  i: NN | undefined
}
`)
    expect(targetErrors(doc)).toEqual([])
  })

  it('accepts @meta.required on string | null and boolean | null', () => {
    const doc = createDoc(`
interface Foo {
  @meta.required
  s: string | null
  @meta.required
  b: boolean | null
}
`)
    expect(targetErrors(doc)).toEqual([])
  })

  it('accepts optional nullable props', () => {
    const doc = createDoc(`
interface Foo {
  @expect.max 3
  a?: number | null
}
`)
    expect(targetErrors(doc)).toEqual([])
  })

  it('accepts nullable targets in an annotate block (same file and imported)', () => {
    const same = createDoc(`
interface Foo {
  a: number | null
  e: string[] | null
}
annotate Foo {
  @expect.min 0
  a
  @expect.maxLength 3
  e
}
`)
    expect(targetErrors(same)).toEqual([])
    const imported = createImportingDoc(
      `import { FooImported } from './model'
annotate FooImported {
  @expect.min 0
  a
  @expect.pattern "x"
  b
}`,
      `type Code = string
export interface FooImported {
  a: number | null
  b: Code | null
}`
    )
    expect(targetErrors(imported)).toEqual([])
  })

  it('accepts an imported nullable alias as the prop type', () => {
    const doc = createImportingDoc(
      `import { NN } from './model'
interface Foo {
  @expect.min 0
  a: NN
}`,
      `export type NN = number | null`
    )
    expect(targetErrors(doc)).toEqual([])
  })

  it('rejects mixed unions, with a readable message', () => {
    const doc = createDoc(`
interface Foo {
  @expect.min 0
  a: number | string
  @expect.min 0
  b: string | number | null
}
`)
    const errors = targetErrors(doc)
    expect(errors).toEqual([
      'Expected type is (number), got union (number | string)',
      'Expected type is (number), got union (string | number | null)',
    ])
    expect(errors.join('\n')).not.toContain('group')
  })

  it('rejects a null-only union and a literal union', () => {
    const doc = createDoc(`
interface Foo {
  @expect.min 0
  a: null | undefined
  @expect.min 0
  b: 1 | 2 | null
}
`)
    expect(targetErrors(doc)).toHaveLength(2)
  })

  it('rejects uniqueItems on a nullable non-array', () => {
    const doc = createDoc(`
interface Foo {
  @expect.array.uniqueItems
  a: string | null
}
`)
    expect(targetErrors(doc)).toEqual(['@expect.array.uniqueItems requires an array field'])
  })

  it('rejects @meta.required on number | null', () => {
    const doc = createDoc(`
interface Foo {
  @meta.required
  a: number | null
}
`)
    expect(targetErrors(doc)).toEqual([
      'Expected type is (string | boolean), got union (number | null)',
    ])
  })

  it('keeps the plain-type message for non-union targets', () => {
    const doc = createDoc(`
interface Foo {
  @expect.min 0
  a: string
}
`)
    expect(targetErrors(doc)).toEqual(['Expected type is (number), got "string"'])
  })
})

describe('nonNullishMembers', () => {
  function propDef(doc: AtscriptDoc, iface: string, prop: string) {
    return doc.unwindType(iface, [prop])
  }

  it('returns resolved non-null members of a union', () => {
    const doc = createDoc(`
type NN = number | null
interface Foo {
  a: string[] | null | undefined
  b: NN | string
  c: string
}
`)
    const a = propDef(doc, 'Foo', 'a')!
    const aMembers = nonNullishMembers(a.def, a.doc)!
    expect(aMembers).toHaveLength(1)
    expect(isArray(aMembers[0])).toBe(true)

    const b = propDef(doc, 'Foo', 'b')!
    const bMembers = nonNullishMembers(b.def, b.doc)!
    expect(bMembers.map(m => (isPrimitive(m) ? m.type : m.entity))).toEqual(['number', 'string'])

    const c = propDef(doc, 'Foo', 'c')!
    expect(nonNullishMembers(c.def, c.doc)).toBeUndefined()
  })
})
