import { AnnotationSpec } from '@atscript/core'
import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { serializeAnnotatedType, type TSerializedAnnotatedType } from '../runtime/serialize'
import { translateServed, translateUserText } from '../runtime/translate-served'
import { $ut, userTextKeys, userTextOf } from '../runtime/user-text'
import { VALIDATOR_MESSAGES } from '../runtime/validator-messages'
import { deepFreeze } from '../test-utils'
import { tmpBuilder } from './tmp-build'

const load = tmpBuilder('atscript-translate-user-text-')

const plugin = {
  name: 'translate-user-text-test',
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
          option: new AnnotationSpec({
            multiple: true,
            argument: [
              { name: 'label', type: 'string', userText: true },
              { name: 'value', type: 'string', optional: true },
            ],
          }),
        },
      },
    }
  },
}

const SOURCE = `@meta.label 'User'
export interface User {
  @meta.label 'Name'
  @meta.description 'Not in the dictionary'
  @meta.required 'Name is required'
  @expect.minLength 3, 'Too short'
  @expect.pattern '^a', '', 'Starts with a'
  @expect.pattern 'b$', '', 'Ends with b'
  @x.hint 'Name hint'
  @x.fn '(v) => v ? "Yes" : "No"'
  @x.note 'First note'
  @x.note 'Second note'
  @x.option 'Red', 'r'
  @x.option 'Blue', 'b'
  name: string

  @meta.label 'Email'
  @expect.message 'Bad address'
  email: string.email

  @meta.id
  id: number
}
`

const DE: Record<string, string> = {
  'User': 'Benutzer',
  'Name': 'Name (de)',
  'Name is required': 'Name nötig',
  'Too short': 'Zu kurz',
  'Starts with a': 'Beginnt mit a',
  'Ends with b': 'Endet mit b',
  'Name hint': 'Namenshinweis',
  'First note': 'Erste Notiz',
  'Second note': 'Zweite Notiz',
  'Red': 'Rot',
  'Blue': 'Blau',
  'Email': 'E-Mail',
  'Bad address': 'Falsche Adresse',
  [VALIDATOR_MESSAGES.EMAIL]: 'Ungültige E-Mail',
  // not user text: an option's value, an expression's source
  'r': 'NEVER',
  '(v) => v ? "Yes" : "No"': 'NEVER',
}
const de = (text: string) => DE[text]

/** What `translateServed` makes of `value` held by metadata key `key` of a serialized type. */
function served(key: string, value: unknown, t = de): unknown {
  const json = { metadata: { [key]: structuredClone(value) } }
  return (translateServed(json, t).value.metadata as Record<string, unknown>)[key]
}

let User: TAtscriptAnnotatedType
let json: TSerializedAnnotatedType

beforeAll(async () => {
  const { load: imp } = await load({ 'user.as': SOURCE }, [plugin])
  ;({ User } = await imp('user.as'))
  json = serializeAnnotatedType(User)
})

