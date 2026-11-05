import { AnnotationSpec } from '@atscript/core'
import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import {
  deserializeAnnotatedType,
  serializeAnnotatedType,
  type TSerializedAnnotatedType,
} from '../runtime/serialize'
import { stringLiterals, translateServed } from '../runtime/translate-served'
import { registerUserText, userTextOf } from '../runtime/user-text'
import { VALIDATOR_MESSAGES } from '../runtime/validator-messages'
import { tmpBuilder } from './tmp-build'

const load = tmpBuilder('atscript-translate-served-')

/** A plugin with text and expression arguments (single, `multiple`, field lists). */
const plugin = {
  name: 'translate-served-test',
  config() {
    return {
      annotations: {
        x: {
          hint: new AnnotationSpec({ argument: { name: 'text', type: 'string', userText: true } }),
          note: new AnnotationSpec({
            multiple: true,
            argument: { name: 'text', type: 'string', userText: true },
          }),
          fn: new AnnotationSpec({
            argument: { name: 'fn', type: 'string', userText: 'expression' },
          }),
          check: new AnnotationSpec({
            multiple: true,
            argument: { name: 'fn', type: 'string', userText: 'expression' },
          }),
          attr: new AnnotationSpec({
            multiple: true,
            argument: [
              { name: 'name', type: 'string' },
              { name: 'fn', type: 'string', userText: 'expression' },
            ],
          }),
        },
      },
    }
  },
}

const SOURCE = `export interface Address {
  @meta.label 'Street'
  @x.hint 'Street hint'
  street: string
}

@meta.label 'User'
@x.check '(v) => v.a ? true : "Need a"'
@x.check '(v) => v.b || "B missing"'
export interface User {
  @meta.label 'Name'
  @meta.description 'Not in the dictionary'
  @expect.minLength 3, 'Too short'
  @expect.pattern '^a', '', 'Starts with a'
  @expect.pattern 'b$', '', 'Ends with b'
  @x.fn '(v) => v ? "Yes" : "No"'
  @x.attr 'title', '(v) => "Tip"'
  @x.attr 'data-x', '() => "raw"'
  @x.note 'First note'
  @x.note 'Second note'
  name: string

  home: Address

  @meta.label 'Work'
  work: Address

  @meta.label 'Tags'
  tags: {
    @meta.label 'Tag'
    value: string
  }[]

  plain: number

  street: Address.street
}
`

const DE: Record<string, string> = {
  'Street': 'Straße',
  'Street hint': 'Straßenhinweis',
  'User': 'Benutzer',
  'Need a': 'A nötig',
  'B missing': 'B fehlt',
  'Name': 'Name (de)',
  'Too short': 'Zu kurz',
  'Starts with a': 'Beginnt mit a',
  'Ends with b': 'Endet mit b',
  'Yes': 'Ja',
  'No': 'Nein',
  'Tip': 'Tipp',
  'First note': 'Erste Notiz',
  'Second note': 'Zweite Notiz',
  'Work': 'Arbeit',
  'Tags': 'Schlagworte',
  'Tag': 'Schlagwort',
  // not user text: an attribute's name, an expression's source
  'title': 'TITEL',
  '(v) => v ? "Yes" : "No"': 'NEVER',
}

const de = (text: string) => DE[text]

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) {
      deepFreeze(item)
    }
    Object.freeze(value)
  }
  return value
}

interface TNode {
  type: { kind: string; props?: Record<string, TNode>; of?: TNode; id?: string }
  metadata: Record<string, unknown>
  ref?: { type: TNode; field: string }
}

const props = (node: unknown) => (node as TNode).type.props!

let User: TAtscriptAnnotatedType
let json: TSerializedAnnotatedType

beforeAll(async () => {
  const { load: imp } = await load({ 'user.as': SOURCE }, [plugin])
  ;({ User } = await imp('user.as'))
  json = deepFreeze(serializeAnnotatedType(User, { refDepth: 1 }))
})

