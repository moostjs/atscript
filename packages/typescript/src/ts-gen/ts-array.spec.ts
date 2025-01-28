import { describe, it, expect } from 'vitest'
import { TsArray } from './ts-array'
import { TsObject } from './ts-object'
import { TsValue } from './ts-value'

describe('TsArray', () => {
  it('renders an empty array', () => {
    const arr = new TsArray()
    expect(arr.render()).toBe('[]')
  })

  it('renders a single item (number)', () => {
    const arr = new TsArray().addItem(42)

    expect(arr.render()).toMatchInlineSnapshot(`
      "[
          42,
      ]"
    `)
  })

  it('renders multiple items (string, boolean)', () => {
    const arr = new TsArray().addItem('"hello"').addItem(true).addItem(false)

    expect(arr.render()).toMatchInlineSnapshot(`
      "[
          "hello",
          true,
          false,
      ]"
    `)
  })

  it('renders nested array and TsObject', () => {
    const nestedObj = new TsObject().addEntry('x', 123)
    const nestedArr = new TsArray().addItem('"inner"')

    const arr = new TsArray().addItem(nestedObj).addItem(nestedArr)

    expect(arr.render()).toMatchInlineSnapshot(`
      "[
        {
          x: 123,
        },
        [
              "inner",
        ],
      ]"
    `)
  })

  it('renders doc lines', () => {
    const arr = new TsArray().addItem(1).addItem(2).addDocLine('This is a test array')

    expect(arr.render()).toMatchInlineSnapshot(`
      "/**
       * This is a test array
       */
      [
          1,
          2,
      ]"
    `)
  })

  it('renders .d.ts output (same as .ts for arrays)', () => {
    const arr = new TsArray()
      .addItem(new TsValue('"hello"', 'string'))
      .addItem(new TsValue('42', 'number'))

    // In your code, .renderTypes() might differ from .render() if
    // TsValue includes type annotations. Here, we assume it matches.
    expect(arr.renderTypes()).toMatchInlineSnapshot(`
      "[
          string,
          number,
      ]"
    `)
  })
})
