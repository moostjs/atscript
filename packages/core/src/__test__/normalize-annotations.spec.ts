import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { PluginManager } from '../plugin/plugin-manager'

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  const pm = new PluginManager({})
  docConfig = await pm.getDocConfig()
})

function createDoc(source: string, name = 'test.as'): AtscriptDoc {
  const doc = new AtscriptDoc(name, docConfig)
  doc.update(source)
  return doc
}

function messages(doc: AtscriptDoc, severity?: number) {
  return doc
    .getDiagMessages()
    .filter(m => severity === undefined || m.severity === severity)
    .map(m => m.message)
}

describe('@normalize.* annotations', () => {
  it('are core annotations on string props, aliases, nullable and literal unions', () => {
    const doc = createDoc(`
@normalize.trim
@normalize.lowercase
type Email = string.email

type Slug = string.trimmed

interface User {
  @normalize.trim
  name: string

  @normalize.trim
  @normalize.uppercase
  code?: string | null

  @normalize.lowercase
  status: 'active' | 'blocked'

  email: Email
  aliases: Email[]
  slug: Slug
}

annotate User as Form {
  @normalize.trim
  email
}
`)
    expect(messages(doc)).toEqual([])
  })

  it('reports a non-string host', () => {
    const doc = createDoc(`
interface Foo {
  @normalize.trim
  count: number

  @normalize.lowercase
  tags: string[]

  @normalize.uppercase
  level: 1 | 2

  @normalize.trim
  mixed: string | number

  @normalize.trim
  negative: -1
}
`)
    expect(messages(doc, 1)).toEqual([
      'Expected type is (string), got "number"',
      'Expected type is (string), got "array"',
      'Expected type is (string), got union (const)',
      'Expected type is (string), got union (string | number)',
      'Expected type is (string), got "const"',
    ])
  })

  it('reports a non-string host in an annotate block entry', () => {
    const doc = createDoc(`
interface Foo {
  count: number
}

annotate Foo as Bar {
  @normalize.trim
  count
}
`)
    expect(messages(doc, 1)).toEqual(['Expected type is (string), got "number"'])
  })

  it('applies to props and types, not interfaces', () => {
    const doc = createDoc(`
@normalize.trim
interface Foo {
  a: string
}
`)
    expect(messages(doc, 1).length).toBeGreaterThan(0)
  })

  it('warns when lowercase and uppercase are both on one field', () => {
    const doc = createDoc(`
interface Foo {
  @normalize.lowercase
  @normalize.uppercase
  a: string
}
`)
    expect(messages(doc, 2)).toEqual([
      '@normalize.lowercase has no effect beside @normalize.uppercase (uppercase runs last)',
    ])
  })
})