describe('translateServed', () => {
  it('translates text keys at every depth: props, items, `$ref` uses, ref targets', () => {
    const before = structuredClone(json)
    const { value } = translateServed(json, de)
    expect(json).toEqual(before)
    expect(value).not.toBe(json)
    expect(value.metadata['meta.label']).toBe('Benutzer')
    const p = props(value)
    expect(p.name.metadata['meta.label']).toBe('Name (de)')
    expect(p.name.metadata['meta.description']).toBe('Not in the dictionary')
    expect(props(p.home).street.metadata).toMatchObject({
      'meta.label': 'Straße',
      'x.hint': 'Straßenhinweis',
    })
    // (the second use of Address is a `$ref` with metadata of its own)
    expect(p.work.type.kind).toBe('$ref')
    expect(p.work.metadata['meta.label']).toBe('Arbeit')
    expect(p.tags.metadata['meta.label']).toBe('Schlagworte')
    expect(props(p.tags.type.of).value.metadata['meta.label']).toBe('Schlagwort')
    // (a field typed by a type path: its own metadata and its ref target's body)
    expect(p.street.metadata['meta.label']).toBe('Straße')
    expect(p.street.ref!.field).toBe('street')
    expect(JSON.stringify(p.street.ref!.type)).not.toContain('"Street"')
  })

  it('translates `multiple` values and the text fields of value objects only', () => {
    const name = props(translateServed(json, de).value).name.metadata
    expect(name['expect.minLength']).toEqual({ length: 3, message: 'Zu kurz' })
    expect(name['expect.pattern']).toEqual([
      { pattern: '^a', flags: '', message: 'Beginnt mit a' },
      { pattern: 'b$', flags: '', message: 'Endet mit b' },
    ])
    expect(name['x.note']).toEqual(['Erste Notiz', 'Zweite Notiz'])
    // (`name` is no text: 'title' stays)
    expect(name['x.attr']).toEqual([
      { name: 'title', fn: '(v) => "Tip"' },
      { name: 'data-x', fn: '() => "raw"' },
    ])
  })

  it('keeps expressions as written and collects their translated literals into `texts`', () => {
    const { value, texts } = translateServed(json, de)
    expect(value.metadata['x.check']).toBe(json.metadata['x.check'])
    expect(props(value).name.metadata['x.fn']).toBe('(v) => v ? "Yes" : "No"')
    expect(texts).toEqual({
      'Need a': 'A nötig',
      'B missing': 'B fehlt',
      'Yes': 'Ja',
      'No': 'Nein',
      'Tip': 'Tipp',
    })
  })

  it('shares every part without translated text', () => {
    const { value } = translateServed(json, de)
    expect(props(value).plain).toBe(props(json).plain)
    expect(props(value).name.type).toBe(props(json).name.type)
    expect(props(value).tags.type.of!.type.kind).toBe('object')
  })

  it('returns the input itself when nothing is translated', () => {
    for (const t of [() => undefined, (text: string) => text]) {
      const { value, texts } = translateServed(json, t)
      expect(value).toBe(json)
      expect(texts).toEqual({})
    }
  })

  it('reads any JSON carrying serialized types, and leaves `$i18n` alone', () => {
    const payload = deepFreeze({
      fields: [{ path: 'x', label: 'Name' }],
      type: { ...json, $i18n: { Name: 'Name' } },
    })
    const { value } = translateServed(payload, de)
    expect(value.fields).toBe(payload.fields)
    expect(value.type.metadata['meta.label']).toBe('Benutzer')
    expect(value.type.$i18n).toBe(payload.type.$i18n)
  })

  it('reads a prop named `metadata` as a prop', async () => {
    const { load: imp } = await load({
      'm.as': `export interface M {
  @meta.label 'Meta'
  metadata: {
    @meta.label 'Name'
    name: string
  }
}`,
    })
    const { M } = await imp('m.as')
    const { value } = translateServed(serializeAnnotatedType(M), de)
    const meta = props(value).metadata
    expect(meta.metadata['meta.label']).toBe('Meta')
    expect(props(meta).name.metadata['meta.label']).toBe('Name (de)')
  })
})

describe('translateServed, edge cases', () => {
  it('translates the type a field-list text annotation refers to', async () => {
    const linkPlugin = {
      name: 'translate-served-link',
      config() {
        return {
          annotations: {
            y: {
              link: new AnnotationSpec({
                argument: [
                  { name: 'target', type: 'ref' },
                  { name: 'label', type: 'string', userText: true },
                ],
              }),
            },
          },
        }
      },
    }
    const { load: imp } = await load(
      {
        'link.as': `@meta.label 'Target'
export interface Tgt {
  @meta.id
  name: string
}
export interface Root {
  @y.link Tgt, 'Link'
  l: string
}`,
      },
      [linkPlugin]
    )
    const { Root } = await imp('link.as')
    const json = deepFreeze(serializeAnnotatedType(Root, { refDepth: 1 }))
    const { value } = translateServed(json, text => ({ Target: 'Ziel', Link: 'Verweis' })[text])
    expect(props(value).l.metadata['y.link']).toEqual({
      target: { id: 'Tgt', metadata: { 'meta.label': 'Ziel' } },
      label: 'Verweis',
    })
  })

  it('walks a non-string value of a text key', () => {
    registerUserText('z.text', true)
    const json = deepFreeze({
      metadata: { 'z.text': { id: 'T', metadata: { 'meta.label': 'Name' } } },
    })
    expect(translateServed(json, de).value.metadata['z.text'].metadata['meta.label']).toBe(
      'Name (de)'
    )
  })

  it('takes only strings from the translator (a plain dictionary inherits functions)', () => {
    registerUserText('z.calc', 'expression')
    const dict: Record<string, string> = { Name: 'Name (de)' }
    const json = deepFreeze({
      metadata: {
        'meta.label': 'constructor',
        'meta.description': 'toString',
        'z.calc': "() => 'hasOwnProperty'",
      },
    })
    const { value, texts } = translateServed(json, text => dict[text])
    expect(value).toBe(json)
    expect(texts).toEqual({})
  })

  it('never downgrades an expression, and reads a field listed both ways as an expression', () => {
    registerUserText('z.fn', 'expression')
    registerUserText('z.fn', true)
    expect(userTextOf('z.fn')).toBe('expression')
    registerUserText('z.both', ['fn'])
    registerUserText('z.both', ['fn()'])
    expect(userTextOf('z.both')).toEqual(['fn()'])
    const json = deepFreeze({ metadata: { 'z.both': { fn: '() => "Yes"' } } })
    const { value, texts } = translateServed(json, text =>
      text === 'Yes' ? 'Ja' : text.includes('=>') ? 'NEVER' : undefined
    )
    expect(value).toBe(json)
    expect(texts).toEqual({ Yes: 'Ja' })
  })
})

