import { writeFileSync } from 'fs'
import path from 'path'

import { AnnotationSpec, build } from '@atscript/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { tsPlugin } from './plugin'
import type { TAtscriptAnnotatedType, TAtscriptTypeObject } from './runtime/annotated-type'
import { deserializeAnnotatedType, serializeAnnotatedType } from './runtime/serialize'

const fixturesDir = path.join(path.dirname(import.meta.url.slice(7)), '../test/fixtures')

const annotations = {
  test: {
    vh: new AnnotationSpec({
      argument: [
        { name: 'target', type: 'ref' },
        { name: 'field', type: 'string', optional: true },
        { name: 'filter', type: 'query', optional: true },
      ],
    }),
    vhq: new AnnotationSpec({ argument: { name: 'filter', type: 'query' } }),
    note: new AnnotationSpec({ argument: { name: 'text', type: 'string' } }),
  },
}

const entries = [
  'vh-dict.as',
  'vh-table.as',
  'vh-view.as',
  'vh-clash.as',
  'vh-same-file.as',
  'vh-multi-hop.as',
  'vh-cycle.as',
]

const js: Record<string, string> = {}

const prop = (t: TAtscriptAnnotatedType, name: string) =>
  (t.type as TAtscriptTypeObject<string>).props.get(name)!

// Runtime metadata of a prop; the test annotations are not part of AtscriptMetadata.
const vhMeta = (t: TAtscriptAnnotatedType, name: string, key = 'test.vh'): any =>
  (prop(t, name).metadata as Map<string, unknown>).get(key)

beforeAll(async () => {
  const repo = await build({
    rootDir: fixturesDir,
    entries,
    plugins: [tsPlugin()],
    annotations,
  })
  for (const file of await repo.generate({ outDir: '.', format: 'js' })) {
    js[file.fileName] = file.content
    writeFileSync(file.target ?? path.join(fixturesDir, file.fileName), file.content)
  }
})

describe('annotation ref arguments inherited across files are bound', () => {
  it('chain-ref-inherited annotation imports the target (exact import line)', () => {
    expect(js['vh-view.as.js']).toContain('import { VhDict } from "./vh-dict.as"')
  })

  it('chain-ref-inherited ref argument evaluates without ReferenceError', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const { VhDict } = await import('../test/fixtures/vh-dict.as')
    const vh = vhMeta(VhView, 'color')
    expect(vh.target()).toBe(VhDict)
    expect(vh.field).toBe('code')
  })

  it('extends-inherited ref argument is bound', async () => {
    const { VhExt } = await import('../test/fixtures/vh-view.as')
    const { VhDict } = await import('../test/fixtures/vh-dict.as')
    const vh = vhMeta(VhExt, 'color')
    expect(vh.target()).toBe(VhDict)
  })

  it('qualified query field refs inherited across files are bound', async () => {
    const { VhView, VhExt } = await import('../test/fixtures/vh-view.as')
    const { VhDict } = await import('../test/fixtures/vh-dict.as')
    for (const t of [VhView, VhExt]) {
      const q = vhMeta(t, 'size', 'test.vhq')
      expect(q.left.type()).toBe(VhDict)
      expect(q.left.field).toBe('code')
    }
  })

  it('imports are emitted once per origin even with several inherited annotations', () => {
    expect(js['vh-view.as.js'].match(/import \{ VhDict \}/g)).toHaveLength(1)
  })

  it('a local name clash gets an aliased import', async () => {
    expect(js['vh-clash.as.js']).toContain('import { VhDict as VhDict_1 } from "./vh-dict.as"')
    expect(js['vh-clash.as.js']).toContain('target: () => VhDict_1')
    const { VhClash } = await import('../test/fixtures/vh-clash.as')
    const { VhDict } = await import('../test/fixtures/vh-dict.as')
    const vh = vhMeta(VhClash, 'color')
    expect(vh.target()).toBe(VhDict)
  })

  it('multi-hop (file → view → table) inheritance is bound', async () => {
    expect(js['vh-multi-hop.as.js']).toContain('import { VhDict } from "./vh-dict.as"')
    const { VhHop } = await import('../test/fixtures/vh-multi-hop.as')
    const { VhDict } = await import('../test/fixtures/vh-dict.as')
    const vh = vhMeta(VhHop, 'color')
    expect(vh.target()).toBe(VhDict)
  })

  it('same-file inheritance emits no extra import', async () => {
    const out = js['vh-same-file.as.js']
    expect(out).not.toMatch(/import \{[^}]*VhSameDict/)
    expect(out.match(/^import /gm)).toHaveLength(1)
    const { VhSameView, VhSameDict } = await import('../test/fixtures/vh-same-file.as')
    const vh = vhMeta(VhSameView, 'color')
    expect(vh.target()).toBe(VhSameDict)
  })

  it('declaring file keeps its own import untouched', () => {
    expect(js['vh-table.as.js']).toContain('import { VhDict } from "./vh-dict.as"')
    expect(js['vh-table.as.js'].match(/import \{ VhDict \}/g)).toHaveLength(1)
  })
})

