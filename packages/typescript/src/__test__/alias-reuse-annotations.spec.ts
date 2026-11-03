import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { AnnotationSpec, build } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType, TAtscriptTypeObject } from '../runtime/annotated-type'
import { Validator } from '../runtime/validator'

/*
 * Reusing a non-mutating `annotate … as` alias keeps the alias's prop annotations: through
 * `extends`, an intersection with it and a reference to one of its props — in its file and in
 * another one. Interface-level annotations are not inherited through `extends` (documented).
 * A top-level annotation of a mutating `annotate` block is checked against its target's node
 * type and applied to the target.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const annotations = {
  x: {
    title: new AnnotationSpec({
      nodeType: ['interface', 'type'],
      argument: { name: 'text', type: 'string' },
    }),
  },
}

async function load(files: Record<string, string>, entry: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-alias-reuse-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({ jsonSchema: false })],
    annotations,
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const file of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(file.source)}.js`), file.content)
  }
  return (await import(path.join(dir, `${entry}.js`))) as Record<string, TAtscriptAnnotatedType>
}

const BASE = `@meta.description 'Base'
export interface Base {
  @meta.label 'Name'
  name: string
}

@meta.description 'Alias'
export annotate Base as Alias {
  @meta.label 'AliasName'
  @expect.minLength 3
  name
}
`

const USES = `export interface Child extends Alias {
  extra?: string
}
export type Both = Alias & {
  extra?: string
}
export interface Ref {
  n: Alias.name
}
`

const props = (t: TAtscriptAnnotatedType) => (t.type as TAtscriptTypeObject).props

describe('an annotate … as alias reused: its prop annotations are kept', () => {
  for (const crossFile of [false, true]) {
    it(crossFile ? 'in another file' : 'in the same file', async () => {
      const m = crossFile
        ? await load(
            { 'base.as': BASE, 'uses.as': `import { Alias } from './base'\n${USES}` },
            'uses.as'
          )
        : await load({ 'base.as': BASE + USES }, 'base.as')
      const { Child, Both, Ref } = m

      // extends: the alias's prop annotations; not its interface-level ones
      expect(props(Child).get('name')!.metadata.get('meta.label')).toBe('AliasName')
      expect(Child.metadata.get('meta.description')).toBeUndefined()
      // an intersection with the alias
      const bothName =
        Both.type.kind === 'object'
          ? props(Both).get('name')!
          : (Both.type as any).items
              .map((item: TAtscriptAnnotatedType) => (item.type as any).props?.get('name'))
              .find(Boolean)
      expect(bothName.metadata.get('meta.label')).toBe('AliasName')
      // a reference to one of its props
      expect(props(Ref).get('n')!.metadata.get('meta.label')).toBe('AliasName')

      // … and the alias's constraints validate there
      expect(new Validator(Child).validate({ name: 'ab' }, true)).toBe(false)
      expect(new Validator(Both).validate({ name: 'ab' }, true)).toBe(false)
      expect(new Validator(Ref).validate({ n: 'ab' }, true)).toBe(false)
      for (const t of [Child, Both]) {
        expect(new Validator(t).validate({ name: 'abc' }, true)).toBe(true)
      }
      expect(new Validator(Ref).validate({ n: 'abc' }, true)).toBe(true)
    })
  }
})

describe('a top-level annotation of a mutating annotate block', () => {
  it("is checked against the target's node type and applies to the target", async () => {
    const { Base, Form } = await load(
      {
        'm.as': `export interface Base {
  name: string
}
export type Form = {
  a: string
}

@x.title 'Base title'
annotate Base {
  name
}

@x.title 'Form title'
annotate Form {
  a
}
`,
      },
      'm.as'
    )
    expect(Base.metadata.get('x.title' as never)).toBe('Base title')
    expect(Form.metadata.get('x.title' as never)).toBe('Form title')
  })
})
