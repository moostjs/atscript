import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import type { AtscriptDoc } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { dtsFlat } from './dts-flat'
import { valuesFor } from './json-schema-oracle'

/*
 * A merge is one type whatever its size: every intersection merged into objects is a merge state
 * (one hidden class per module and members), so no decision depends on a merge's size (the merge
 * budget of earlier builds is gone). Every type of the fixtures (the merge-order and
 * merge-plan-runtime specs', the round-22 review's) has the same metadata at every path, the same
 * verdicts (interpreted and compiled), both JSON schemas (`buildJsonSchema` and the bundled one),
 * the same serialized payload and round trip, and flattens the same whichever order its modules
 * are loaded in.
 */

const FIXTURES = path.join(__dirname, 'fixtures', 'merge-size')
const CASES = readdirSync(FIXTURES).sort()

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

type TModules = Record<string, TAtscriptAnnotatedType>

/** Builds the fixture `name`, loads its modules (a fresh runtime; `reverse`: the last first). */
async function load(name: string, reverse: boolean, compiled: boolean) {
  const src = path.join(FIXTURES, name)
  const files = readdirSync(src)
    .filter(f => f.endsWith('.as'))
    .sort()
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-size-'))
  dirs.push(dir)
  for (const f of files) {
    copyFileSync(path.join(src, f), path.join(dir, f))
  }
  {
    const opts = { jsonSchema: 'bundle' as const, compileValidators: compiled }
    const repo = await build({
      rootDir: dir,
      entries: files,
      plugins: [tsPlugin(opts)],
    })
    const messages = [...(await repo.diagnostics()).values()]
      .flat()
      .map(m => `${m.severity} ${m.message}`)
      .sort()
    // (the build-time flatten — the db layer's columns: the `.d.ts` `__flat` —, per interface)
    const core: Record<string, string[]> = {}
    for (const f of files) {
      const doc = repo.getDoc(`file://${path.join(dir, f)}`) as AtscriptDoc | undefined
      for (const node of doc?.nodes ?? []) {
        if (node.entity === 'interface' && node.id) {
          try {
            core[node.id] = [...(dtsFlat(doc!, node.id, opts)?.keys() ?? ['NOT RENDERED'])]
          } catch (error) {
            core[node.id] = [`THROW ${(error as Error).message}`]
          }
        }
      }
    }
    const js: string[] = []
    for (const out of await repo.generate({ format: 'js' })) {
      js.push(out.content)
      writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
    }
    vi.resetModules()
    const modules: TModules = {}
    for (const f of reverse ? files.toReversed() : files) {
      Object.assign(modules, await import(path.join(dir, `${f}.js`)))
    }
    // (the readers of the runtime the modules loaded)
    const readers = {
      ...(await import('../runtime/json-schema')),
      ...(await import('../runtime/serialize')),
      ...(await import('../runtime/flatten')),
      ...(await import('../runtime/default-value')),
    }
    return { modules, messages, js: js.join('\n'), readers, core }
  }
}

type TLoaded = Awaited<ReturnType<typeof load>>

const sortKeys = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(sortKeys)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map(k => [k, sortKeys((x as Record<string, unknown>)[k])])
        )
      : x

const show = (value: unknown) =>
  JSON.stringify(value, (_k, v) =>
    v instanceof RegExp ? String(v) : typeof v === 'bigint' ? String(v) : v
  )

/** The metadata (and kind, optional) at every path of `type` (a recursion: once, then cut). */
function dump(type: TAtscriptAnnotatedType): Record<string, string> {
  const out: Record<string, string> = {}
  const visit = (node: any, at: string, above: unknown[]) => {
    const def = node.type
    out[at || '.'] =
      `${def.kind}${def.designType ?? ''}${def.value === undefined ? '' : `=${def.value}`}` +
      `${node.optional ? '?' : ''} ${show([...node.metadata].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))}`
    if (above.includes(def) || above.length > 6) {
      return
    }
    const next = [...above, def]
    if (def.kind === 'object') {
      for (const [k, p] of def.props) {
        visit(p, `${at}.${k}`, next)
      }
    } else if (def.kind === 'array') {
      visit(def.of, `${at}[]`, next)
    } else if (def.items) {
      def.items.forEach((item: unknown, i: number) => visit(item, `${at}<${i}>`, next))
    }
  }
  visit(type, '', [])
  return out
}

