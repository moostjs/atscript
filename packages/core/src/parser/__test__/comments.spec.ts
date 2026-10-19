import { describe, expect, it } from 'vitest'

import { parseAtscript } from '..'
import { AnnotationSpec } from '../../annotations'
import { expectAnnotations } from '../../defaults/expect-annotations'
import { metaAnnotations } from '../../defaults/meta-annotations'
import { AtscriptDoc } from '../../document'
import { SemanticPrimitiveNode } from '../nodes/primitive-node'

/**
 * Parses `withComments` and its comment-free twin `plain`; both must parse cleanly
 * and produce the same semantic tree (comments are ignored, nothing else changes).
 */
function expectSameAs(withComments: string, plain: string) {
  const a = parseAtscript(withComments)
  const b = parseAtscript(plain)
  expect(a.messages).toEqual([])
  expect(b.messages).toEqual([])
  expect(a.toString()).toBe(b.toString())
  return a
}

/** `line:message` diagnostics of `source`, with an `expr`-typed `@t.calc` registered. */
function diag(source: string) {
  const doc = new AtscriptDoc('test', {
    annotations: {
      t: { calc: new AnnotationSpec({ argument: { name: 'e', type: 'expr' } }) },
    },
  })
  doc.update(source)
  return doc.getDiagMessages().map(m => `${m.range.start.line}:${m.message}`)
}

