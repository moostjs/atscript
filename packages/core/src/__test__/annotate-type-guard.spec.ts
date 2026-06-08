import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
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

// Wire a `main.as` against an imported `model.as` the way the repo does:
// parse both, then connect dependencies. Mirrors cross-file/cross-package
// imports, where the target type only resolves after deps are wired.
function createImportingDoc(main: string, model: string): AtscriptDoc {
  const modelDoc = new AtscriptDoc('file:///proj/model.as', docConfig)
  modelDoc.update(model)
  const mainDoc = new AtscriptDoc('file:///proj/main.as', docConfig)
  mainDoc.update(main)
  mainDoc.updateDependencies([modelDoc])
  return mainDoc
}

function typeGuardErrors(doc: AtscriptDoc) {
  return doc.getDiagMessages().filter(m => /Expected type is/.test(m.message))
}

// Regression: type-guarded annotations (@expect.minLength requires string|array)
// applied via an `annotate` block resolved their target type as "unknown",
// producing `Expected type is (array | string), got "unknown"`. Same-file was
// fixed in 0.1.73; imported targets (the canonical use of `annotate`) still
// failed because the target type isn't resolvable at parse time — only at
// diagnostic time, after cross-file dependencies are wired.
describe('annotate: type-guarded annotation target resolution', () => {
  describe('same-file target', () => {
    it('resolves the target prop type for @expect.minLength in an annotate block', () => {
      const doc = createDoc(`
interface Foo {
  pw: string
}
annotate Foo {
  @expect.minLength 5
  pw
}
`)
      expect(typeGuardErrors(doc)).toEqual([])
    })

    it('still rejects @expect.minLength on a number prop via annotate', () => {
      const doc = createDoc(`
interface Foo {
  age: number
}
annotate Foo {
  @expect.minLength 5
  age
}
`)
      expect(
        doc
          .getDiagMessages()
          .some(m => /Expected type is \(array \| string\), got "number"/.test(m.message))
      ).toBe(true)
    })

    it('resolves chained annotate entries through the target interface', () => {
      const doc = createDoc(`
interface Bar {
  name: string
}
interface Foo {
  bar: Bar
}
annotate Foo {
  @expect.minLength 5
  bar.name
}
`)
      expect(typeGuardErrors(doc)).toEqual([])
    })

    it('parity: inline @expect.minLength on string still passes', () => {
      const doc = createDoc(`
interface Foo {
  @expect.minLength 5
  pw: string
}
`)
      expect(typeGuardErrors(doc)).toEqual([])
    })
  })

  describe('imported target', () => {
    it('resolves an imported string prop for @expect.minLength', () => {
      const doc = createImportingDoc(
        `import { FooImported } from './model'
annotate FooImported {
  @expect.minLength 5
  pw
}`,
        `export interface FooImported {
  pw: string
}`
      )
      expect(typeGuardErrors(doc)).toEqual([])
    })

    it('still rejects @expect.minLength on an imported number prop', () => {
      const doc = createImportingDoc(
        `import { FooImported } from './model'
annotate FooImported {
  @expect.minLength 5
  age
}`,
        `export interface FooImported {
  age: number
}`
      )
      expect(
        doc
          .getDiagMessages()
          .some(m => /Expected type is \(array \| string\), got "number"/.test(m.message))
      ).toBe(true)
    })

    it('resolves a chained entry through an imported nested interface', () => {
      const doc = createImportingDoc(
        `import { FooImported } from './model'
annotate FooImported {
  @expect.minLength 5
  bar.name
}`,
        `interface Bar {
  name: string
}
export interface FooImported {
  bar: Bar
}`
      )
      expect(typeGuardErrors(doc)).toEqual([])
    })

    it('resolves an optional imported prop', () => {
      const doc = createImportingDoc(
        `import { FooImported } from './model'
annotate FooImported {
  @expect.minLength 5
  pw
}`,
        `export interface FooImported {
  pw?: string
}`
      )
      expect(typeGuardErrors(doc)).toEqual([])
    })

    it('accepts @expect.minLength on an imported array prop (array is allowed)', () => {
      const doc = createImportingDoc(
        `import { FooImported } from './model'
annotate FooImported {
  @expect.minLength 5
  tags
}`,
        `export interface FooImported {
  tags: string[]
}`
      )
      expect(typeGuardErrors(doc)).toEqual([])
    })

    it('non-mutating imported alias annotate also resolves the target type', () => {
      const doc = createImportingDoc(
        `import { FooImported } from './model'
export annotate FooImported as PortalFoo {
  @expect.minLength 12
  pw
}`,
        `export interface FooImported {
  pw: string
}`
      )
      expect(typeGuardErrors(doc)).toEqual([])
    })
  })

  // The deferred guard must not silently accept wrong-typed targets just because
  // the resolved type is a union/intersection/structure/tuple, or is reached
  // through an intersection — these previously errored and must keep erroring,
  // exactly as the inline form does.
  describe('non-scalar / merged target types', () => {
    it('rejects @expect.minLength on a union-typed prop (got string|number)', () => {
      const doc = createDoc(`
interface Foo {
  x: string | number
}
annotate Foo {
  @expect.minLength 5
  x
}
`)
      expect(typeGuardErrors(doc).length).toBeGreaterThan(0)
    })

    it('rejects @expect.minLength on an inline-object prop', () => {
      const doc = createDoc(`
interface Foo {
  obj: {
    a: string
  }
}
annotate Foo {
  @expect.minLength 5
  obj
}
`)
      expect(typeGuardErrors(doc).length).toBeGreaterThan(0)
    })

    it('rejects @expect.minLength on a tuple-typed prop', () => {
      const doc = createDoc(`
interface Foo {
  t: [string, number]
}
annotate Foo {
  @expect.minLength 5
  t
}
`)
      expect(typeGuardErrors(doc).length).toBeGreaterThan(0)
    })

    it('rejects a chain entry resolving THROUGH an intersection to a number leaf', () => {
      const doc = createDoc(`
interface P1 {
  a: string
}
interface P2 {
  b: number
}
interface Foo {
  combo: P1 & P2
}
annotate Foo {
  @expect.minLength 5
  combo.b
}
`)
      expect(
        typeGuardErrors(doc).some(m => /got "number"/.test(m.message))
      ).toBe(true)
    })

    it('does NOT error on a chain entry resolving through an intersection to a string leaf', () => {
      const doc = createDoc(`
interface P1 {
  a: string
}
interface P2 {
  b: number
}
interface Foo {
  combo: P1 & P2
}
annotate Foo {
  @expect.minLength 5
  combo.a
}
`)
      expect(typeGuardErrors(doc)).toEqual([])
    })

    it('rejects @expect.minLength on an imported union-typed prop', () => {
      const doc = createImportingDoc(
        `import { FooImported } from './model'
annotate FooImported {
  @expect.minLength 5
  x
}`,
        `export interface FooImported {
  x: string | number
}`
      )
      expect(typeGuardErrors(doc).length).toBeGreaterThan(0)
    })
  })
})