const vhOf = (t: any, name: string) => t.type.props[name].metadata['test.vh']

describe('serializeAnnotatedType: refs inside annotation values', () => {
  it('refDepth 0 (default): { id } only, JSON-safe, no leaked functions', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const json = serializeAnnotatedType(VhView)
    expect(vhOf(json, 'color')).toEqual({
      target: { id: 'VhDict' },
      field: 'code',
      filter: { left: { field: 'code' }, op: '$eq', right: 'x' },
    })
    expect(JSON.parse(JSON.stringify(json))).toEqual(json)
  })

  it('refDepth 0.5: shallow { id, metadata } target', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const json = serializeAnnotatedType(VhView, { refDepth: 0.5 })
    expect(vhOf(json, 'color').target).toEqual({
      id: 'VhDict',
      metadata: { 'test.note': 'dictionary' },
    })
    expect(JSON.parse(JSON.stringify(json))).toEqual(json)
  })

  it('chain refs inside query trees serialize as { type: shallow, field }', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const json = serializeAnnotatedType(VhView, { refDepth: 0.5 })
    const q = json.type.kind === 'object' && json.type.props.size.metadata['test.vhq']
    expect(q).toEqual({
      left: {
        type: { id: 'VhDict', metadata: { 'test.note': 'dictionary' } },
        field: 'code',
      },
      op: '$eq',
      right: 'y',
    })
  })

  it('same-file ref (the annotation value is the annotated type object itself, not a getter function) serializes like a cross-file one', async () => {
    const { VhSameView } = await import('../test/fixtures/vh-same-file.as')
    const json = serializeAnnotatedType(VhSameView, { refDepth: 0.5 })
    expect(vhOf(json, 'color').target).toEqual({ id: 'VhSameDict', metadata: {} })
  })

  it('refs inside a shallow target metadata collapse to { id } (no cycles)', async () => {
    const { VhCycleHost } = await import('../test/fixtures/vh-cycle.as')
    const json = serializeAnnotatedType(VhCycleHost, { refDepth: 0.5 })
    const target = vhOf(json, 'a').target
    expect(target.id).toBe('VhCycleA')
    expect(target.metadata['test.vh'].target).toEqual({ id: 'VhCycleB' })
    expect(() => JSON.stringify(json)).not.toThrow()
  })

  it('applies to refDepth >= 1 too and to the shallow prop-ref targets', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const json = serializeAnnotatedType(VhView, { refDepth: 1 })
    expect(vhOf(json, 'color').target.id).toBe('VhDict')
  })

  it('processAnnotation output also goes through the ref serialization', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const json = serializeAnnotatedType(VhView, {
      processAnnotation: ({ key, value }) => ({ key, value }),
    })
    expect(vhOf(json, 'color').target).toEqual({ id: 'VhDict' })
  })

  it('only invokes generated-getter-shaped functions (never user functions)', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    let called = 0
    function declared() {
      called++
      return undefined
    }
    const json = serializeAnnotatedType(VhView, {
      processAnnotation: ({ key, value }) =>
        key === 'test.vh'
          ? { key, value: { declared, asyncFn: async () => called++ } }
          : { key, value },
    })
    expect(called).toBe(0)
    expect(vhOf(json, 'color').declared).toBe(declared)
  })

  it('deserializes the serialized form as plain records', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const json = JSON.parse(JSON.stringify(serializeAnnotatedType(VhView, { refDepth: 0.5 })))
    const restored = deserializeAnnotatedType(json) as any
    expect(restored.type.props.get('color').metadata.get('test.vh').target.id).toBe('VhDict')
  })

  it('leaves non-reference values untouched (dates, regexps, plain scalars)', async () => {
    const { VhView } = await import('../test/fixtures/vh-view.as')
    const json = serializeAnnotatedType(VhView, {
      processAnnotation: ({ key, value }) =>
        key === 'test.vh' ? { key, value: { re: /a/, d: 1, list: [1, 'x'] } } : { key, value },
    })
    expect(vhOf(json, 'color')).toEqual({ re: /a/, d: 1, list: [1, 'x'] })
  })
})
