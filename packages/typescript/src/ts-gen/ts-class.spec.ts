import { describe, it, expect } from 'vitest'
import { TsClass } from './ts-class'
import { TsProperty } from './ts-prop'
import { TsType } from './ts-type'
import { TsMethod } from './ts-method'
import { TsConstructor } from './ts-constructor'

describe('ts-class', () => {
  it('renders a class with properties and methods', () => {
    const c = new TsClass('MyClass')
    c.addProp(new TsProperty('name', new TsType('string').array()))
    c.addProp(new TsProperty('age', 'number'))
    c.addMethod(new TsMethod('doSomething', ['a', 'b'], 'void'))
    c.addMethod(new TsMethod('doSomethingElse', ['x', 'y'], 'void'))

    const output = c.render()
    expect(output).toMatchFileSnapshot('__snapshots__/ts-class.basic.ts')

    const dts = c.renderTypes()
    expect(dts).toMatchFileSnapshot('__snapshots__/ts-class.basic.d.ts')
  })

  it('supports decorators on the class', () => {
    const c = new TsClass('DecoratedClass')
    c.addDecorator('@SomeDecorator()')
    c.addDecorator('@AnotherDecorator')
    c.addProp(new TsProperty('prop', 'boolean'))

    const output = c.render()
    expect(output).toMatchFileSnapshot('__snapshots__/ts-class.decorators.ts')
    const dts = c.renderTypes()
    expect(dts).toMatchFileSnapshot('__snapshots__/ts-class.decorators.d.ts')
  })

  it('extends a base class and implements interfaces', () => {
    const c = new TsClass('ChildClass')
    c.extends('BaseClass')
    c.implement('InterfaceA', 'InterfaceB')

    const output = c.render()
    expect(output).toMatchInlineSnapshot(`
      "class ChildClass extends BaseClass implements InterfaceA, InterfaceB {
        
      }"
    `)
    const dts = c.renderTypes()
    expect(dts).toMatchInlineSnapshot(`
      "declare class ChildClass extends BaseClass implements InterfaceA, InterfaceB {
        
      }"
    `)
  })

  it('has a constructor with body', () => {
    const ctor = new TsConstructor('private x: number', 'private y: string')
    ctor.addBodyLine('this.x = x;')
    ctor.addBodyLine('this.y = y.toUpperCase();')

    const c = new TsClass('WithConstructor')
    c.addConstructor(ctor)

    // Optionally add some props or methods to see more lines
    c.addProp(new TsProperty('z', 'string'))

    const output = c.render()
    expect(output).toContain('constructor(private x: number, private y: string) {')
    expect(output).toContain('this.x = x;')
    expect(output).toContain('this.y = y.toUpperCase();')
    expect(output).toContain('z!: string;')

    const dts = c.renderTypes()
    expect(dts).toMatchInlineSnapshot(`
      "declare class WithConstructor {
        constructor(private x: number, private y: string);
        
        z: string;
      }"
    `)
  })

  it('supports doc lines on the class', () => {
    const c = new TsClass('DocumentedClass')
    c.addDocLine('This class is well documented.')
    c.addDocLine('Second line of doc.')
    c.addProp(new TsProperty('flag', 'boolean'))

    const output = c.render()
    expect(output).toMatchFileSnapshot('__snapshots__/ts-class.docs.ts')

    const dts = c.renderTypes()
    expect(dts).toMatchInlineSnapshot(`
      "/**
       * This class is well documented.
       * Second line of doc.
       */
      declare class DocumentedClass {
        flag: boolean;
      }"
    `)
  })
})
