import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { AnnotationSpec, build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { flattenAnnotatedType } from '../runtime/flatten'
import { buildJsonSchema } from '../runtime/json-schema'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'
import { Validator } from '../runtime/validator'

/*
 * Types are referenced, never copied. `type A = B` is B; `extends` and merges hold the parent's
 * fields themselves; chain references (`T.a.b`) refer to the live field. `annotate T { … }`
 * changes T itself, for every referrer, in any load order, in a full build or in builds of one
 * file each. A path through a referrer (`annotate User { address.street }`) is that referrer's
 * override: it wins over the referenced type's own annotations whenever they load, and recurs
 * within its own subtree. The cases of the round-17 review (each failed before), in both the
 * interpreted and the compiled build.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type TModules = Record<string, any>

/**
 * Builds `files` (in one build, or `partial`: one build per file, each file's own module kept),
 * loads the modules in `order` and returns their exports.
 */
async function load(
  files: Record<string, string>,
  opts: {
    compiled: boolean
    order?: string[]
    partial?: boolean
    annotations?: Record<string, unknown>
  }
): Promise<TModules> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-referenced-'))
  dirs.push(dir)
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text)
  }
  const plugins = [tsPlugin({ jsonSchema: 'bundle', compileValidators: opts.compiled })]
  const groups = opts.partial ? Object.keys(files).map(f => [f]) : [Object.keys(files)]
  for (const entries of groups) {
    const repo = await build({
      rootDir: dir,
      entries,
      plugins,
      ...(opts.annotations ? { annotations: opts.annotations as never } : {}),
    })
    const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
    expect(errors.map(m => m.message)).toEqual([])
    for (const out of await repo.generate({ format: 'js' })) {
      const name = path.basename(out.source)
      if (entries.includes(name)) {
        writeFileSync(path.join(dir, `${name}.js`), out.content)
      }
    }
  }
  vi.resetModules()
  const modules: TModules = {}
  for (const name of opts.order ?? Object.keys(files)) {
    Object.assign(modules, await import(path.join(dir, `${name}.js`)))
  }
  return modules
}

const valid = (type: TAtscriptAnnotatedType, value: unknown) =>
  new Validator(type, { unknownProps: 'ignore' }).validate(structuredClone(value), true)

/** The node at a dotted path (`[]` an element, `<i>` an item). */
function at(type: any, dotted: string): any {
  let node = type
  for (const step of dotted.split('.').filter(Boolean)) {
    const items = /^<(\d+)>$/.exec(step)
    node =
      step === '[]'
        ? node.type.of
        : items
          ? node.type.items[Number(items[1])]
          : node.type.props.get(step)
  }
  return node
}

const label = (type: unknown, dotted: string) => at(type, dotted)?.metadata.get('meta.label')

/** The bundled JSON schema is the runtime one, and a serialized copy validates alike. */
function expectConsistent(type: TAtscriptAnnotatedType, values: unknown[]) {
  expect((type as any).toJsonSchema()).toEqual(buildJsonSchema(type))
  const payload = JSON.stringify(serializeAnnotatedType(type))
  const copy = deserializeAnnotatedType(JSON.parse(payload))
  expect(values.map(v => valid(copy, v))).toEqual(values.map(v => valid(type, v)))
  // (a round trip serializes the same)
  expect(JSON.stringify(serializeAnnotatedType(copy))).toBe(payload)
}

const MAX2 = "  @meta.label 'x'\n  @expect.maxLength 2\n"