describe('translateServed, built-in format messages', () => {
  it('keeps a primitive format message, so the client still reports its code', async () => {
    const { load: imp } = await load({
      'f.as': `export interface F {
  @meta.label 'Email'
  email: string.email
}`,
    })
    const { F } = await imp('f.as')
    const json = deepFreeze(serializeAnnotatedType(F))
    const dict: Record<string, string> = {
      [VALIDATOR_MESSAGES.EMAIL]: 'Ungültige E-Mail',
      Email: 'E-Mail',
    }
    const { value } = translateServed(json, text => dict[text])
    expect(props(value).email.metadata['meta.label']).toBe('E-Mail')
    expect(JSON.stringify(json)).toContain(JSON.stringify(VALIDATOR_MESSAGES.EMAIL))
    expect(JSON.stringify(value)).not.toContain('Ungültige E-Mail')
    const validator = deserializeAnnotatedType(value).validator()
    expect(validator.validate({ email: 'nope' }, true)).toBe(false)
    expect(validator.errors[0]).toMatchObject({ path: 'email', code: 'EMAIL' })
  })
})

describe('$i18n on a serialized type', () => {
  it('is ignored by deserializeAnnotatedType', () => {
    const served: TSerializedAnnotatedType = {
      ...structuredClone(json),
      $i18n: { MIN_LENGTH: 'Mindestens {min} Zeichen', Tip: 'Tipp' },
    }
    const type = deserializeAnnotatedType(served)
    expect(serializeAnnotatedType(type, { refDepth: 1 })).toEqual(json)
  })
})

describe('string literals of an expression', () => {
  it.each([
    ['quotes and escaped quotes', `(v) => v ? 'It\\'s' : "say \\"hi\\""`, ["It's", 'say "hi"']],
    ['the other quote inside', `"it's" + 'say "x"'`, ["it's", 'say "x"']],
    ['a template without substitutions', '() => `Plain text`', ['Plain text']],
    [
      'a template with a substitution: only the literals inside it',
      // oxlint-disable-next-line no-template-curly-in-string
      "(v) => `Hi ${v ? 'Sir' : `Madam`}`",
      ['Sir', 'Madam'],
    ],
    // oxlint-disable-next-line no-template-curly-in-string
    ['braces inside a substitution', "`a ${ {x: 'In'}.x } b` + 'Out'", ['In', 'Out']],
    ['comments', "// 'no'\n'yes' /* \"no\" */ + 'too'", ['yes', 'too']],
    ['a regular expression', `(v) => /'|"/.test(v) ? 'Quote' : 'None'`, ['Quote', 'None']],
    ['a regex class with /', `(v) => /[/']/.test(v) && 'Slash'`, ['Slash']],
    ['a regex after return', "(v) => { return /'/.test(v) || 'Bad' }", ['Bad']],
    ['division is no regex', "(a, b) => a / b > 1 ? 'Big' : 'Small' / 2", ['Big', 'Small']],
    ['unicode and hex escapes', String.raw`'ét\u{e9}' + "\x41"`, ['été', 'A']],
    ['empty and blank literals', "'' + ' ' + 'x'", ['x']],
    ['a repeated literal once', "v ? 'A' : 'A'", ['A']],
    ['division after a postfix ++', "(a) => a++ / 2 + 'X' + 'Y'", ['X', 'Y']],
    [
      'division after a non-ASCII name',
      "(café) => café / 2 > 1 ? 'Big' : 'Small'",
      ['Big', 'Small'],
    ],
    ['a regex after if (…)', "(v) => { if (v) /'/.test(v); return 'Ok' }", ['Ok']],
    ['division after a parenthesized value', "x = (y) / 2; 'D'", ['D']],
  ])('%s', (_name, source, expected) => {
    expect(stringLiterals(source)).toEqual(expected)
  })
})
