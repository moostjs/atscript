import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import type { AtscriptDoc } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { Realm, type TRealmModule } from '../codegen/realm'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { $blk, $end, $f, $q, pendingStatements } from '../runtime/blocks'
import { Validator } from '../runtime/validator'

/*
 * Import cycles: a statement reading a class of another module of its cycle runs
 * at once, or waits in the queue (`$q`) until a module end (`$end`) where it can run.
 */

type N = TAtscriptAnnotatedType

const dir = mkdtempSync(path.join(tmpdir(), 'atscript-queue-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const HELPERS = ['defineAnnotatedType as $', '$f', '$q', '$end', '$blk']
const IMPORT_RT = `import { ${HELPERS.join(', ')} } from "@atscript/typescript/utils"`

const decl = (name: string, id = true) =>
  `class ${name} { static __is_atscript_annotated_type = true; static type = {}; static metadata = new Map()${id ? `; static id = "${name}"` : ''} }`

/**
 * Module X: `interface A { b?: B; x?: string }`, `interface H { m?: B & A }` (hidden class $M0),
 * `annotate B { @meta.label 'from X' x }`.
 */
const X = (other: string) => ({
  imports: [`import { B } from "./${other}.as"`],
  names: [['B', 'B']] as Array<[string, string]>,
  exports: ['A', 'H'],
  classes: ['A', '$M0', 'H'],
  body: `export ${decl('A')}
${decl('$M0', false)}
export ${decl('H')}
$q(() => $("object", A).prop("b", $().ref(B).optional().$type).prop("x", $().designType("string").tags("string").optional().$type))
$q(() => $("object", $M0).over([B, A], true)
  .prop("b", $f(A, "b"))
  .prop("x", $().designType("string").tags("string").optional().over([$f(B, "x"), $f(A, "x")]).$type)
  .prop("a", $f(B, "a")))
$("object", H).prop("m", $().ref($M0).optional().$type)
$q(() => $blk([1, "X"], 0, B, [[[["meta.label", "from X"]], [["x", 0]]]]))
$end()`,
})

/** Module Y: `interface B { a?: A; @expect.maxLength 3 x?: string }`, `annotate A { @meta.label 'via Y' b.x }`. */
const Y = (other: string) => ({
  imports: [`import { A } from "./${other}.as"`],
  names: [['A', 'A']] as Array<[string, string]>,
  exports: ['B'],
  classes: ['B'],
  body: `export ${decl('B')}
$q(() => $("object", B).prop("a", $().ref(A).optional().$type).prop("x", $().designType("string").tags("string").optional().annotate("expect.maxLength", { length: 3 }).$type))
$q(() => $blk([1, "Y"], 0, A, [[[["meta.label", "via Y"]], [["b", 0], ["x", 2]]]]))
$end()`,
})

/** What the loaded cycle must look like, whatever module was entered first. */
function check(A: N, B: N, H: N, pending: number) {
  expect(pending).toBe(0)
  const bx = $f(B, 'x')
  expect(bx.metadata.get('meta.label')).toBe('from X')
  // A's own path override through A.b (a shell def on A's node `b`)
  expect($f(A, 'b').type).not.toBe(B.type)
  expect($f(A, 'b', 'x').metadata.get('meta.label')).toBe('via Y')
  expect($f(A, 'b', 'a')).toBe($f(B, 'a'))
  // the merge: a hidden class, one-contributor fields are the contributor's node
  const M = $f(H, 'm')
  expect($f(M, 'b')).toBe($f(A, 'b'))
  expect($f(M, 'a')).toBe($f(B, 'a'))
  expect($f(M, 'x').metadata.get('meta.label')).toBe('from X')
  expect($f(M, 'b', 'x').metadata.get('meta.label')).toBe('via Y')
  expect(new Validator(H).validate({ m: { x: 'abc' } }, true)).toBe(true)
  expect(new Validator(H).validate({ m: { x: 'abcd' } }, true)).toBe(false)
  expect(new Validator(A).validate({ b: { x: 'abcd' } }, true)).toBe(false)
}

describe('ESM import cycle through the realm loader', () => {
  for (const [first, second] of [
    ['p', 'q'],
    ['q', 'p'],
  ]) {
    it(`statements in the temporal dead zone wait for the cycle (X in ${first}.as, entered first)`, () => {
      const doc = (name: string) =>
        ({ id: `file://${dir}/${name}.as`, config: { rootDir: dir } }) as unknown as AtscriptDoc
      const docs = { [first]: doc(first), [second]: doc(second) }
      const mod = (spec: ReturnType<typeof X>, other: string): TRealmModule => ({
        text: `${IMPORT_RT}\n${spec.imports[0]}\n${spec.body}\n`,
        imports: [
          {
            line: IMPORT_RT,
            names: HELPERS.map(h =>
              h.includes(' as ') ? (h.split(' as ') as [string, string]) : [h, h]
            ),
          },
          { line: spec.imports[0], doc: docs[other], names: spec.names },
        ],
        exports: spec.exports,
        classes: spec.classes,
      })
      const modules = new Map<AtscriptDoc, TRealmModule>([
        [docs[first], mod(X(second), second)],
        [docs[second], mod(Y(first), first)],
      ])
      const realm = new Realm(modules).load()
      const rt = realm.rt as unknown as { pendingStatements(): number }
      check(
        realm.classOf(docs[first], 'A') as N,
        realm.classOf(docs[second], 'B') as N,
        realm.classOf(docs[first], 'H') as N,
        rt.pendingStatements()
      )
    })
  }
})

// Import cycles between `.as` modules are guaranteed under native ESM only (MODEL §11 Q1): no
// CommonJS cycle case here.
describe('the queue', () => {
  const cls = (id?: string) =>
    class {
      static __is_atscript_annotated_type = true
      static type = {}
      static metadata = new Map()
      static id = id
    } as unknown as N

  it('a statement that never becomes ready stays queued; another error throws', () => {
    // (Z has no def: not built)
    expect(() => $q(() => $f(cls('Z'), 'p'))).not.toThrow()
    expect(pendingStatements()).toBe(1)
    $end()
    expect(pendingStatements()).toBe(1)
    expect(() =>
      $q(() => {
        throw new TypeError('boom')
      })
    ).toThrow('boom')
  })

  it('a module in no import cycle throws when one of its own statements never runs', () => {
    const before = pendingStatements()
    // (one of its own runs once another of its own did)
    const Y = cls('Y')
    const own: Array<() => unknown> = []
    $q(() => $f(Y, 'p'), own)
    $q(() => $('object', Y).prop('p', $().designType('string').tags('string').$type), own)
    expect(() => $end(own)).not.toThrow()
    expect(pendingStatements()).toBe(before)
    // (one that never can: thrown, and not left queued)
    const own2: Array<() => unknown> = []
    $q(() => $f(cls('W'), 'p'), own2)
    expect(() => $end(own2)).toThrow('never ran')
    expect(pendingStatements()).toBe(before)
    // (a module of an import cycle leaves it queued: the build checks the cycle, see `realm.ts`)
    $q(() => $f(cls('C'), 'p'))
    expect(() => $end()).not.toThrow()
    expect(pendingStatements()).toBe(before + 1)
  })

  it("a module that throws after queueing statements: another module's end counts only its own (review 34 since1)", () => {
    const before = pendingStatements()
    // (a cycle module's statement queued, then its body throws: its end never runs)
    $q(() => $f(cls('P0'), 'p'))
    // (a valid module in no cycle: its own statements run, the failed module's are not its own)
    const own: Array<() => unknown> = []
    const built: number[] = []
    $q(() => built.push(1), own)
    expect(() => $end(own)).not.toThrow()
    expect(built).toEqual([1])
    expect(pendingStatements()).toBe(before + 1)
  })
})
