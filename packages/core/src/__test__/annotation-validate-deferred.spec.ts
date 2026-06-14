import { beforeAll, describe, expect, it } from 'vitest'

import { AnnotationSpec } from '../annotations'
import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { isArray, isInterface, isRef, isStructure } from '../parser/nodes'
import { PluginManager } from '../plugin/plugin-manager'

let docConfig: TAtscriptDocConfig

// A custom annotation whose validate() introspects the annotated field's
// resolved type — a faithful stand-in for @db.patch.strategy from
// @atscript/db/plugin: it requires the field to be an object/array and calls
// `doc.unwindType()` to resolve a ref to its underlying kind. This is the class
// of validator the deferral fix targets: type-introspecting hooks that can only
// resolve cross-file imports once the dependency graph is wired.
const patchStrategy = new AnnotationSpec({
  argument: { name: 'mode', type: 'string', values: ['merge', 'replace'] },
  validate(token, _args, doc) {
    const definition = token.parentNode?.getDefinition()
    if (!definition) {
      return []
    }
    let wrongType = false
    if (isRef(definition)) {
      const def = doc.unwindType(definition.id!, definition.chain)?.def
      if (!isStructure(def) && !isInterface(def) && !isArray(def)) {
        wrongType = true
      }
    } else if (!isStructure(definition) && !isInterface(definition) && !isArray(definition)) {
      wrongType = true
    }
    if (wrongType) {
      return [
        {
          severity: 1,
          message: 'patch.strategy requires a field of type object or array',
          range: token.range,
        },
      ]
    }
    return []
  },
})

beforeAll(async () => {
  const pm = new PluginManager({ unknownAnnotation: 'allow' })
  docConfig = await pm.getDocConfig()
  // Register the custom `@patch.strategy` annotation alongside the defaults.
  docConfig.annotations = { ...docConfig.annotations, patch: { strategy: patchStrategy } }
})

function createDoc(source: string): AtscriptDoc {
  const doc = new AtscriptDoc('test.as', docConfig)
  doc.update(source)
  return doc
}

// Wire a `main.as` against an imported `model.as` the way the repo does: parse
// both, then connect dependencies. Mirrors cross-file imports, where the target
// type only resolves after deps are wired.
function createImportingDoc(main: string, model: string): AtscriptDoc {
  const modelDoc = new AtscriptDoc('file:///proj/model.as', docConfig)
  modelDoc.update(model)
  const mainDoc = new AtscriptDoc('file:///proj/main.as', docConfig)
  mainDoc.update(main)
  mainDoc.updateDependencies([modelDoc])
  return mainDoc
}

function patchErrors(doc: AtscriptDoc) {
  return doc.getDiagMessages().filter(m => /patch\.strategy requires/.test(m.message))
}

function typeGuardErrors(doc: AtscriptDoc) {
  return doc.getDiagMessages().filter(m => /Expected type is/.test(m.message))
}

// Regression for VAL_ISSUE: a plugin annotation whose validate() resolves the
// field's underlying kind via doc.unwindType() got `undefined` back when the
// field's type was an interface IMPORTED from another .as file, because the
// hook ran at parse time — before cross-file dependencies were wired — and
// emitted a spurious "wrong type" error. The same reference resolves at codegen
// time. The fix defers such hooks to diagnostic time, where imports resolve.
describe('annotation custom validate(): cross-file imported field type', () => {
  it('does NOT flag an imported interface field (the reported bug)', () => {
    const doc = createImportingDoc(
      `import { ChangeLog } from './model'
interface Thing {
  @patch.strategy 'merge'
  changeLog: ChangeLog
}`,
      `export interface ChangeLog {
  createdAt?: number
  updatedAt?: number
}`
    )
    expect(patchErrors(doc)).toEqual([])
  })

  it('passes for a same-file interface field (parity)', () => {
    const doc = createDoc(`
interface ChangeLog {
  createdAt?: number
}
interface Thing {
  @patch.strategy 'merge'
  changeLog: ChangeLog
}`)
    expect(patchErrors(doc)).toEqual([])
  })

  it('accepts an imported array field', () => {
    const doc = createImportingDoc(
      `import { Tag } from './model'
interface Thing {
  @patch.strategy 'replace'
  tags: Tag[]
}`,
      `export interface Tag {
  name: string
}`
    )
    expect(patchErrors(doc)).toEqual([])
  })

  // The fix must not silently disable the check for cross-file types: an
  // imported PRIMITIVE alias is genuinely the wrong kind for @patch.strategy and
  // must still be rejected once it resolves at diagnostic time.
  it('still flags an imported primitive-alias field (no masking)', () => {
    const doc = createImportingDoc(
      `import { Stamp } from './model'
interface Thing {
  @patch.strategy 'merge'
  changeLog: Stamp
}`,
      `export type Stamp = string`
    )
    expect(patchErrors(doc).length).toBeGreaterThan(0)
  })

  it('still flags a same-file primitive field', () => {
    const doc = createDoc(`
interface Thing {
  @patch.strategy 'merge'
  changeLog: string
}`)
    expect(patchErrors(doc).length).toBeGreaterThan(0)
  })
})

// Same root cause via the built-in `defType` guard on INLINE props: the guard
// resolved an imported field type at parse time, got an unresolved ref, and
// reported `Expected type is (...), got "ref"`. (Annotate-block entries were
// already deferred; inline props were not.)
describe('built-in defType guard: cross-file imported inline prop', () => {
  it('does NOT flag @expect.minLength on an imported string field', () => {
    const doc = createImportingDoc(
      `import { Str } from './model'
interface Thing {
  @expect.minLength 5
  pw: Str
}`,
      `export type Str = string`
    )
    expect(typeGuardErrors(doc)).toEqual([])
  })

  it('still flags @expect.minLength on an imported number field', () => {
    const doc = createImportingDoc(
      `import { Num } from './model'
interface Thing {
  @expect.minLength 5
  age: Num
}`,
      `export type Num = number`
    )
    expect(typeGuardErrors(doc).length).toBeGreaterThan(0)
  })
})
