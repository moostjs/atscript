import { describe, it, expect } from 'vitest'
import { TsVar } from './ts-var'
import { TsValue } from './ts-value'
import { TsType } from './ts-type'
import { TsObject } from './ts-object'

describe('TsVar', () => {
  it('renders a const variable with no value (defaults to undefined)', () => {
    const myVar = new TsVar('myVar').asConst()
    // => "const myVar = undefined;"
    expect(myVar.render()).toBe('const myVar = undefined;')
  })

  it('renders an exported let variable', () => {
    const myVar = new TsVar('myVar').asLet().exportAs('named')
    // => "export let myVar = undefined;"
    expect(myVar.render()).toBe('export let myVar = undefined;')
  })

  it('renders a var with a string value', () => {
    // If your TsVar setValue() accepts a direct string, do it.
    // If your design uses TsValue, adapt accordingly.
    const myVar = new TsVar('myVar').asVar().setValue(new TsValue('"Hello, World!"', 'string'))

    // .render() => "var myVar = "Hello, World!";"
    expect(myVar.render()).toBe('var myVar = "Hello, World!";')
    // .renderTypes() => "declare var myVar: string;"
    expect(myVar.renderTypes()).toBe('declare var myVar: string;')
  })

  it('renders a const variable with a TsObject value', () => {
    // If your TsVar directly allows TsObject as setValue(...), do that;
    // Otherwise, wrap TsObject in TsValue for separate .ts vs. .d.ts outputs.
    const objVal = new TsObject().addEntry('answer', '42')
    const myVar = new TsVar('myVar').asConst().setValue(
      // Wrap in TsValue to provide a type for .d.ts
      new TsValue(objVal.render(), new TsType('Record<string, unknown>'))
    )

    // .render() =>
    // const myVar = {
    //   answer: 42,
    // };
    expect(myVar.render()).toBe(`const myVar = {
  answer: 42,
};`)

    // .renderTypes() => "declare const myVar: Record<string, unknown>;"
    expect(myVar.renderTypes()).toBe('declare const myVar: Record<string, unknown>;')
  })

  it('supports doc lines', () => {
    const myVar = new TsVar('myVar')
      .asConst()
      .addDocLine('This is a documented variable.')
      .setValue(new TsValue('123', 'number'))

    // =>
    // /**
    //  * This is a documented variable.
    //  */
    // const myVar = 123;
    expect(myVar.render()).toBe(`/**
 * This is a documented variable.
 */
const myVar = 123;`)
  })

  it('renders .d.ts for a variable with no value (defaults to any)', () => {
    const myVar = new TsVar('someVar').asConst()
    // => "declare const someVar: any;"
    expect(myVar.renderTypes()).toBe('declare const someVar: any;')
  })
})
