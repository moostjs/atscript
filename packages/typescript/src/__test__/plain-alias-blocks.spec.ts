import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator } from '../runtime/validator'

/*
 * `type A = B` is just aliasing: A refers to the same thing as B. A block on a plain alias is a
 * block on what it aliases (`annotate UA { … }` with `type UA = User` changes User, like
 * `annotate User { … }`), for the runtime, the bundled JSON schema, compiled checks and the
 * build-time readers (the final definitions). `annotate User as UA { … }` is another thing: a
 * type of its own with its overrides.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function load(files: Record<string, string>, opts: { compiled: boolean; order: string[] }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-plain-alias-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const repo = await build({
    rootDir: dir,
    entries: Object.keys(files),
    plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators: opts.compiled })],
  })
  const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const out of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
  }
  vi.resetModules()
  const m: Record<string, any> = {}
  for (const name of opts.order) {
    Object.assign(m, await import(path.join(dir, `${name}.js`)))
  }
  /**
   * The labels the blocks of the build write at `prop` of the declaration plain alias `name` (of
   * `file`) stands for (the structure model's layers: MODEL §3, §8 a block on an alias is a block
   * on its target).
   */
  const blockLabels = (file: string, name: string, prop: string) => {
    const doc = repo.getDoc(`file://${path.join(dir, file)}`)!
    const model = doc.structure()
    const target = model.plainTarget(model.declOf(doc, name)!)
    return {
      target: target.name,
      labels: model
        .layersAt(target, [prop])
        .flatMap(l => l.entry.ref.annotations ?? [])
        .filter(a => a.name === 'meta.label')
        .map(a => a.args[0]?.text),
    }
  }
  return { m, blockLabels }
}

const valid = (type: any, value: unknown) =>
  new Validator(type, { unknownProps: 'ignore' }).validate(structuredClone(value), true)

function at(type: any, dotted: string): any {
  let node = type
  for (const step of dotted.split('.')) {
    node = node.type.props.get(step)
  }
  return node
}

const label = (type: unknown, dotted: string) => at(type, dotted).metadata.get('meta.label')

const FILES = {
  'u.as': [
    'export interface Address {\n  city: string\n}',
    'export interface User {\n  name: string\n  home: Address\n  next?: User\n}',
  ].join('\n'),
  'a.as': [
    "import { User } from './u'",
    'export type UA = User',
    'export type UB = UA',
    'export interface H {\n  u: User\n  a: UA\n}',
  ].join('\n'),
  // (a block on an alias of an alias, with a type-level annotation, a path through another
  // type and a path reaching the type again)
  'b.as': [
    "import { UB } from './a'",
    "@meta.description 'via alias'",
    "annotate UB {\n  @meta.label 'UB-name'\n  @expect.maxLength 3\n  name\n  @meta.label 'UB-city'\n  home.city\n  @expect.minLength 2\n  next.name\n}",
  ].join('\n'),
  'c.as': "import { User } from './u'\nannotate User {\n  @meta.label 'U-name'\n  name\n}\n",
}

for (const compiled of [false, true]) {
  describe(`a block on a plain alias${compiled ? ' (compiled)' : ''}`, () => {
    it('is a block on what it aliases, in every load order', async () => {
      for (const order of [
        ['u.as', 'a.as', 'b.as', 'c.as'],
        ['u.as', 'a.as', 'c.as', 'b.as'],
      ]) {
        const { m, blockLabels } = await load(FILES, { compiled, order })
        // (`meta.label` on User.name, one node: MODEL §7 static rank, not load order — b.as imports
        // a.as → u.as (depth 2) and outranks c.as (depth 1) in every load order)
        const last = 'UB-name'
        for (const t of ['User', 'UA', 'UB']) {
          expect(label(m[t], 'name')).toBe(last)
          expect(label(m[t], 'home.city')).toBe('UB-city')
          expect(m[t].metadata.get('meta.description')).toBe('via alias')
        }
        expect([label(m.H, 'u.name'), label(m.H, 'a.name')]).toEqual([last, last])
        // (`next.name` reaches User again: User's own `name`, at every depth)
        expect(at(m.User, 'name').metadata.get('expect.minLength')).toEqual({ length: 2 })
        expect(at(m.Address, 'city').metadata.get('meta.label')).toBeUndefined()
        for (const t of ['User', 'UA', 'H']) {
          const value =
            t === 'H'
              ? { u: { name: 'abcd', home: { city: 'x' } }, a: { name: 'ab', home: { city: 'x' } } }
              : { name: 'abcd', home: { city: 'x' } }
          expect(valid(m[t], value)).toBe(false)
          expect(m[t].toJsonSchema()).toEqual(buildJsonSchema(m[t]))
        }
        expect(valid(m.UA, { name: 'ab', home: { city: 'x' } })).toBe(true)
        // The structure model writes it on User (through its aliases).
        expect(blockLabels('b.as', 'UB', 'name')).toEqual({ target: 'User', labels: ['UB-name'] })
        expect(blockLabels('b.as', 'UB', 'home')).toEqual({ target: 'User', labels: [] })
      }
    })

    it('`annotate … as` still makes a type of its own', async () => {
      const { m } = await load(
        {
          'u.as': 'export interface User {\n  name: string\n}',
          'a.as': [
            "import { User } from './u'",
            "export annotate User as UX {\n  @meta.label 'x'\n  name\n}",
            'export type UY = UX',
            "annotate UY {\n  @meta.label 'y'\n  name\n}",
          ].join('\n'),
        },
        { compiled, order: ['u.as', 'a.as'] }
      )
      // (a plain alias of `UX` is UX: the block is UX's, User keeps its own)
      expect([label(m.UX, 'name'), label(m.UY, 'name'), label(m.User, 'name')]).toEqual([
        'y',
        'y',
        undefined,
      ])
    })
  })
}
