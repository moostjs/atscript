import { describe, it, expect } from 'vitest'
import { TsImport } from './ts-import'

describe('TsImport', () => {
  it('renders side-effect import', () => {
    const imp = new TsImport('./side-effect')
    expect(imp.render()).toBe("import './side-effect';")
  })

  it('renders default import', () => {
    const imp = new TsImport('react').setDefaultImport('React')
    expect(imp.render()).toBe("import React from 'react';")
  })

  it('renders namespace import', () => {
    const imp = new TsImport('lodash').setNamespaceImport('_')
    expect(imp.render()).toBe("import * as _ from 'lodash';")
  })

  it('renders named imports', () => {
    const imp = new TsImport('./utils').addNamed('foo').addNamed('bar', 'baz')
    expect(imp.render()).toBe("import { foo, bar as baz } from './utils';")
  })

  it('renders default + named imports', () => {
    const imp = new TsImport('./example')
      .setDefaultImport('Example')
      .addNamed('one')
      .addNamed('two', 'twoAlias')
    expect(imp.render()).toBe("import Example, { one, two as twoAlias } from './example';")
  })

  it('renders default + namespace imports', () => {
    const imp = new TsImport('./combo').setDefaultImport('MyDefault').setNamespaceImport('ComboNS')
    expect(imp.render()).toBe("import MyDefault, * as ComboNS from './combo';")
  })

  it('renders doc block if added', () => {
    const imp = new TsImport('./file')
      .setDefaultImport('DocDefault')
      .addDocLine('This is a doc line.')
      .addDocLine('Another line.')
    expect(imp.render()).toBe(
      `/**
 * This is a doc line.
 * Another line.
 */
import DocDefault from './file';`
    )
  })

  it('renders .d.ts output (same as .ts)', () => {
    const imp = new TsImport('./test').addNamed('TestFn')
    expect(imp.renderTypes()).toBe("import { TestFn } from './test';")
  })

  it('named + namespace combo (not usually valid TS)', () => {
    // Potentially invalid scenario
    const imp = new TsImport('./invalid-combo').setNamespaceImport('NS').addNamed('Foo')
    expect(imp.render()).toBe("import * as NS, { Foo } from './invalid-combo';")
  })
})
