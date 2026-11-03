import { beforeAll, describe, expect, it } from 'vitest'

import { ANNOTATE_RESET, isAnnotationSpec } from '../annotations'
import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { getValueCandidates } from '../lsp/field-refs'
import type { SemanticNode, SemanticStructureNode, TAnnotationTokens } from '../parser/nodes'
import { PluginManager } from '../plugin/plugin-manager'

/*
 * `@annotate.reset '<name>'` in an `annotate` block removes an annotation the entry's node (or the
 * block's target) would otherwise carry. Build-time readers (diagnostics, LSP, plugins reading
 * evaluated annotations) see the same as the runtime.
 */

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  docConfig = await new PluginManager({}).getDocConfig()
})

function createDoc(source: string, config = docConfig): AtscriptDoc {
  const doc = new AtscriptDoc('file:///proj/test.as', config)
  doc.update(source)
  return doc
}

function errors(doc: AtscriptDoc) {
  return doc
    .getDiagMessages()
    .filter(m => m.severity === 1)
    .map(m => m.message)
}

const names = (anns: TAnnotationTokens[] | undefined) =>
  (anns ?? []).map(a => `${a.name}${a.args[0] ? ` ${a.args[0].text}` : ''}`)

/** The evaluated annotations (with blocks, as the LSP and plugins read them) of `T.prop`. */
function propAnnotations(doc: AtscriptDoc, type: string, prop: string) {
  const decl = doc.getDeclarationOwnerNode(type)!.node as SemanticNode
  const struct = decl.getDefinition() as SemanticStructureNode
  const node = struct.props.get(prop)!
  return names(doc.evalAnnotationsForNode(node, node.annotations, true))
}

const MODEL = `
type Email = string.email
@meta.label 'User'
interface User {
  @meta.label 'Login'
  @expect.pattern '^x'
  login: string
  email: Email
}
annotate User {
  @annotate.reset 'expect.pattern'
  email
  @annotate.reset 'expect.pattern'
  @expect.pattern '^q'
  login
}
interface Ref {
  e: User.email
  l: User.login
}
`

describe('@annotate.reset', () => {
  it('is a built-in annotation spec', () => {
    expect(ANNOTATE_RESET).toBe('annotate.reset')
    expect(isAnnotationSpec(createDoc('').resolveAnnotation(ANNOTATE_RESET))).toBe(true)
  })

  it('builds in mutating and `as` blocks, on entries and at the top', () => {
    const doc = createDoc(`${MODEL}
@annotate.reset 'meta.label'
annotate User as PublicUser {
  @annotate.reset 'meta.label'
  login
}
@annotate.reset 'meta.label'
annotate User {}
`)
    expect(errors(doc)).toEqual([])
  })

  it('is refused outside annotate blocks', () => {
    const doc = createDoc(`
@annotate.reset 'meta.label'
interface A {
  @annotate.reset 'meta.label'
  a: string
}
`)
    expect(errors(doc)).toEqual([
      '@annotate.reset is allowed only in annotate blocks',
      '@annotate.reset is allowed only in annotate blocks',
    ])
  })

  it('diagnoses an unknown annotation name, per `unknownAnnotation`', async () => {
    const src = `interface A { a: string }
annotate A {
  @annotate.reset 'meta.lable'
  a
}`
    expect(errors(createDoc(src))).toEqual(['Unknown annotation "@meta.lable"'])
    const warn = await new PluginManager({ unknownAnnotation: 'warn' }).getDocConfig()
    expect(errors(createDoc(src, warn))).toEqual([])
    expect(
      createDoc(src, warn)
        .getDiagMessages()
        .map(m => m.message)
    ).toContain('Unknown annotation "@meta.lable"')
    const allow = await new PluginManager({ unknownAnnotation: 'allow' }).getDocConfig()
    expect(createDoc(src, allow).getDiagMessages()).toEqual([])
  })

  it('refuses to reset an annotate directive', () => {
    const doc = createDoc(`interface A { a: string }
annotate A {
  @annotate.reset 'annotate.reset'
  a
}`)
    expect(errors(doc)).toEqual(['"annotate.reset" is not metadata: it cannot be reset'])
  })

  it('needs a string argument', () => {
    const doc = createDoc(`interface A { a: string }
annotate A {
  @annotate.reset meta.label
  a
}`)
    expect(errors(doc)[0]).toMatch(/string expected/)
  })

  it('completes annotation names in its argument', () => {
    const doc = createDoc(`interface A { a: string }
annotate A {
  @annotate.reset ''
  a
}`)
    // (the annotation's main token)
    const token = doc.tokensIndex.at(2, 4)!
    const values = getValueCandidates(token, 0, doc)?.map(c => c.value) ?? []
    expect(values).toContain('expect.pattern')
    expect(values).toContain('meta.label')
    expect(values).not.toContain(ANNOTATE_RESET)
  })

  it('build-time readers see the reset through a chain to the field', () => {
    const doc = createDoc(MODEL)
    expect(errors(doc)).toEqual([])
    // (the field's type, `Email`, keeps its pattern; the reset drops it at User.email)
    expect(propAnnotations(doc, 'Ref', 'e')).toEqual([])
    // (the block's own value applies over the reset: the declared '^x' is gone)
    expect(propAnnotations(doc, 'Ref', 'l').sort()).toEqual([
      'expect.pattern ^q',
      'meta.label Login',
    ])
  })

  it('build-time readers see a top-level reset of an `as` copy', () => {
    const doc = createDoc(`${MODEL}
@annotate.reset 'meta.label'
annotate User as PublicUser {}
@meta.description 'D'
@annotate.reset 'meta.label'
annotate User as Described {}
`)
    const at = (name: string) =>
      names(doc.evalAnnotationsForNode(doc.getDeclarationOwnerNode(name)!.node!, undefined, true))
    expect(at('User')).toEqual(['meta.label User'])
    expect(at('PublicUser')).toEqual([])
    expect(at('Described')).toEqual(['meta.description D'])
  })
})
