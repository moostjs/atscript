import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build, type AtscriptDoc } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { JsNextRenderer } from '../codegen'
import { Realm, type TRealmModule } from '../codegen/realm'
import { tsPlugin } from '../plugin'

/*
 * Parity: the type-level annotations core evaluates for a declaration
 * (`evalAnnotationsForNode` over its own and its blocks' top-level annotations) are the metadata
 * of its runtime class (the realm, built from the generated modules): the same keys and values.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const OPTS = { jsonSchema: false as const }

async function both(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-parity-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  const names = Object.keys(files)
  const repo = await build({ rootDir: dir, entries: names, plugins: [tsPlugin(OPTS)] })
  const docs = names.map(f => repo.getDoc(`file://${path.join(dir, f)}`)!)
  const modules = new Map<AtscriptDoc, TRealmModule>()
  for (const d of docs) {
    modules.set(d, new JsNextRenderer(d, OPTS, 'none').renderModule())
  }
  const realm = new Realm(modules).load()
  const out: Record<string, { core: Record<string, unknown>; runtime: Record<string, unknown> }> =
    {}
  for (const doc of docs) {
    for (const node of doc.nodes) {
      // (a declaration: an interface, a type, an `annotate … as` copy — not a block)
      if (!node.id || doc.exports.get(node.id) !== node) {
        continue
      }
      const core: Record<string, unknown> = {}
      // (with its blocks' top-level annotations, `declarationAnnotations`, and those of the
      // declarations it references (`blocks`): generated code writes the declaration's own and
      // the blocks apply theirs at runtime — MODEL §3)
      for (const a of doc.evalAnnotationsForNode(node, doc.declarationAnnotations(node), true) ??
        []) {
        const value = a.args.length === 0 ? true : a.args.map(t => t.text).join(',')
        const key = a.name
        core[key] = core[key] === undefined ? value : [core[key], value].flat()
      }
      const cls = realm.classOf(doc, node.id) as { metadata: Map<string, unknown> } | undefined
      const runtime: Record<string, unknown> = {}
      for (const [k, v] of cls?.metadata ?? []) {
        runtime[k] = v
      }
      out[node.id] = { core, runtime }
    }
  }
  return out
}

/** The keys of each side, and the values both have as strings (other values: their key only). */
function compare(r: Awaited<ReturnType<typeof both>>): string[] {
  const out: string[] = []
  for (const [name, { core, runtime }] of Object.entries(r)) {
    const ck = Object.keys(core).sort().join(',')
    const rk = Object.keys(runtime).sort().join(',')
    if (ck !== rk) {
      out.push(`${name}: keys core [${ck}] runtime [${rk}]`)
      continue
    }
    for (const k of Object.keys(core)) {
      const v = runtime[k]
      if (typeof v === 'string' && core[k] !== v) {
        out.push(`${name}.${k}: core ${String(core[k])} runtime ${v}`)
      }
    }
  }
  return out
}

describe('type-level annotations: core = the runtime class', () => {
  it('declarations, aliases, `as` copies, extends, named merges', async () => {
    const r = await both({
      'a.as': `@meta.label 'A'
@meta.description 'Ad'
export interface A {
  x?: string
}
@meta.label 'B'
export interface B {
  y?: number
}
export type M = A & B
@meta.description 'N'
export type N = A & B
export type P = A
@meta.label 'Q'
export type Q = A
export annotate A as X {
  @meta.label 'Xx'
  x
}
@meta.label 'Y'
export annotate A as Y {}
@meta.label 'C'
export interface C extends A, B {
  z?: string
}
export interface D extends B {}
@expect.minLength 2
export type S = string
export type E = string.email
@meta.label 'U'
export type U = A | B
`,
      'b.as': `import { A, M } from './a'
@meta.description 'MB'
export type MB = M & { w?: string }
export type AA = A & A
annotate A {
  @meta.label 'blk'
  x
}
`,
    })
    expect(Object.keys(r).length).toBeGreaterThan(10)
    expect(compare(r)).toEqual([])
  })

  it('every exported declaration of the codegen fixtures', async () => {
    const root = path.join(__dirname, 'fixtures')
    const diffs: string[] = []
    let n = 0
    for (const sub of readdirSync(root)) {
      const dir = path.join(root, sub)
      if (!statSync(dir).isDirectory()) {
        continue
      }
      const files = Object.fromEntries(
        readdirSync(dir)
          .filter(f => f.endsWith('.as'))
          .map(f => [f, readFileSync(path.join(dir, f), 'utf8')])
      )
      let r: Awaited<ReturnType<typeof both>>
      try {
        r = await both(files)
      } catch {
        // (a fixture with error diagnostics is not generated: MODEL §12 Q8)
        continue
      }
      n += Object.keys(r).length
      diffs.push(...compare(r).map(d => `${sub}/${d}`))
    }
    expect(n).toBeGreaterThan(100)
    expect(diffs).toEqual([])
  })

  it("a block's top-level annotations are its target's (MODEL §3), another module's too", async () => {
    const r = await both({
      'a.as': `export interface A {
  x?: string
}
@meta.description 'own'
annotate A {
  @meta.label 'lx'
  x
}
`,
      'b.as': `import { A } from './a'
@meta.label 'other'
annotate A {
  @meta.label 'ly'
  x
}
export type P = A
`,
    })
    expect(r.A.core).toEqual({ 'meta.description': 'own', 'meta.label': 'other' })
    expect(compare(r)).toEqual([])
  })

  it("a chain ref's field has the blocks' entries at its path (another module's too)", async () => {
    const r = await both({
      'a.as': `export interface T {
  @meta.label 't'
  x?: string
}
export type PA = T.x
annotate T {
  @meta.description 'own'
  x
}
`,
      'b.as': `import { T } from './a'
export type PB = T.x
type Al = T
annotate Al {
  @meta.label 'other'
  x
}
`,
    })
    expect(r.PB.core).toEqual({ 'meta.label': 'other', 'meta.description': 'own' })
    expect(compare(r)).toEqual([])
  })
})
