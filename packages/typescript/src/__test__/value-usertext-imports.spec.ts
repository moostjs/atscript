import { AnnotationSpec, PluginManager, userTextAnnotations } from '@atscript/core'
import { describe, expect, it } from 'vitest'

import type { TAtscriptAnnotatedType, TAtscriptTypeObject } from '../runtime/annotated-type'
import { createDataFromAnnotatedType } from '../runtime/default-value'
import { CORE_USER_TEXT, registerUserText, userTextKeys, userTextOf } from '../runtime/user-text'
import { tmpBuilder } from './tmp-build'

const load = tmpBuilder('atscript-codegen-')

const prop = (t: TAtscriptAnnotatedType, name: string) =>
  (t.type as TAtscriptTypeObject).props.get(name)!

/** A plugin with a `value` argument and user-text arguments of its own. */
const plugin = {
  name: 'at2-test',
  config() {
    return {
      annotations: {
        db: {
          default: new AnnotationSpec({
            nodeType: ['prop'],
            argument: { name: 'value', type: 'value' },
          }),
        },
        x: {
          hint: new AnnotationSpec({ argument: { name: 'text', type: 'string', userText: true } }),
          action: new AnnotationSpec({
            argument: [
              { name: 'name', type: 'string' },
              { name: 'label', type: 'string', userText: true },
            ],
          }),
        },
      },
    }
  },
}

describe('`value` arguments in generated code', () => {
  it('keep the literal’s kind: number, boolean, string', async () => {
    const { load: imp } = await load(
      {
        'm.as': `export interface Row {
  @db.default 0
  count: number
  @db.default -2.5
  ratio: number
  @db.default true
  on: boolean
  @db.default 'open'
  status: string
  @db.default '[1,2]'
  list: number[]
  @db.default 0
  price: decimal
  @db.default 12.50
  total: decimal | null
}`,
      },
      [plugin]
    )
    const { Row } = await imp('m.as')
    expect(prop(Row, 'count').metadata.get('db.default')).toBe(0)
    expect(prop(Row, 'ratio').metadata.get('db.default')).toBe(-2.5)
    expect(prop(Row, 'on').metadata.get('db.default')).toBe(true)
    expect(prop(Row, 'status').metadata.get('db.default')).toBe('open')
    expect(prop(Row, 'list').metadata.get('db.default')).toBe('[1,2]')
    expect(prop(Row, 'price').metadata.get('db.default')).toBe('0')
    expect(prop(Row, 'total').metadata.get('db.default')).toBe('12.50')
    expect(createDataFromAnnotatedType(Row, { mode: 'db' })).toEqual({
      count: 0,
      ratio: -2.5,
      on: true,
      status: 'open',
      list: [1, 2],
      price: '0',
      total: '12.50',
    })
  })
})

describe('user-text registry', () => {
  it('knows the core annotations from the start, equal to the core specs', async () => {
    expect(userTextOf('meta.label')).toBe(true)
    expect(userTextOf('expect.pattern')).toEqual(['message'])
    const config = await new PluginManager({}).getDocConfig()
    expect(new Map(CORE_USER_TEXT)).toEqual(userTextAnnotations(config.annotations!))
  })

  it('a module registers the plugin text annotations it writes, and only those', async () => {
    const { js, load: imp } = await load(
      {
        'u.as': 'export interface U {\n  @x.hint "Hi"\n  @meta.label "A"\n  a: string\n}',
        'plain.as': 'export interface P {\n  @meta.label "P"\n  p: string\n}',
      },
      [plugin]
    )
    expect(js['u.as']).toContain('$ut("x.hint")')
    expect(js['plain.as']).not.toMatch(/\$ut/)
    expect(userTextOf('x.hint')).toBeUndefined()
    await imp('u.as')
    expect(userTextOf('x.hint')).toBe(true)
    expect(userTextOf('meta.required')).toEqual(['message'])
    expect(userTextOf('meta.id')).toBeUndefined()
    expect(userTextKeys().get('expect.message')).toBe(true)
    // (not written by any module loaded)
    expect(userTextOf('x.action')).toBeUndefined()
  })

  it('a plugin registers its keys at runtime', () => {
    registerUserText('x.action', ['label'])
    registerUserText('x.action', ['hint'])
    expect(userTextOf('x.action')).toEqual(['label', 'hint'])
    registerUserText('x.note')
    expect(userTextOf('x.note')).toBe(true)
  })
})

describe('.as imports with the extension in generated code', () => {
  it('import the module once, without a doubled extension', async () => {
    const { js, load: imp } = await load({
      'user.as': 'export interface User { name: string }',
      'a.as': "import { User } from './user.as'\nexport interface A { u: User }",
      'b.as': "import { User } from './user'\nexport interface B { u: User }",
    })
    expect(js['a.as']).toContain('from "./user.as"')
    expect(js['a.as']).not.toContain('user.as.as')
    expect(js['b.as']).toContain('from "./user.as"')
    const { A } = await imp('a.as')
    const { B } = await imp('b.as')
    const { User } = await imp('user.as')
    expect(prop(A, 'u').type).toBe(User.type)
    expect(prop(B, 'u').type).toBe(User.type)
  })
})