for (const compiled of [false, true]) {
  describe(`types are referenced, never copied${compiled ? ' (compiled)' : ''}`, () => {
    it('the User / Address example: a path through a referrer is its override, by priority', async () => {
      const files = {
        'a.as': 'export interface Address {\n  street: string\n  city: string\n}\n',
        'u.as': [
          "import { Address } from './a'",
          'export interface User {\n  address: Address\n  work: Address\n}',
          "annotate User {\n  @meta.label 'user address'\n  address.street\n}",
          'export interface Child extends User {\n  age?: number\n}',
        ].join('\n'),
        // (Address's own block, in a module loaded after the override)
        'z.as': [
          "import { Address } from './a'",
          'export type ZA = Address',
          "annotate Address {\n  @meta.label 'street'\n  @expect.maxLength 3\n  street\n}",
        ].join('\n'),
      }
      for (const order of [
        ['a.as', 'u.as', 'z.as'],
        ['z.as', 'a.as', 'u.as'],
      ]) {
        const m = await load(files, { compiled, order })
        expect(label(m.User, 'address.street')).toBe('user address')
        expect(label(m.User, 'work.street')).toBe('street')
        expect(label(m.Address, 'street')).toBe('street')
        expect(label(m.ZA, 'street')).toBe('street')
        // (the override keeps the rest of Address live: its maxLength reaches it)
        expect(
          valid(m.User, {
            address: { street: 'long', city: 'c' },
            work: { street: 'ok', city: 'c' },
          })
        ).toBe(false)
        // A child holds the parent's fields: the same nodes, its override included.
        expect(at(m.Child, 'address')).toBe(at(m.User, 'address'))
        expect(label(m.Child, 'address.street')).toBe('user address')
        expectConsistent(m.User, [
          { address: { street: 'ok', city: 'c' }, work: { street: 'ok', city: 'c' } },
        ])
      }
    })

    it('an edit through a child’s inherited field is the parent’s; a block on the child is its own', async () => {
      const m = await load(
        {
          't.as': [
            'export interface Parent {\n  name: string\n  nick?: string\n}',
            'export interface Child extends Parent {\n  age?: number\n}',
            "annotate Child {\n  @meta.label 'child nick'\n  nick\n}",
          ].join('\n'),
        },
        { compiled }
      )
      at(m.Child, 'name').metadata.set('meta.label', 'edited')
      expect(label(m.Parent, 'name')).toBe('edited')
      expect(label(m.Child, 'nick')).toBe('child nick')
      expect(label(m.Parent, 'nick')).toBeUndefined()
    })

    it('the Node example: a step reaching the annotated type is that type', async () => {
      const m = await load(
        {
          't.as': `export interface Node {\n  name: string\n  next?: Node\n}\nannotate Node {\n${MAX2}  next.name\n}\n`,
        },
        { compiled }
      )
      for (const p of ['name', 'next.name', 'next.next.next.name']) {
        expect(label(m.Node, p)).toBe('x')
      }
      expect(valid(m.Node, { name: 'long' })).toBe(false)
    })

    // Class A: chain references resolved at build time through the original type.
    it('a chain reference is the live field (A)', async () => {
      const m = await load(
        {
          't.as': [
            'export interface Node {\n  name: string\n  addr?: Addr\n}',
            'export interface Addr {\n  city: string\n}',
            'export type UC = Node.addr',
            'export type UCC = Node.addr.city',
            `annotate Node {\n${MAX2}  addr.city\n}`,
            'export interface H {\n  c: Node.addr\n}',
          ].join('\n'),
        },
        { compiled }
      )
      expect(valid(m.UC, { city: 'long' })).toBe(false)
      expect(valid(m.UCC, 'long')).toBe(false)
      expect(valid(m.H, { c: { city: 'long' } })).toBe(false)
      expect(valid(m.Node, { name: 'a', addr: { city: 'long' } })).toBe(false)
      expect(valid(m.Addr, { city: 'long' })).toBe(true)
      expect(m.UCC.metadata.get('meta.label')).toBe('x')
      for (const type of [m.UC, m.UCC, m.H]) {
        expectConsistent(type, [{ city: 'long' }, 'long', { c: { city: 'long' } }])
      }
    })

    it('a chain reference sees a block of another module loaded after it (A)', async () => {
      const files = {
        't.as':
          'export interface Node {\n  name: string\n  next?: Node\n  addr?: Addr\n}\nexport interface Addr {\n  city: string\n  back?: Node\n}\n',
        'u.as':
          "import { Node } from './t'\nexport type UC = Node.addr\nexport interface U {\n  n: Node\n}\n",
        'b.as': `import { Node } from './t'\nannotate Node {\n${MAX2}  next.addr.city\n}\nexport interface BMark {\n  k?: string\n}\n`,
      }
      const m = await load(files, { compiled, order: ['t.as', 'u.as', 'b.as'] })
      expect(label(m.UC, 'city')).toBe('x')
      expect(valid(m.UC, { city: 'long' })).toBe(false)
      expect(valid(m.U, { n: { name: 'ok', addr: { city: 'long' } } })).toBe(false)
      expect(label(m.Addr, 'city')).toBeUndefined()
    })

    // Class B: a type whose props chain-reference its own or each other's props, with a block.
    it('chains to a type’s own props with blocks of it load (B)', async () => {
      const m = await load(
        {
          'o2.as':
            'export interface T {\n  a?: T.n\n  n?: string\n}\nannotate T {\n  @expect.maxLength 2\n  n\n}\n',
          'o4.as': [
            'export interface A {\n  x?: string\n  by?: B.y\n}',
            'export interface B {\n  y?: string\n  ax?: A.x\n}',
            'annotate A {\n  @expect.maxLength 2\n  x\n}',
            'annotate B {\n  @expect.maxLength 2\n  y\n}',
          ].join('\n'),
          'c23c.as': `export interface D {\n  d?: { x?: D.d, s?: string }\n}\nannotate D {\n${MAX2}  d.s\n}\n`,
        },
        { compiled }
      )
      expect(valid(m.T, { a: 'long' })).toBe(false)
      expect(valid(m.A, { by: 'long' })).toBe(false)
      expect(valid(m.B, { ax: 'long' })).toBe(false)
      expect(valid(m.D, { d: { x: { x: { s: 'long' } } } })).toBe(false)
      expect(valid(m.D, { d: { x: { s: 'ok' } } })).toBe(true)
    })

    // Class C: a self-intersection's merged prop holds itself: every depth is the same node.
    it('a self-intersection recurs by sharing, at every depth (C)', async () => {
      const m = await load(
        {
          't.as': [
            'export interface Node {\n  name: string\n  next?: Node & Meta\n  alt?: Node & { tag?: string }\n  kids?: (Node & Meta)[]\n}',
            'export interface Meta {\n  note?: string\n}',
            `annotate Node {\n${MAX2}  next.note\n${MAX2}  alt.tag\n${MAX2}  kids.note\n}`,
          ].join('\n'),
        },
        { compiled }
      )
      const deep = (d: number, leaf: object): object =>
        d === 0 ? leaf : { name: 'ok', next: deep(d - 1, leaf) }
      for (let d = 1; d <= 9; d++) {
        expect([d, valid(m.Node, deep(d, { name: 'ok', note: 'long' }))]).toEqual([d, false])
      }
      expect(at(m.Node, 'next.next')).toBe(at(m.Node, 'next'))
      expect(label(m.Node, 'alt.alt.tag')).toBe('x')
      expect(label(m.Node, 'next.alt.tag')).toBe('x')
      expect(label(m.Node, 'kids.[].note')).toBe('x')
      expect(label(m.Meta, 'note')).toBeUndefined()
      expectConsistent(m.Node, [deep(3, { name: 'ok', note: 'long' }), { name: 'ok' }])
    })

    // Class C2 (round 23 part 5, mf seeds 2/30): a self-intersection whose other member declares
    // the same prop with another type (`b?: T0 & { b?: T3 }`): `T0.b.b` merges `T0.b` and `T3`,
    // so it has `ownT3`. A path to it cannot be cut to the target's own props (`b.ownT3`: none),
    // so it is an override at its exact path (it was "Unknown property").
    it('a path through a self-intersection to a prop only the other member’s type has (C2)', async () => {
      const m = await load(
        {
          't.as': [
            'export interface T3 {\n  ownT3?: string\n}',
            'export interface T0 {\n  ownT0?: string\n  b?: T0 & { b?: T3 }\n}',
            'export interface U0 {\n  u?: U0 & { u?: T3 }\n}',
            `annotate T0 {\n${MAX2}  b.b.ownT3\n}`,
            `annotate U0 {\n${MAX2}  u.u.u.ownT3\n}`,
          ].join('\n'),
        },
        { compiled }
      )
      expect(label(m.T0, 'b.b.ownT3')).toBe('x')
      expect(label(m.U0, 'u.u.u.ownT3')).toBe('x')
      expect(label(m.T3, 'ownT3')).toBeUndefined()
      const t0 = [{ b: { b: { ownT3: 'long' } } }, { b: { b: { ownT3: 'ok' } } }]
      expect(t0.map(v => valid(m.T0, v))).toEqual([false, true])
      const u0 = [{ u: { u: { u: { ownT3: 'long' } } } }, { u: { u: { u: { ownT3: 'ok' } } } }]
      expect(u0.map(v => valid(m.U0, v))).toEqual([false, true])
      expect(valid(m.T3, { ownT3: 'long' })).toBe(true)
      expectConsistent(m.T0, t0)
      expectConsistent(m.U0, u0)
    })

    // Class D: builds of one file each agree with a full build.
    it('a block in another file applies the same in builds of one file each (D)', async () => {
      const files = {
        't.as':
          'export interface Node {\n  name: string\n  next?: Node & Meta\n}\nexport interface Meta {\n  note?: string\n}\n',
        'b.as':
          "import { Node } from './t'\nannotate Node {\n  @expect.maxLength 2\n  next.name\n}\nexport interface BX {\n  n?: Node\n}\n",
      }
      const values = [
        { name: 'long' },
        { name: 'ok', next: { name: 'long' } },
        { name: 'ok', next: { name: 'ok', next: { name: 'long' } } },
        { name: 'ok', next: { name: 'ok', next: { name: 'ok', next: { name: 'long' } } } },
      ]
      for (const partial of [false, true]) {
        const m = await load(files, { compiled, partial, order: ['t.as', 'b.as'] })
        // MODEL §8: no self-collapse through an intersection member (`next?: Node & Meta`): the
        // exact path `next.name` (and every deeper `next…name`, the same node), not the top level
        expect([partial, values.map(v => valid(m.Node, v))]).toEqual([
          partial,
          [true, false, false, false],
        ])
        expectConsistent(m.Node, values)
      }
    })

    // Class E: an `annotate … as` alias holds its target's fields, its entries its own.
    it('an annotate … as alias shares its target, its entries over it (E)', async () => {
      const m = await load(
        {
          't.as': [
            'export interface User {\n  home: Address\n  work: Address\n}',
            'export interface Address {\n  city: string\n  zip?: string\n  next?: Address\n}',
            `annotate User {\n${MAX2}  home.city\n}`,
            'export annotate User as UA2 {\n  @expect.maxLength 3\n  home.zip\n}',
            'export interface UE extends UA2 {\n  e?: string\n}',
            'export type UM = UA2 & { m?: string }',
          ].join('\n'),
        },
        { compiled }
      )
      const values = [
        { home: { city: 'long' }, work: { city: 'ok' } },
        { home: { city: 'ok', zip: 'long' }, work: { city: 'ok' } },
        { home: { city: 'ok', next: { city: 'long' } }, work: { city: 'ok' } },
        { home: { city: 'ok' }, work: { city: 'ok', zip: 'long' } },
      ]
      // (overrides at their paths only: `home.next.city` is `Address.city`)
      expect(values.map(v => valid(m.User, v))).toEqual([false, true, true, true])
      for (const type of [m.UA2, m.UE, m.UM]) {
        expect(values.map(v => valid(type, v))).toEqual([false, false, true, true])
        expect(label(type, 'home.city')).toBe('x')
        expect(label(type, 'home.next.city')).toBeUndefined()
        expectConsistent(type, values)
      }
    })

    // Class F: steps through type aliases, arrays of another type, unions.
    it('paths through aliases, arrays and unions (F)', async () => {
      const m = await load(
        {
          't.as': [
            'export interface User {\n  home: Address\n  work: Address\n}',
            'export interface Address {\n  city: string\n  next?: AddrA\n}',
            'export type AddrA = Address',
            `annotate User {\n${MAX2}  home.next.city\n}`,
            'export interface Box {\n  name: string\n}',
            'export type BoxL = Box[]',
            'export type BoxU = Box | null',
            'export interface H {\n  ks?: BoxL\n  ku?: BoxU\n}',
            `annotate H {\n${MAX2}  ks.name\n${MAX2}  ku.name\n}`,
          ].join('\n'),
        },
        { compiled }
      )
      expect(
        valid(m.User, { home: { city: 'ok', next: { city: 'long' } }, work: { city: 'ok' } })
      ).toBe(false)
      // (at that path only, through the alias)
      expect(valid(m.User, { home: { city: 'long' }, work: { city: 'ok' } })).toBe(true)
      expect(
        valid(m.User, {
          home: { city: 'ok', next: { city: 'ok', next: { city: 'long' } } },
          work: { city: 'ok' },
        })
      ).toBe(true)
      expect(
        valid(m.User, { home: { city: 'ok' }, work: { city: 'ok', next: { city: 'long' } } })
      ).toBe(true)
      expect(label(m.User, 'home.next.city')).toBe('x')
      expect(label(m.Address, 'next.city')).toBeUndefined()
      expect(valid(m.H, { ks: [{ name: 'long' }] })).toBe(false)
      expect(valid(m.H, { ku: { name: 'long' } })).toBe(false)
      expect(valid(m.Box, { name: 'long' })).toBe(true)
      expect(label(m.H, 'ks.[].name')).toBe('x')
      expectConsistent(m.H, [{ ks: [{ name: 'long' }] }, { ku: null }])
    })

    // Class G: a path override made before a later block of the referenced type keeps it.
    it('a path override is structurally live in every load order (G)', async () => {
      const files = {
        't.as': [
          'export interface User {\n  home: Address\n  work: Address\n}',
          'export interface Address {\n  city: string\n  zip?: string\n  next?: Address\n  geo?: Geo\n}',
          'export interface Geo {\n  lat?: string\n  up?: Address\n}',
        ].join('\n'),
        'a.as': `import { User } from './t'\nexport interface AM { k?: string }\nannotate User {\n${MAX2}  home.city\n}\n`,
        'b.as': `import { Address } from './t'\nexport interface BM { k?: string }\nannotate Address {\n${MAX2}  geo.lat\n}\n`,
      }
      for (const order of [
        ['t.as', 'a.as', 'b.as'],
        ['t.as', 'b.as', 'a.as'],
        ['b.as', 'a.as', 't.as'],
      ]) {
        const m = await load(files, { compiled, order })
        expect(label(m.User, 'home.city')).toBe('x')
        expect(label(m.User, 'work.city')).toBeUndefined()
        for (const p of [
          'home.geo.lat',
          'work.geo.lat',
          'home.next.geo.lat',
          'home.geo.up.geo.lat',
        ]) {
          expect([order, p, label(m.User, p)]).toEqual([order, p, 'x'])
        }
        expect(
          valid(m.User, { home: { city: 'ok', geo: { lat: 'long' } }, work: { city: 'ok' } })
        ).toBe(false)
        expectConsistent(m.User, [{ home: { city: 'long' }, work: { city: 'ok' } }])
      }
    })

    // Class H: a bundled JSON schema of a type whose prop chain-references itself.
    it('the bundled schema of a self-referencing chain is the runtime one (H)', async () => {
      const m = await load(
        {
          't.as':
            'export interface T {\n  d?: { x?: T.d, s?: string }\n}\n@emit.jsonSchema\nexport interface U {\n  t?: T\n}\n',
        },
        { compiled }
      )
      for (const type of [m.T, m.U]) {
        expectConsistent(type, [{ d: { x: { s: 'a' } } }, { t: { d: { s: 'a' } } }])
      }
    })

    // A referrer's override is at exactly the path written: reaching the overridden type again
    // below it (directly, or through other types) is that type, not the override.
    it('a path override is at the path written only', async () => {
      const m = await load(
        {
          't.as': [
            "export interface Address {\n  @meta.label 'City'\n  city: string\n  next?: Address\n  geo?: Geo\n}",
            'export interface Geo {\n  near?: Address\n}',
            'export interface User {\n  home: Address\n  work: Address\n}',
            "annotate User {\n  @meta.label 'H'\n  home.next.city\n}",
            'export interface U2 {\n  home: Address\n}',
            "annotate U2 {\n  @meta.label 'G'\n  home.geo.near.city\n}",
          ].join('\n'),
        },
        { compiled }
      )
      expect(
        [
          'home.city',
          'home.next.city',
          'home.next.next.city',
          'home.geo.near.city',
          'work.next.city',
        ].map(p => label(m.User, p))
      ).toEqual(['City', 'H', 'City', 'City', 'City'])
      expect(
        [
          'home.city',
          'home.geo.near.city',
          'home.geo.near.geo.near.city',
          'home.next.city',
          'home.geo.near.next.city',
        ].map(p => label(m.U2, p))
      ).toEqual(['City', 'G', 'City', 'City', 'City'])
      expect(label(m.Address, 'next.city')).toBe('City')
      expectConsistent(m.User, [{ home: { city: 'a', next: { city: 'b' } }, work: { city: 'c' } }])
    })

    // A reference does not get the annotations whose spec says `passedWhenReferred: false` (an
    // FK to a PK is no id itself), also when a block of another module adds them after the
    // reference was built, in either load order.
    it('a block loaded later does not pass `passedWhenReferred: false` annotations', async () => {
      const files = {
        'c.as': 'export interface Customer {\n  id: string\n  name: string\n}\n',
        'o.as':
          "import { Customer } from './c'\nexport interface Order {\n  customerId: Customer.id\n  tag: Customer.name\n  c?: Customer\n}\n",
        'b.as':
          "import { Customer } from './c'\n@x.scope 'top'\nannotate Customer {\n  @meta.id\n  @meta.label 'L'\n  id\n  @x.scope 'n'\n  name\n}\n",
      }
      const annotations = {
        x: {
          scope: new AnnotationSpec({
            passedWhenReferred: false,
            argument: { name: 'v', type: 'string' },
          }),
        },
      }
      for (const order of [
        ['c.as', 'o.as', 'b.as'],
        ['c.as', 'b.as', 'o.as'],
      ]) {
        const m = await load(files, { compiled, order, annotations })
        const meta = (dotted: string, key: string) => at(m.Order, dotted).metadata.get(key)
        expect(at(m.Customer, 'id').metadata.has('meta.id')).toBe(true)
        expect(m.Customer.metadata.get('x.scope')).toBe('top')
        expect([order, meta('customerId', 'meta.id'), meta('customerId', 'meta.label')]).toEqual([
          order,
          undefined,
          'L',
        ])
        expect([order, meta('tag', 'x.scope'), meta('c', 'x.scope')]).toEqual([
          order,
          undefined,
          undefined,
        ])
      }
    })

    // A prop merged from several members, also inside a union distributed over an intersection
    // and below a member written in place (`{ w?: C }`), follows each member's prop: a block of
    // one of them, loaded later, reaches it (unless a higher member sets the annotation).
    it('merged props follow every member, in distributed unions too', async () => {
      const m = await load(
        {
          't.as': [
            'export interface A {\n  p?: string\n  a?: string\n}',
            'export interface B {\n  p?: string\n}',
            'export interface C {\n  p?: string\n  q?: string\n}',
            'export interface W {\n  w?: A\n}',
            'export interface X {\n  w?: B\n}',
            'export type M3 = (W | X) & { w?: C }',
            'export type M4 = W & { w?: C }',
          ].join('\n'),
          'u.as': [
            "import { A, B, C } from './t'",
            "annotate A {\n  @meta.label 'LA'\n  p\n}",
            "annotate B {\n  @meta.label 'LB'\n  p\n}",
            "annotate C {\n  @meta.label 'LC'\n  q\n}",
          ].join('\n'),
        },
        { compiled, order: ['t.as', 'u.as'] }
      )
      expect(['<0>.w.p', '<1>.w.p', '<0>.w.q', '<1>.w.q'].map(p => label(m.M3, p))).toEqual([
        'LA',
        'LB',
        'LC',
        'LC',
      ])
      expect(['w.p', 'w.q'].map(p => label(m.M4, p))).toEqual(['LA', 'LC'])
    })

    // Whether an intersection is merged does not depend on whether diagnostics (reading final
    // definitions) asked first: the path generated code takes is the one it builds.
    it('a path through a merged self-intersection inherited from a parent, after diagnostics', async () => {
      const m = await load(
        {
          'm0.as':
            "import { S0, S1, S2 } from './m1'\nexport interface T0 {\n  ownT0: string\n  a: T1 & {\n  b: string\n  d: T3\n}\n  d: S2\n}\nexport interface T1 extends S2 {\n  ownT1: string\n  bT1: S2 & S2\n}\nexport interface T2 {\n  ownT2: string\n  c: S1 & T0\n  e?: string\n}\nexport interface T3 {\n  ownT3: string\n  c?: ({\n  d?: number\n  a: S2 & T1\n})[]\n}\nannotate T3 {\n  @meta.description 'Z0'\n  c\n}\n",
          'm1.as':
            "import { T0 } from './m0'\nexport interface S0 {\n  ownS0: string\n  a?: {\n  d?: T0\n}\n  e?: S0 & T0\n}\nexport interface S1 extends S0 {\n  ownS1: string\n  aS1: S1 & S2\n}\nexport interface S2 extends S1 {\n  ownS2: string\n  cS2?: boolean\n}\nannotate S2 {\n  @meta.description 'Z1'\n  aS1.ownS0\n}\n",
        },
        { compiled, order: ['m1.as', 'm0.as'] }
      )
      // (`aS1` is S1's `S1 & S2`, merged: its `ownS0` is S2's override there; MODEL §8: no
      // self-collapse through an intersection member, so S2's own `ownS0` is not reached)
      expect(at(m.S2, 'ownS0').metadata.get('meta.description')).toBeUndefined()
      expect(at(m.S2, 'aS1.ownS0').metadata.get('meta.description')).toBe('Z1')
      expect(at(m.S1, 'ownS0').metadata.get('meta.description')).toBeUndefined()
    })

    // A reference of an import cycle binds when first read: its own annotations stay its own
    // over what a block of the referenced type, applied before, sets.
    it('a reference bound late keeps its own annotations over a block applied before', async () => {
      const m = await load(
        {
          'a.as':
            "import { B } from './b'\nexport interface A {\n  @meta.label 'own'\n  b?: B\n  c?: B\n}\n",
          'b.as': "import { A } from './a'\nexport interface B {\n  x?: string\n  a?: A\n}\n",
          'c.as':
            "import { B } from './b'\n@meta.label 'block'\n@meta.description 'D'\nannotate B {}\n",
        },
        { compiled, order: ['a.as', 'b.as', 'c.as'] }
      )
      expect(m.B.metadata.get('meta.label')).toBe('block')
      expect(at(m.A, 'b').metadata.get('meta.label')).toBe('own')
      expect(at(m.A, 'b').metadata.get('meta.description')).toBe('D')
      expect(at(m.A, 'c').metadata.get('meta.label')).toBe('block')
    })

    // A reference to a prop reaching itself through that prop and the prop itself are one
    // recursion to flattening: the runtime type and its deserialized copy flatten alike.
    it('flattening cuts a prop reaching itself at the same depth, deserialized too', async () => {
      const m = await load(
        {
          't.as':
            'export interface T {\n  d?: { x?: T.d, y?: string }\n}\nexport interface U {\n  e: T.d\n}\n',
        },
        { compiled }
      )
      for (const type of [m.T, m.U]) {
        const copy = deserializeAnnotatedType(
          JSON.parse(JSON.stringify(serializeAnnotatedType(type)))
        )
        expect([...flattenAnnotatedType(type).keys()].sort()).toEqual(
          [...flattenAnnotatedType(copy).keys()].sort()
        )
      }
      expect([...flattenAnnotatedType(m.T).keys()].filter(Boolean).sort()).toEqual([
        'd',
        'd.x',
        'd.y',
      ])
    })

    // A merged prop's metadata is its members' merged by priority (the later member wins,
    // `append` keys concatenate), live: a member written in place keeps its part when another
    // member changes later (a block of it, a runtime edit).
    it('a merged prop keeps its in-place member over a later change of another member', async () => {
      const m = await load(
        {
          'a.as': [
            "export interface User {\n  @expect.pattern '^[a-z]+$'\n  @meta.label 'base'\n  @expect.maxLength 10\n  name: string\n}",
            "export type Strict = User & {\n  @expect.pattern '^.{1,3}$'\n  @meta.label 'inline'\n  @expect.maxLength 5\n  name: string\n}",
            "export type Loose = {\n  @meta.label 'first'\n  name: string\n} & User",
          ].join('\n'),
          'b.as':
            "import { User } from './a'\nannotate User {\n  @expect.pattern '^[a-y]+$'\n  @meta.label 'block'\n  @expect.maxLength 2\n  name\n}\n",
        },
        { compiled, order: ['a.as', 'b.as'] }
      )
      expect(label(m.Strict, 'name')).toBe('inline')
      expect(at(m.Strict, 'name').metadata.get('expect.maxLength')).toEqual({ length: 5 })
      expect(
        at(m.Strict, 'name')
          .metadata.get('expect.pattern')
          .map((p: any) => p.pattern)
        // MODEL §2 append keys: the bases' values first (User.name: own, then its block), then the
        // in-place member's (the highest contributor, MODEL §5)
      ).toEqual(['^[a-z]+$', '^[a-y]+$', '^.{1,3}$'])
      expect([valid(m.Strict, { name: 'abcd' }), valid(m.Strict, { name: 'abc' })]).toEqual([
        false,
        true,
      ])
      // (MODEL §5: an in-place member is the highest contributor, written first or not)
      expect(label(m.Loose, 'name')).toBe('first')
      at(m.User, 'name').metadata.set('meta.label', 'edited')
      expect([label(m.Strict, 'name'), label(m.Loose, 'name')]).toEqual(['inline', 'first'])
      expectConsistent(m.Strict, [{ name: 'abcd' }, { name: 'abc' }])
    })

    // A prop several members declare with the same type: each member's path overrides reach it,
    // by priority (the later member wins), also as an array element.
    it('a merged prop of one type merges its members’ path overrides', async () => {
      const m = await load(
        {
          'a.as': [
            'export interface Address {\n  @expect.maxLength 20\n  city: string\n}',
            'export interface A {\n  addr: Address\n  list: Address[]\n}',
            'export interface B {\n  addr: Address\n  list: Address[]\n}',
            'export type M = A & B',
            'export type N = B & A',
            'export interface C extends B, A {\n  z?: string\n}',
          ].join('\n'),
          'u.as': [
            "import { A, B } from './a'",
            `annotate A {\n  @meta.label 'A'\n  @expect.maxLength 5\n  addr.city\n  @meta.label 'AL'\n  @expect.maxLength 3\n  list.city\n}`,
            `annotate B {\n  @meta.label 'B'\n  @expect.maxLength 3\n  addr.city\n}`,
          ].join('\n'),
        },
        { compiled, order: ['a.as', 'u.as'] }
      )
      expect(['M', 'N', 'C'].map(t => label(m[t], 'addr.city'))).toEqual(['B', 'A', 'A'])
      expect(['M', 'N', 'C'].map(t => valid(m[t], { addr: { city: 'abcd' }, list: [] }))).toEqual([
        false,
        true,
        true,
      ])
      expect(['M', 'N', 'C'].map(t => label(m[t], 'list.[].city'))).toEqual(['AL', 'AL', 'AL'])
      expect(
        ['M', 'N', 'C'].map(t => valid(m[t], { addr: { city: 'a' }, list: [{ city: 'abcd' }] }))
      ).toEqual([true, false, false])
      expect(label(m.Address, 'city')).toBeUndefined()
      for (const t of ['M', 'N', 'C']) {
        expectConsistent(m[t], [{ addr: { city: 'abcd' }, list: [{ city: 'abcd' }] }])
      }
    })

    // A bundled schema reaching a merged prop counts the blocks of its members' types: built
    // with a block not loaded (yet), it is not used.
    it('a bundled schema through a merged prop is the runtime one while a block is not loaded', async () => {
      const m = await load(
        {
          'a.as': [
            'export interface Base {\n  @expect.maxLength 10\n  name: string\n}',
            "export interface Meta {\n  @meta.label 'meta'\n  name: string\n}",
            'export type Merged = Base & Meta',
            'export interface H {\n  m: Base & Meta\n}',
          ].join('\n'),
          'b.as': "import { Base } from './a'\nannotate Base {\n  @expect.maxLength 2\n  name\n}\n",
        },
        { compiled, order: ['a.as'] }
      )
      expect(valid(m.Merged, { name: 'abc' })).toBe(true)
      for (const type of [m.Merged, m.H]) {
        expect(type.toJsonSchema()).toEqual(buildJsonSchema(type))
      }
    })

    // A merge is built from its operands as written (references): a union member another module
    // does not export is reached through them, never named by the merging module.
    it('a merge through an alias of a union whose member is not exported', async () => {
      const m = await load(
        {
          'a.as': 'interface H {\n  h: string\n}\n\nexport type HU = H | { k?: string }',
          'b.as': 'import { HU } from "./a"\n\nexport type BU = HU',
          'c.as': 'import { BU } from "./b"\n\nexport type C = BU & { e?: string }',
        },
        { compiled, order: ['c.as'] }
      )
      expect(valid(m.C, { h: 'x', e: 'y' })).toBe(true)
      expect(valid(m.C, { h: 'x', e: 2 })).toBe(false)
      expect(valid(m.C, { h: 1, k: 1 })).toBe(false)
      expect(m.C.toJsonSchema()).toEqual(buildJsonSchema(m.C))
    })

    // A deserialized type holds itself where the live one holds a reference to itself: their
    // JSON schemas are the same.
    it('a self-intersection’s JSON schema is the same deserialized', async () => {
      const m = await load(
        {
          't.as': [
            "export interface Meta {\n  @meta.label 'm'\n  note?: string\n}",
            'export interface N {\n  name: string\n  next?: N & Meta\n  kids?: (N & Meta)[]\n  alt?: N | Meta\n}',
          ].join('\n'),
        },
        { compiled }
      )
      const copy = deserializeAnnotatedType(JSON.parse(JSON.stringify(serializeAnnotatedType(m.N))))
      expect(buildJsonSchema(copy)).toEqual(buildJsonSchema(m.N))
    })

    // A merged prop typed by a reference of an import cycle not loaded yet loads (its type is
    // read once it can be).
    it('a merged prop referencing a type of an import cycle loading', async () => {
      const m = await load(
        {
          'm0.as':
            "import { S0, S1, S2 } from './m1'\nexport interface T0 {\n  ownT0: string\n  e: S0 | T2\n  d: {\n  d: T2 & S1\n}\n  c: S2\n}\nexport interface T1 extends S0 {\n  ownT1: string\n  cT1: S2 & T3\n  aT1: boolean\n  dT1: number\n}\nexport interface T2 {\n  ownT2: string\n  a: S0 | boolean\n  b: S2 | {\n  d: S2 | {\n  d: T1\n  c: {\n  c?: string\n  e?: T3\n  d?: T2\n}\n  b: T3 & S1\n}\n}\n}\nexport interface T3 {\n  ownT3: string\n  e?: {\n  e: {\n  c?: S0\n  b?: T1\n  d?: S2\n}\n  a: S0 & T1\n  c: {\n  b: number\n  a: S2\n  c: S0\n}[]\n}\n  c: {\n  d: T3 | number\n  c?: {\n  c?: T3 | number\n}\n  b?: S0\n}\n  d: S2 & S1\n}\n",
          'm1.as':
            "import { T0 } from './m0'\nexport interface S0 {\n  ownS0: string\n  e: S1 | string\n}\nexport interface S1 extends S0 {\n  ownS1: string\n  aS1: T0\n  bS1: S2 & S1\n}\nexport interface S2 extends S1 {\n  ownS2: string\n  dS2: string\n  bS2?: S0 & {\n  b: T0\n  e: (S2 | string)[]\n}\n  cS2: S1 | S0\n}\n",
        },
        {
          compiled,
          order: ['m1.as', 'm0.as'],
        }
      )
      expect(at(m.S1, 'aS1').type).toBe(m.T0.type)
      expect(valid(m.T0, {})).toBe(false)
    })

    // A path override of a merged prop survives its members changing later (a block of a
    // member's type): it derives from the merged type.
    it('a path override of a merged prop survives a later change of its members', async () => {
      const m = await load(
        {
          'm0.as':
            "import { S0, S1, S2 } from './m1'\nexport interface T0 {\n  ownT0: string\n  b?: T2 & {\n  c: S1\n  b: {\n  a: T3 | string\n  b: S1\n  d: S0\n}\n}\n  c: {\n  a?: S1\n}\n}\nexport interface T1 extends S1 {\n  ownT1: string\n  eT1?: {\n  a?: S0\n  b: S0 & S2\n}\n}\nexport interface T2 extends S0 {\n  ownT2: string\n  bT2: T3 & S2\n  eT2: {\n  e: string\n}\n  cT2: T0 | number\n}\nexport interface T3 {\n  ownT3: string\n  d: string\n  c: {\n  a?: S2\n}\n}\nannotate T0 {\n  @meta.description 'Z0'\n  ownT0\n}\nannotate T1 {\n  @meta.description 'Z1'\n  eT1.b.c.ownS0\n}\n",
          'm1.as':
            "import { T0 } from './m0'\nexport interface S0 {\n  ownS0: string\n  d: S0 & S1\n  c: S1\n  b: {\n  b?: S2\n  a: T0\n}\n  e: T0 & {\n  c?: {\n  a: {\n  d: boolean\n  b: boolean\n}\n  b: string\n}\n}\n}\nexport interface S1 extends S0 {\n  ownS1: string\n\n}\nexport interface S2 extends S1 {\n  ownS2: string\n\n}\nannotate S2 {\n  @meta.description 'Z2'\n  ownS1\n}\n",
        },
        {
          compiled,
          order: ['m0.as', 'm1.as'],
        }
      )
      expect(at(m.T1, 'eT1.b.c.ownS0').metadata.get('meta.description')).toBe('Z1')
      expect(at(m.S1, 'ownS0').metadata.get('meta.description')).toBeUndefined()
    })

    // A path through an intersection with a type extending the target loads, and means the same
    // whether or not the build checked the entries first (it emitted a path into the merge's
    // member then: `Cannot read properties of undefined` at load).
    it('a path through an intersection reaching the target, after diagnostics', async () => {
      const m = await load(
        {
          't.as': [
            'export interface S0 {\n  ownS0: string\n  b: S1 & { c?: string }\n}',
            'export interface S1 extends S0 {\n  ownS1: string\n  eS1?: S2 & S0\n}',
            'export interface S2 extends S1 {\n  ownS2: string\n}',
            `annotate S1 {\n${MAX2}  eS1.ownS1\n}`,
          ].join('\n'),
        },
        { compiled }
      )
      // (`S2 extends S1`: a type of its own, not S1 — owner decision, round 23: no self-collapse
      // through it; the override is at `eS1.ownS1`, which S2 inherits)
      expect(label(m.S1, 'eS1.ownS1')).toBe('x')
      expect(label(m.S2, 'eS1.ownS1')).toBe('x')
      expect(label(m.S1, 'ownS1')).toBeUndefined()
      expect(label(m.S2, 'ownS1')).toBeUndefined()
      expect(label(m.S0, 'ownS0')).toBeUndefined()
    })

    // `X & X` is `X`: its props are `X`'s own nodes, the overrides of `X` included.
    it('an intersection of a type with itself holds its props', async () => {
      const m = await load(
        {
          't.as': [
            "import { S2 } from './s'\nexport interface T0 extends S2 {\n  ownT0: string\n}",
            "annotate T0 {\n  @meta.label 'x'\n  b.b\n}",
          ].join('\n'),
          's.as':
            "import { T0 } from './t'\nexport interface S2 {\n  ownS2: string\n  b?: T0 & T0\n}\n",
        },
        { compiled }
      )
      // (`b.b` reaches T0 again: T0's own `b`, overriding the `b` it inherits from S2)
      expect(label(m.T0, 'b')).toBe('x')
      expect(at(m.T0, 'b.b')).toBe(at(m.T0, 'b'))
      expect(label(m.S2, 'b')).toBeUndefined()
      expect(label(m.S2, 'b.b')).toBe('x')
      expect(label(m.T0, 'b.b.b')).toBe('x')
      const deep = { ownS2: 'a', ownT0: 'a', b: { ownS2: 'a', ownT0: 'a', b: { ownS2: 1 } } }
      expect(valid(m.T0, deep)).toBe(false)
      expectConsistent(m.T0, [deep, { ownS2: 'a', ownT0: 'a' }])
    })

    // A chain reference to a field of its own declaration (`v?: W.w`) is that field at the path:
    // a block's path through it names a prop, whether diagnostics run first or not (P1).
    it('a path through a chain reference into its own declaration', async () => {
      const m = await load(
        {
          'a.as': [
            'export interface W {\n  w: {\n    z?: string\n  }\n  v?: W.w\n}',
            'export interface Q {\n  q: W.w\n}',
            "annotate W {\n  @meta.label 'wz'\n  @expect.maxLength 2\n  v.z\n}",
            'export interface Q2 {\n  q: W\n}',
            "annotate Q2 {\n  @meta.label 'q2'\n  q.v.z\n}",
          ].join('\n'),
        },
        { compiled }
      )
      expect([
        label(m.W, 'v.z'),
        label(m.W, 'w.z'),
        label(m.Q2, 'q.v.z'),
        label(m.Q, 'q.z'),
      ]).toEqual(['wz', undefined, 'q2', undefined])
      expect([valid(m.W, { w: {}, v: { z: 'abc' } }), valid(m.W, { w: { z: 'abc' } })]).toEqual([
        false,
        true,
      ])
      expectConsistent(m.W, [{ w: {}, v: { z: 'abc' } }])
    })

    // An `annotate … as` alias's entry keeps its values first when the node it overrides is
    // replaced (a block on the target's path loaded later): the result does not depend on the
    // load order, and the bundled schema is the runtime one (R3).
    it('an `annotate … as` entry keeps its values first, in any load order', async () => {
      const files = {
        'a.as': [
          "export interface Address {\n  @expect.pattern '^t'\n  city: string\n}",
          'export interface User {\n  home: Address\n}',
          "export annotate User as UA {\n  @expect.pattern '^ta'\n  home.city\n}",
        ].join('\n'),
        'b.as': "import { User } from './a'\nannotate User {\n  @meta.label 'x'\n  home.city\n}\n",
        'c.as':
          "import { UA } from './a'\nannotate UA {\n  @expect.pattern '^tab'\n  home.city\n}\n",
      }
      const seen = new Set<string>()
      for (const order of [
        ['a.as', 'b.as', 'c.as'],
        ['a.as', 'c.as', 'b.as'],
      ]) {
        const m = await load(files, { compiled, order })
        const patterns = at(m.UA, 'home.city')
          .metadata.get('expect.pattern')
          .map((p: any) => p.pattern)
        seen.add(patterns.join(','))
        expect(label(m.UA, 'home.city')).toBe('x')
        expect(m.UA.toJsonSchema()).toEqual(buildJsonSchema(m.UA))
      }
      // MODEL §2 append keys: the base's values first (Address.city), then UA's own (its entry,
      // then the block on UA, by rank); the same in every load order (MODEL §7)
      expect([...seen]).toEqual(['^t,^ta,^tab'])
    })
  })
}

describe('chained references reaching themselves', () => {
  it('are reported as circular (no stack overflow)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-referenced-'))
    dirs.push(dir)
    writeFileSync(path.join(dir, 'w.as'), 'export interface W {\n  w?: W.w2\n  w2?: W.w\n}\n')
    const repo = await build({ rootDir: dir, entries: ['w.as'], plugins: [tsPlugin()] })
    const messages = [...(await repo.diagnostics()).values()].flat().map(m => m.message)
    expect(messages).toEqual([
      'Circular chain reference "W.w2": it resolves to itself',
      'Circular chain reference "W.w": it resolves to itself',
    ])
  })
})
