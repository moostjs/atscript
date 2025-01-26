import { describe, it, expect } from 'vitest'
import { TsObject } from './ts-object'

describe('TsObject', () => {
  it('renders an empty object', () => {
    const obj = new TsObject()
    // .render() => "{}"
    expect(obj.render()).toBe(`{}`)
  })

  it('renders a single property', () => {
    const obj = new TsObject()
    obj.addEntry('foo', '42')
    // .render() =>
    // {
    //   foo: 42,
    // }
    expect(obj.render()).toBe(`{
  foo: 42,
}`)
  })

  it('renders multiple properties', () => {
    const obj = new TsObject()
      .addEntry('foo', '42')
      .addEntry('bar', '"hello"')
      .addEntry('flag', 'true')

    expect(obj.render()).toBe(`{
  foo: 42,
  bar: "hello",
  flag: true,
}`)
  })

  it('renders nested objects', () => {
    const nested = new TsObject().addEntry('x', 1)
    const top = new TsObject().addEntry('foo', '"bar"').addEntry('nested', nested)

    // Should produce:
    // {
    //   foo: "bar",
    //   nested: {
    //     x: 1,
    //   },
    // }
    expect(top.render()).toBe(`{
  foo: "bar",
  nested: {
    x: 1,
  },
}`)
  })

  it('renders doc lines', () => {
    const obj = new TsObject()
      .addEntry('foo', '"bar"')
      .addDocLine('This is a test object')
      .addDocLine('With multiple doc lines')

    // =>
    // /**
    //  * This is a test object
    //  * With multiple doc lines
    //  */
    // {
    //   foo: "bar",
    // }
    const expected = `/**
 * This is a test object
 * With multiple doc lines
 */
{
  foo: "bar",
}`
    expect(obj.render()).toBe(expected)
  })

  it('renders .d.ts output (same as .ts for objects)', () => {
    const obj = new TsObject().addEntry('answer', 42)
    expect(obj.renderTypes()).toBe(`{
  answer: number,
}`)
  })
})
