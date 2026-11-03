import { describe, expect, it } from 'vitest'

import { AnnotationSpec, userTextAnnotations, userTextFields } from '../annotations'
import { PluginManager } from '../plugin/plugin-manager'

/*
 * `userText` on an annotation argument marks user-facing text; `userTextAnnotations` lists the
 * annotations holding it (core and plugins).
 */

describe('user-text annotations', () => {
  it('flags the core annotations holding user-facing text', async () => {
    const config = await new PluginManager({}).getDocConfig()
    const list = userTextAnnotations(config.annotations!)
    expect(Object.fromEntries(list)).toEqual({
      'meta.label': true,
      'meta.description': true,
      'meta.required': ['message'],
      'expect.minLength': ['message'],
      'expect.maxLength': ['message'],
      'expect.min': ['message'],
      'expect.max': ['message'],
      'expect.exclusiveMin': ['message'],
      'expect.exclusiveMax': ['message'],
      'expect.int': ['message'],
      'expect.minKeys': ['message'],
      'expect.maxKeys': ['message'],
      'expect.message': true,
      'expect.pattern': ['message'],
      'expect.array.uniqueItems': ['message'],
      'expect.array.key': ['message'],
    })
  })

  it("includes a plugin's flagged arguments", async () => {
    const plugin = {
      name: 'ut',
      config() {
        return {
          annotations: {
            x: {
              hint: new AnnotationSpec({
                argument: { name: 'text', type: 'string', userText: true },
              }),
              action: new AnnotationSpec({
                argument: [
                  { name: 'name', type: 'string' },
                  { name: 'label', type: 'string', userText: true },
                ],
              }),
              code: new AnnotationSpec({ argument: { name: 'code', type: 'string' } }),
            },
          },
        }
      },
    }
    const config = await new PluginManager({ plugins: [plugin] }).getDocConfig()
    const list = userTextAnnotations(config.annotations!)
    expect(list.get('x.hint')).toBe(true)
    expect(list.get('x.action')).toEqual(['label'])
    expect(list.has('x.code')).toBe(false)
  })

  it('reads one spec', () => {
    expect(userTextFields(new AnnotationSpec({}))).toBeUndefined()
    expect(
      userTextFields(
        new AnnotationSpec({ argument: { name: 't', type: 'string', userText: true } })
      )
    ).toBe(true)
  })
})
