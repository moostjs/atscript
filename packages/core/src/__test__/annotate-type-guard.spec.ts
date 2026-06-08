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

// Regression: type-guarded annotations (@expect.minLength requires string|array)
// applied via an `annotate` block resolved their target type as "unknown",
// producing `Expected type is (array | string), got "unknown"`.
describe('annotate: type-guarded annotation target resolution', () => {
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
    const messages = doc.getDiagMessages()
    expect(messages.filter(m => /Expected type is/.test(m.message))).toEqual([])
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
    const messages = doc.getDiagMessages()
    expect(messages.some(m => /Expected type is \(array \| string\), got "number"/.test(m.message))).toBe(
      true
    )
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
    const messages = doc.getDiagMessages()
    expect(messages.filter(m => /Expected type is/.test(m.message))).toEqual([])
  })

  it('parity: inline @expect.minLength on string still passes', () => {
    const doc = createDoc(`
interface Foo {
  @expect.minLength 5
  pw: string
}
`)
    const messages = doc.getDiagMessages()
    expect(messages.filter(m => /Expected type is/.test(m.message))).toEqual([])
  })
})