/** What every reader makes of the types of `loaded`, on `values` (by type name). */
function views(loaded: TLoaded, values: Record<string, unknown[]>) {
  const { readers } = loaded
  const out: Record<string, unknown> = {}
  for (const [name, type] of Object.entries(loaded.modules)) {
    if (!type?.__is_atscript_annotated_type) {
      continue
    }
    const attempt = (read: () => unknown) => {
      try {
        return read()
      } catch (error) {
        return `THROW ${(error as Error).message}`
      }
    }
    const payload = attempt(() => JSON.stringify(readers.serializeAnnotatedType(type)))
    out[name] = {
      meta: dump(type),
      verdicts: (values[name] ?? []).map(v =>
        attempt(() => type.validator({ unknownProps: 'ignore' }).validate(structuredClone(v), true))
      ),
      schema: attempt(() => show(sortKeys(readers.buildJsonSchema(type)))),
      bundled: attempt(() => show(sortKeys((type as any).toJsonSchema()))),
      payload,
      roundTrip: attempt(() =>
        JSON.stringify(
          readers.serializeAnnotatedType(
            readers.deserializeAnnotatedType(JSON.parse(payload as string))
          )
        )
      ),
      example: attempt(() => readers.createDataFromAnnotatedType(type, { mode: 'example' })),
      defaults: attempt(() => readers.createDataFromAnnotatedType(type)),
      core: loaded.core[name],
      flat: attempt(() => {
        let fields = 0
        const flat = readers.flattenAnnotatedType(type as never, {
          onField: () => {
            if (++fields > 20_000) {
              throw new Error('more than 20000 fields')
            }
          },
        })
        return [...flat.entries()].map(
          ([k, d]: [string, any]) =>
            `${k} ${d.type.kind} ${show([...d.metadata].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))}`
        )
      }),
    }
  }
  return out
}

/** What differs between views `forced` and `small` (by type, view and path). */
function differences(
  forced: Record<string, unknown>,
  small: Record<string, unknown>,
  compiled: boolean
): string[] {
  const out: string[] = []
  const at = compiled ? '(compiled) ' : ''
  for (const name of new Set([...Object.keys(small), ...Object.keys(forced)])) {
    const f = (forced[name] ?? {}) as Record<string, unknown>
    const s = (small[name] ?? {}) as Record<string, unknown>
    for (const view of new Set([...Object.keys(s), ...Object.keys(f)])) {
      if (show(f[view]) === show(s[view])) {
        continue
      }
      if (view === 'meta') {
        const fm = f.meta as Record<string, string>
        const sm = s.meta as Record<string, string>
        for (const p of new Set([...Object.keys(sm), ...Object.keys(fm)])) {
          if (fm[p] !== sm[p]) {
            out.push(`${at}${name} meta ${p}: small ${sm[p]} forced ${fm[p]}`)
          }
        }
        continue
      }
      out.push(
        `${at}${name} ${view}: small ${show(s[view]).slice(0, 600)}\n   forced ${show(f[view]).slice(0, 600)}`
      )
    }
  }
  return out
}

/**
 * Whether the modules of fixture `name` import one another in a cycle (vitest evaluates a cycle
 * loaded from another module unlike native ESM: `merge-order.spec.ts` runs those orders natively).
 */
function cyclic(name: string): boolean {
  const src = path.join(FIXTURES, name)
  const imports = new Map<string, string[]>()
  for (const f of readdirSync(src).filter(f => f.endsWith('.as'))) {
    const text = readFileSync(path.join(src, f), 'utf8')
    imports.set(
      f,
      [...text.matchAll(/from '\.\/([\w-]+)'/g)].map(m => `${m[1]}.as`)
    )
  }
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean =>
    (imports.get(from) ?? []).some(
      f => f === to || (!seen.has(f) && (seen.add(f), reaches(f, to, seen)))
    )
  return [...imports.keys()].some(f => reaches(f, f))
}

describe('the same merges in every load order', () => {
  for (const name of CASES) {
    it(name, { timeout: 60_000 }, async () => {
      // MODEL §6 / §9 U5: a union operand of a merge on the recursion cycle (`A.next?: (A | C) & B`,
      // `M = A & B`) is a compile error: the module is not generated
      if (name === 'r22-ru1') {
        await expect(load(name, false, false)).rejects.toThrow(
          'union members are not supported in recursive merges; split with named types'
        )
        return
      }
      // MODEL §12 Q8: a module with error diagnostics (`A1 = A2`, `A2 = A1`, `S = S`: circular
      // aliases) is not generated — the build fails (it was generated and loaded)
      if (name === 'merge-order-e767c3d0a8') {
        await expect(load(name, false, false)).rejects.toThrow('Circular type alias')
        return
      }
      for (const compiled of [false, true]) {
        const small = await load(name, false, compiled)
        const values: Record<string, unknown[]> = {}
        for (const [t, type] of Object.entries(small.modules)) {
          if (type?.__is_atscript_annotated_type) {
            values[t] = valuesFor(type, [{}, null, 'x', []], 24, t.length * 31 + name.length)
          }
        }
        const smallViews = views(small, values)
        if (cyclic(name)) {
          continue
        }
        const forced = await load(name, true, compiled)
        expect(forced.messages).toEqual(small.messages)
        expect(differences(views(forced, values), smallViews, compiled)).toEqual([])
      }
    })
  }
})