describe('translateUserText', () => {
  it('translates a text key, a `{ message }` object, and each item of a `multiple` list', () => {
    expect(translateUserText('meta.label', 'Name', de)).toBe('Name (de)')
    expect(translateUserText('expect.minLength', { length: 3, message: 'Too short' }, de)).toEqual({
      length: 3,
      message: 'Zu kurz',
    })
    expect(translateUserText('meta.required', { message: 'Name is required' }, de)).toEqual({
      message: 'Name nötig',
    })
    expect(
      translateUserText(
        'expect.pattern',
        [
          { pattern: '^a', flags: '', message: 'Starts with a' },
          { pattern: 'b$', flags: '', message: 'Ends with b' },
        ],
        de
      )
    ).toEqual([
      { pattern: '^a', flags: '', message: 'Beginnt mit a' },
      { pattern: 'b$', flags: '', message: 'Endet mit b' },
    ])
    expect(translateUserText('x.note', ['First note', 'Second note'], de)).toEqual([
      'Erste Notiz',
      'Zweite Notiz',
    ])
  })

  it('translates the text field of option objects only', () => {
    const options = deepFreeze([
      { label: 'Red', value: 'r' },
      { label: 'Blue', value: 'b' },
    ])
    expect(translateUserText('x.option', options, de)).toEqual([
      { label: 'Rot', value: 'r' },
      { label: 'Blau', value: 'b' },
    ])
  })

  it('keeps a built-in format message, which the validator reports by its code', () => {
    const email = VALIDATOR_MESSAGES.EMAIL
    expect(
      translateUserText('expect.pattern', { pattern: '.', flags: '', message: email }, de)
    ).toEqual({ pattern: '.', flags: '', message: email })
    expect(translateUserText('expect.message', email, de)).toBe(email)
    // (a text of the app's own is translated)
    expect(translateUserText('expect.message', 'Bad address', de)).toBe('Falsche Adresse')
  })

  it('leaves non-user-text keys, expressions and other value shapes as they are', () => {
    const attr = deepFreeze({ label: 'Name' })
    expect(translateUserText('meta.id', 'Name', de)).toBe('Name')
    expect(translateUserText('x.unknown', attr, de)).toBe(attr)
    // (an expression's literals are translated in a served type's `texts`, not here)
    const fn = '(v) => v ? "Yes" : "No"'
    expect(translateUserText('x.fn', fn, () => 'NEVER')).toBe(fn)
    expect(translateUserText('meta.required', true, de)).toBe(true)
    expect(translateUserText('meta.label', undefined, de)).toBeUndefined()
    // (an object under a text key without fields, a nested `metadata` key: not walked)
    const odd = deepFreeze({ metadata: { 'meta.label': 'Name' } })
    expect(translateUserText('meta.label', odd, de)).toBe(odd)
  })

  it('returns the same reference when nothing is translated, new parts only where changed', () => {
    const miss = deepFreeze({ length: 3, message: 'Not in the dictionary' })
    expect(translateUserText('expect.minLength', miss, de)).toBe(miss)
    expect(translateUserText('meta.label', 'Not in the dictionary', de)).toBe(
      'Not in the dictionary'
    )
    const list = deepFreeze(['First note', 'Not in the dictionary'])
    expect(translateUserText('x.note', list, de)).toEqual(['Erste Notiz', 'Not in the dictionary'])
    const keep = deepFreeze(['No', 'Nope'])
    expect(translateUserText('x.note', keep, de)).toBe(keep)
    // (the translator answers `undefined` or a non-string: the text stays)
    expect(translateUserText('meta.label', 'Name', () => undefined)).toBe('Name')
    expect(translateUserText('meta.label', 'Name', (() => 5) as never)).toBe('Name')
  })

  it('never changes its input', () => {
    const value = deepFreeze([
      { pattern: '^a', flags: '', message: 'Starts with a' },
      { pattern: 'b$', flags: '', message: 'Not in the dictionary' },
    ])
    const before = structuredClone(value)
    const out = translateUserText('expect.pattern', value, de) as typeof value
    expect(value).toEqual(before)
    expect(out).not.toBe(value)
    // (what did not change is shared)
    expect(out[1]).toBe(value[1])
  })
})

/** A live value for key `key` of kind `mode`, carrying `text` in each text field. */
function liveOf(mode: NonNullable<ReturnType<typeof userTextOf>>, text: string): unknown {
  if (mode === true) {
    return text
  }
  if (mode === 'expression') {
    return `() => "${text}"`
  }
  return Object.fromEntries(
    mode.map(f => (f.endsWith('()') ? [f.slice(0, -2), `() => "${text}"`] : [f, text]))
  )
}

describe('translateUserText and translateServed are one rule', () => {
  beforeAll(() => {
    $ut('p.text', 'p.expr()', 'p.item:label', 'p.item:fn()', 'p.item:code')
  })

  it('gives one result for every registered user-text key, single or `multiple`', () => {
    const keys = [...userTextKeys()]
    // (core's keys and the plugins' registered by the loaded modules and `$ut` above)
    expect(keys.map(([key]) => key)).toEqual(
      expect.arrayContaining(['meta.label', 'meta.required', 'x.option', 'p.item', 'p.expr'])
    )
    for (const [key, mode] of keys) {
      for (const text of ['Name', 'Not in the dictionary', VALIDATOR_MESSAGES.EMAIL]) {
        const live = liveOf(mode, text)
        const list = [liveOf(mode, text), liveOf(mode, 'Red')]
        for (const value of [live, list]) {
          const out = translateUserText(key, deepFreeze(structuredClone(value)), de)
          expect(out, key).toEqual(served(key, value))
        }
      }
    }
  })

  it('gives the same result as the served type for the metadata of a compiled type', () => {
    const live = User.type.kind === 'object' ? User.type.props : new Map()
    const serialized = (json.type as { props: Record<string, { metadata: object }> }).props
    const keys = new Set<string>()
    for (const [name, prop] of live) {
      const sMeta = serialized[name].metadata as Record<string, unknown>
      const translated = translateServed(deepFreeze(serialized[name]), de).value.metadata as Record<
        string,
        unknown
      >
      for (const [key, value] of prop.metadata) {
        keys.add(key)
        expect(translateUserText(key, value, de), `${name}.${key}`).toEqual(translated[key])
        if (userTextOf(key) === undefined) {
          // (not user text: the very same value)
          expect(translateUserText(key, value, de)).toBe(value)
          expect(translated[key]).toEqual(sMeta[key])
        }
      }
    }
    expect([...keys]).toEqual(
      expect.arrayContaining(['meta.label', 'meta.required', 'expect.pattern', 'x.option'])
    )
  })
})