describe('comments around annotations', () => {
  it('trailing // after a bare annotation', () => {
    expectSameAs(
      `interface User {
    @meta.id // primary key
    id: string
}`,
      `interface User {
    @meta.id
    id: string
}`
    )
  })

  it('trailing /* */ after annotation arguments', () => {
    expectSameAs(
      `interface User {
    @expect.minLength 3, "Too short" /* shown to users */
    name: string
}`,
      `interface User {
    @expect.minLength 3, "Too short"
    name: string
}`
    )
  })

  it('trailing comments after every argument kind', () => {
    expectSameAs(
      `interface T {
    @a.str 'x' // c
    @a.num 42 // c
    @a.bool true // c
    @a.nul null /* c */
    @a.ident Foo // c
    @a.ref User.address.city // c
    @a.multi 'x', 1, false, Foo.bar // c
    @a.empty , 'second' // c
    @a.query \`status = 'open'\` // c
    p: string
}`,
      `interface T {
    @a.str 'x'
    @a.num 42
    @a.bool true
    @a.nul null
    @a.ident Foo
    @a.ref User.address.city
    @a.multi 'x', 1, false, Foo.bar
    @a.empty , 'second'
    @a.query \`status = 'open'\`
    p: string
}`
    )
  })

  it('block comments between arguments are ignored', () => {
    expectSameAs(
      `interface T {
    @a.args 1 /* x */, /* y */ 2 /* z */
    @a.lead /* before args */ 'v'
    p: string
}`,
      `interface T {
    @a.args 1, 2
    @a.lead 'v'
    p: string
}`
    )
  })

  it('comments between annotation lines and before the property', () => {
    expectSameAs(
      `interface T {
    // leading comment
    @a.one 1
    // between annotations
    /* block between */
    @a.two
    // between last annotation and property
    p: string // end of property line
    q: number /* end of property line */
}`,
      `interface T {
    @a.one 1
    @a.two
    p: string
    q: number
}`
    )
  })

  it('nested objects, unions and arrays', () => {
    expectSameAs(
      `interface T {
    @a.outer // c
    nested: {
        @a.inner 'x' // c
        deep: {
            @a.deeper 1, 2 /* c */
            v: string // c
        }
    }
    @a.union // c
    u: string | number // c
    @a.arr // c
    list: string[]
}`,
      `interface T {
    @a.outer
    nested: {
        @a.inner 'x'
        deep: {
            @a.deeper 1, 2
            v: string
        }
    }
    @a.union
    u: string | number
    @a.arr
    list: string[]
}`
    )
  })

  it('top-level annotations before export interface / type', () => {
    expectSameAs(
      `@db.table 'users' // table name
@a.flag /* c */
export interface User {
    id: string
}

@a.label 'Status' // c
export type Status = 'active' | 'inactive' // c
`,
      `@db.table 'users'
@a.flag
export interface User {
    id: string
}

@a.label 'Status'
export type Status = 'active' | 'inactive'
`
    )
  })

  it('ad-hoc annotate blocks', () => {
    expectSameAs(
      `interface User {
    name: string
    address: { city: string }
}
@a.top // c
annotate User as UserForm {
    @a.label 'Name' // c
    name // c
    @a.label 'City' /* c */
    address.city
}`,
      `interface User {
    name: string
    address: { city: string }
}
@a.top
annotate User as UserForm {
    @a.label 'Name'
    name
    @a.label 'City'
    address.city
}`
    )
  })

  it('a block comment spanning lines ends the annotation like a line break', () => {
    // the property after `*/` must not be read as an annotation argument
    expectSameAs(
      `interface T {
    @a.flag /* spans
    two lines */ p: string
    @a.args 1 /* spans
    */ q: number
}`,
      `interface T {
    @a.flag
    p: string
    @a.args 1
    q: number
}`
    )
    // same as a trailing comma followed by a line break: the next line is not an argument
    const r = parseAtscript(`interface T {
    @a.x 1, /* spans
    */ 2
    p: string
}`)
    expect(r.messages.length).toBeGreaterThan(0)
  })

  it('a block comment spanning lines elsewhere in a declaration is skipped as before', () => {
    // `%` marks where the comment goes; each source must parse exactly as without it
    const sources = [
      `interface X {\n  name % : string\n  opt % ?: string\n}`,
      `interface X {\n  name: % string\n}`,
      `interface X {\n  u: string % | number\n  w: string | % number\n}`,
      `interface X {\n  u: 'a' %\n    | 'b'\n  v: string\n}`,
      `type U = 'a' % | 'b'`,
      `type U = 'a'\n  | % 'b'\n  | 'c' %`,
      `type I = A % & % B`,
      `interface X % {\n  a: string\n}`,
      `export % interface X {\n  a: string\n}`,
      `type X % = % string`,
      `interface X {\n  a: string % []\n  t: [string, % number]\n  e: string % .email\n}`,
      `interface X {\n  a: string % ; b: number\n  n: % {\n    v: string\n  }\n}`,
      `type G = ( % 'a' | 'b' % )[]`,
      `import % { A %, B } % from % './x'`,
      `interface U { a: { b: string } }\nannotate % U % as F % {\n  a % .b\n}`,
    ]
    for (const src of sources) {
      expectSameAs(src.replaceAll('%', '/* spans\n  lines */'), src.replaceAll('%', ''))
    }
  })

  it('a backtick after a multi-line block comment is not an argument of the line above', () => {
    const withComment = diag('interface A { a: number }\n@t.calc `a` /* x\n */ `a +`\n')
    expect(withComment).toEqual(diag('interface A { a: number }\n@t.calc `a`\n`a +`\n'))
    // not parsed as the `@t.calc` expression of the previous line
    expect(withComment.join('\n')).not.toContain('Expected operand')
  })

  it('comments inside a chained ref argument', () => {
    expectSameAs(
      `interface T {
    @a.ref User /* c */ .address. /* c */ city // c
    p: string
}`,
      `interface T {
    @a.ref User.address.city
    p: string
}`
    )
  })

  it('comment at end of file right after an annotation', () => {
    const r = parseAtscript(`interface T {
    p: string
}
@a.x // c`)
    // a dangling annotation without a target is a separate error; it must not throw
    // nor be reported as an unexpected comment token
    expect(r.messages.map(m => m.message).join('\n')).not.toContain('[comment]')
  })

  it('// inside string arguments is not a comment', () => {
    const r = expectSameAs(
      `interface T {
    @a.url 'https://x.y/path' // real comment
    @a.pattern "^//", 'g' /* real */
    @a.both 'a // b', "c /* d */ e"
    p: string
}`,
      `interface T {
    @a.url 'https://x.y/path'
    @a.pattern "^//", 'g'
    @a.both 'a // b', "c /* d */ e"
    p: string
}`
    )
    const s = r.toString()
    expect(s).toContain('https://x.y/path')
    expect(s).toContain('^//')
    expect(s).toContain('a // b')
    expect(s).toContain('c /* d */ e')
  })

  it('annotation values survive into AtscriptDoc (no diagnostics, args intact)', () => {
    const primitives = new Map<string, SemanticPrimitiveNode>()
    primitives.set('string', new SemanticPrimitiveNode('string', { type: 'string' }))
    const doc = new AtscriptDoc('test', {
      primitives,
      annotations: { meta: metaAnnotations, expect: expectAnnotations },
    })
    doc.update(`export interface User {
    @meta.id // primary key
    id: string

    @expect.minLength 3, "Too short" /* shown to users */
    @expect.pattern "^https://", "u", 'Bad url' // c
    name: string
}`)
    expect(doc.getDiagMessages().filter(m => m.severity === 1)).toEqual([])
    const user = doc.getDeclarationOwnerNode('User')?.node
    expect(user).toBeDefined()
    const s = user!.toString()
    expect(s).toContain('@meta.id')
    expect(s).toContain('Too short')
    expect(s).toContain('^https://')
    expect(s).not.toContain('primary key')
    expect(s).not.toContain('shown to users')
  })
})

describe('AtscriptDoc.isInComment', () => {
  it('locates offsets inside // and /* */ comments, delimiters included', () => {
    const text = `@a 1 // trailing\n/* block\n  spans */ x: 'not // a comment' /* open`
    const doc = new AtscriptDoc('test', {})
    doc.update(text)
    const at = (marker: string, shift = 0) => doc.isInComment(text.indexOf(marker) + shift)
    expect(at('// trailing')).toBe(false) // just before `//`
    expect(at('// trailing', 1)).toBe(true)
    expect(at('\n/* block')).toBe(true) // end of the `//` line
    expect(at('block')).toBe(true)
    expect(at('spans */', 2)).toBe(true) // a line opened by an earlier `/*`
    expect(at(' x:')).toBe(false) // right after `*/`
    expect(at('not // a')).toBe(false) // `//` inside a string
    expect(doc.isInComment(text.length)).toBe(true) // end of an unclosed `/*`
    expect(doc.isInComment(0)).toBe(false)
  })
})
