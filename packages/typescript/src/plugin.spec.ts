import path from 'path'

import { AnnotationSpec, build } from '@atscript/core'
import { describe, expect, it } from 'vitest'

import { tsPlugin } from './plugin'

const wd = path.join(path.dirname(import.meta.url.slice(7)), '..')

const annotations = {
  label: new AnnotationSpec({
    argument: {
      name: 'value',
      type: 'string',
    },
  }),
  labelOptional: new AnnotationSpec({
    argument: {
      optional: true,
      name: 'value',
      type: 'string',
    },
  }),
  mul: new AnnotationSpec({
    multiple: true,
    argument: {
      name: 'value',
      type: 'number',
    },
  }),
  mulOptional: new AnnotationSpec({
    multiple: true,
    argument: {
      optional: true,
      name: 'value',
      type: 'number',
    },
  }),
  mulAppend: new AnnotationSpec({
    multiple: true,
    mergeStrategy: 'append',
    argument: {
      name: 'value',
      type: 'string',
    },
  }),
  obj: new AnnotationSpec({
    argument: [
      {
        name: 'prop1',
        type: 'string',
      },
      {
        optional: true,
        name: 'prop2',
        type: 'number',
      },
      {
        optional: true,
        name: 'prop3',
        type: 'boolean',
      },
    ],
  }),
}

describe('ts-plugin', () => {
  it('must render interface', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/interface.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('interface.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('interface.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface.as.d.ts')
    )
  })
  it('must render type', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/type.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('type.as.js')
    await expect(out[0].content).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/type.js'))
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('type.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/type.as.d.ts')
    )
  })
  it('must render multiple interfaces', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/multiple-interface.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('multiple-interface.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/multiple-interface.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('multiple-interface.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/multiple-interface.as.d.ts')
    )
  })
  it('must render imports', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/imports.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('imports.as.js')
    await expect(out[0].content).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/imports.js'))
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('imports.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/imports.as.d.ts')
    )
  })

  it('must render basic interface metadata', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/interface-metadata.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('interface-metadata.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface-metadata.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('interface-metadata.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface-metadata.as.d.ts')
    )
    await expect(outDts[1].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface-metadata.annotations.d.ts')
    )
  })
  it('must render metadata inherited from other interface', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/inherit-metadata.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('inherit-metadata.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-metadata.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('inherit-metadata.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-metadata.as.d.ts')
    )
    await expect(outDts[1].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-metadata.annotations.d.ts')
    )
  })
  it('must render metadata inherited from type', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/inherit-from-type.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('inherit-from-type.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-from-type.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('inherit-from-type.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-from-type.as.d.ts')
    )
    await expect(outDts[1].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-from-type.annotations.d.ts')
    )
  })
  it('must render metadata inherited from multiple ancestors', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/inherit-chain.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('inherit-chain.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-chain.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('inherit-chain.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-chain.as.d.ts')
    )
    await expect(outDts[1].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-chain.annotations.d.ts')
    )
  })
  it('must not pass annotations flagged passedWhenReferred:false across ref boundaries', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/ref-scope.as'],
      plugins: [tsPlugin()],
      annotations: {
        ...annotations,
        structural: new AnnotationSpec({
          multiple: true,
          mergeStrategy: 'append',
          passedWhenReferred: false,
          argument: {
            name: 'value',
            type: 'string',
          },
        }),
      },
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    const code = out[0].content
    // Slice per-interface metadata blocks: from `$("object", Name)` to the next block
    const block = (name: string) => {
      const start = code.indexOf(`$("object", ${name})`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = code.indexOf('$("object",', start + 1)
      return end === -1 ? code.slice(start) : code.slice(start, end)
    }
    // Source keeps its own declarations
    expect(block('Source')).toContain('.annotate("structural", "by_code", true)')
    expect(block('Source')).toContain('.annotate("label", "Code")')
    // (P4B default format: the generated JS mirrors the .as structure: a reference is printed as a reference, MODEL §1, its
    // metadata a layer over the target's read at runtime, MODEL §2 / §9 U3 — it was a copy,
    // `.inherit(…)`; the values are checked on the loaded module below)
    // One-hop ref: presentation rides, structural does not
    // (s5: a chain ref into this module is a placeholder its own statement makes a thin node over
    // the field — `$al(node, T, chain)` —, so declaration order is not semantics, MODEL intro / §1)
    expect(code).toContain('$al($f(OneHop, "code"), Source, ["code"])')
    expect(block('OneHop')).not.toContain('"structural"')
    // Two-hop ref (through Dict): presentation still rides, inherited structural
    // still dropped, local structural declaration untouched
    expect(code).toContain('$al($f(TwoHop, "code"), Dict, ["code"])')
    expect(block('TwoHop')).toContain('.annotate("structural", "local_idx", true)')
    expect(block('TwoHop')).not.toContain('"by_code"')
    // extends is not a ref boundary: the child holds the parent's prop itself, structural
    // annotation included (MODEL §5: a field only one parent has is that parent's node)
    expect(block('Extended')).toContain('.prop("code", $f(Source, "code"))')
    const { mkdtempSync, rmSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-ref-scope-'))
    try {
      writeFileSync(path.join(dir, 'm.as.js'), code)
      const m = await import(path.join(dir, 'm.as.js'))
      const at = (t: any) => t.type.props.get('code').metadata
      expect([at(m.OneHop).get('label'), at(m.OneHop).get('structural')]).toEqual([
        'Code',
        undefined,
      ])
      expect([at(m.TwoHop).get('label'), at(m.TwoHop).get('structural')]).toEqual([
        'Code',
        ['local_idx'],
      ])
      expect([at(m.Extended).get('label'), at(m.Extended).get('structural')]).toEqual([
        'Code',
        ['by_code'],
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it("keeps a primitive's intrinsic passedWhenReferred:false annotations across type refs, not prop refs", async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/primitive-ref-scope.as'],
      plugins: [tsPlugin()],
      annotations: {
        ...annotations,
        // (not `structural`: the ref-scope test above registers that key as an append key, and a
        // runtime's key flags are process-wide)
        stamped: new AnnotationSpec({
          passedWhenReferred: false,
          argument: { name: 'value', type: 'string' },
        }),
      },
      primitives: {
        stamp: {
          type: 'number',
          extensions: { auto: { annotations: { stamped: 'intrinsic', mulAppend: 'm' } } },
        },
      },
    })
    const out = await repo.generate({ format: 'js' })
    const code = out[0].content
    // (MODEL §12 Q11: the primitive's intrinsic annotations are part of the type. P4B default format:
    // a reference is a layer over its target, MODEL §1/§2, not a copy — the alias class carries
    // them, marked `.intrinsic(…)`, so they pass the reference layers over it although the key is
    // `passedWhenReferred: false`; it was a copy, `.annotate(…)` on every referencing prop. The
    // values are read from the loaded module.)
    expect(code).toMatch(/\$\("", Stamp\)[^\n]*\n?[^]*?\.intrinsic\("stamped"/)
    const { mkdtempSync, rmSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-primitive-ref-scope-'))
    try {
      writeFileSync(path.join(dir, 'm.as.js'), code)
      const m = await import(path.join(dir, 'm.as.js'))
      const at = (name: string) => m.Uses.type.props.get(name).metadata
      const stamped = (name: string) => at(name).get('stamped')
      // the primitive used directly, optional, through an alias (twice), as a union member
      expect(stamped('direct')).toBe('intrinsic')
      expect(stamped('optional')).toBe('intrinsic')
      expect(stamped('aliased')).toBe('intrinsic')
      expect(stamped('aliasedTwice')).toBe('intrinsic')
      expect(m.Stamp.metadata.get('stamped')).toBe('intrinsic')
      expect(m.Uses.type.props.get('member').type.items[0].metadata.get('stamped')).toBe(
        'intrinsic'
      )
      // an alias redeclaring it: the alias's own value stays on the alias, the intrinsic one
      // reaches its users
      expect(m.StampRelabeled.metadata.get('stamped')).toBe('alias')
      expect(stamped('relabeled')).toBe('intrinsic')
      expect(stamped('relabeled2')).toBe('intrinsic')
      // read once, however long the ref chain
      for (const name of ['aliasedTwice', 'viaProp']) {
        expect([name, at(name).get('mulAppend')]).toEqual([name, ['m']])
      }
      // a reference to a prop drops it, like the prop's own passedWhenReferred:false ones
      expect(stamped('viaProp')).toBeUndefined()
      expect(at('viaProp').get('label')).toBe('At')
      expect(stamped('viaPropAlias')).toBeUndefined()
      expect(m.SourceAt.metadata.get('stamped')).toBeUndefined()
      // the prop's own declaration wins
      expect(stamped('overridden')).toBe('own')
      // core's built-in passedWhenReferred:false primitive annotations
      expect(at('name').get('meta.required')).toBeDefined()
      expect(at('agreed').get('meta.required')).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('emits append-merged annotations across a ref: the referenced type first, then the prop', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/append-order.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    const code = out[0].content
    // (P4B default format: the generated JS mirrors the .as structure: the prop is a reference to Shared, MODEL §1, with its own
    // entries; append keys read the bases' values first, then the own ones, MODEL §2 — it was a
    // copy, `.inherit(…)` then `.annotate(…)`: the values are read from the loaded module)
    const { mkdtempSync, rmSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-append-order-'))
    let values: unknown
    try {
      writeFileSync(path.join(dir, 'm.as.js'), code)
      const { Holder } = await import(path.join(dir, 'm.as.js'))
      values = Holder.type.props.get('field').metadata.get('mulAppend')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    // A consumer keying entries into a Map (last wins) lets the prop's own entry override the type's.
    expect(values).toEqual(['type-1', 'type-2', 'own-1', 'own-2'])
  })
  it('must render real-world example (entity with address)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/real-world-1.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('real-world-1.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/real-world-1.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('real-world-1.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/real-world-1.as.d.ts')
    )
  })
  it('must propagate type-level metadata through array element references', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/nested-type-metadata.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('nested-type-metadata.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/nested-type-metadata.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('nested-type-metadata.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/nested-type-metadata.as.d.ts')
    )
  })
  it('must propagate type-level metadata regardless of declaration order', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/nested-type-metadata-reverse.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('nested-type-metadata-reverse.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/nested-type-metadata-reverse.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('nested-type-metadata-reverse.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/nested-type-metadata-reverse.as.d.ts')
    )
  })
  it('must render interfaces/types with intersections', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/intersections.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('intersections.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/intersections.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('intersections.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/intersections.as.d.ts')
    )
  })
  it('must render intersections of unions, tuples and of themselves', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/intersection-precedence.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].fileName).toBe('intersection-precedence.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/intersection-precedence.as.d.ts')
    )
  })
  it('must render interfaces with prop patterns', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/prop-patterns.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('prop-patterns.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/prop-patterns.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('prop-patterns.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/prop-patterns.as.d.ts')
    )
  })

  it('must render non-mutating annotate', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-nonmutating.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('annotate-nonmutating.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-nonmutating.js')
    )
    // Top-level annotation on original interface
    expect(out[0].content).toContain('.annotate("meta.description", "Original")')
    // Top-level annotation on non-mutating annotate replaces the original in alias (P4B default format: the generated JS mirrors the .as structure:
    // the `as` copy's own entry over the target, MODEL §8)
    expect(out[0].content).toContain(
      '$a(AnnotatedInterface.metadata, "meta.description", "Annotated")'
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('annotate-nonmutating.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-nonmutating.as.d.ts')
    )
  })

  it('must render mutating annotate with deep chains and multiple annotations', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-mutating.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('annotate-mutating.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-mutating.js')
    )
    // (P4B default format: the generated JS mirrors the .as structure: a block is printed as data, `$blk(…)`, its entries with their
    // paths, MODEL §3)
    // Deep chain mutation writes the node at the path
    expect(out[0].content).toContain('[[["label", "Mutated City"]], [["address", 0], ["city", 0]]]')
    // Multiple+replace annotation: the entry's values replace the list (`[key, value, 1]`)
    expect(out[0].content).toContain('[[["label", "Mutated Name"], ["mul", 42, 1]], [["name", 0]]]')
    // Top-level annotation on mutating annotate: an entry at the target's root
    expect(out[0].content).toContain(
      '$blk($R, 0, MyInterface, [\n  [[["meta.description", "Mutated Interface"]], []],'
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('annotate-mutating.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-mutating.as.d.ts')
    )
  })

  it('must render cross-file non-mutating annotate', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-import.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    await repo.diagnostics()
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('annotate-import.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-import.js')
    )
    // Import is present — bundler handles tree-shaking via moduleSideEffects: false
    // An alias of the target (its nodes shared), its entries its own overrides
    expect(out[0].content).toContain('ImportedAnnotated')
    expect(out[0].content).toContain('"Imported Name"')
    expect(out[0].content).toContain('"Imported City"')
    // Cross-file non-mutating annotate carries over target's type-level annotation (P4B default format: the generated JS mirrors the .as structure:
    // the `as` copy's metadata is a layer over the target's, MODEL §8; it was a copy, `.inherit(…)`)
    expect(out[0].content).toContain('$al(ImportedAnnotated, MyInterface)')
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('annotate-import.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-import.as.d.ts')
    )
  })

  it('must render cross-file mutating annotate', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-import-mutating.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    await repo.diagnostics()
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('annotate-import-mutating.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-import-mutating.js')
    )
    // Mutating annotate MUST import the target (needed at runtime)
    expect(out[0].content).toContain('import { MyInterface }')
    // Should generate mutation code (P4B default format: the generated JS mirrors the .as structure: a block printed as data, `$blk(…)`)
    expect(out[0].content).toContain('[[["label", "Cross-File Name"]], [["name", 0]]]')
    // Deep chain mutation for address.city
    expect(out[0].content).toContain(
      '[[["label", "Cross-File City"]], [["address", 0], ["city", 0]]]'
    )
    // Top-level annotation on cross-file mutating annotate
    expect(out[0].content).toContain(
      '$blk($R, 0, MyInterface, [\n  [[["meta.description", "Cross-File Mutated"]], []],'
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('annotate-import-mutating.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-import-mutating.as.d.ts')
    )
  })

  it('must render annotate on type (non-interface)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-type.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('annotate-type.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-type.js')
    )
    // Mutating annotate on union type: the path goes through the union's items (by index) — every
    // branch that has the prop (MODEL §9 U4, §12 Q6/Q7; P4B default format: `$blk` steps)
    expect(out[0].content).toContain('[["|0", 0], ["age", 0]]')
    expect(out[0].content).toContain('[["|1", 0], ["kind", 0]]')
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('annotate-type.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-type.as.d.ts')
    )
    // Non-mutating annotate on type renders as type alias + namespace, not class extends
    expect(outDts[0].content).toContain('export type TString2 = TString')
    expect(outDts[0].content).toContain('declare namespace TString2')
    expect(outDts[0].content).toContain('export type TO2 = TO')
    expect(outDts[0].content).toContain('declare namespace TO2')
    expect(outDts[0].content).not.toContain('extends TString')
    expect(outDts[0].content).not.toContain('extends TO')
  })

  it('must render annotate through deep refs (mutating + non-mutating)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-deep-ref.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('annotate-deep-ref.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-deep-ref.js')
    )
    // (P4B default format: the generated JS mirrors the .as structure: blocks printed as data, `$blk(…)`; the shells along a path
    // through references, `$sh(…)`, MODEL §4)
    // A mutating path through references overrides them at that spot
    expect(out[0].content).toContain('$sh(Deep, [[["address", 0], ["contact", 2], ["phone", 2]]])')
    expect(out[0].content).toContain(
      '[[["label", "Mobile Phone"]], [["address", 0], ["contact", 2], ["phone", 2]]]'
    )
    // A non-mutating annotate's entry through references: the alias's own override (its
    // entries below every block: rank `null`, MODEL §8)
    expect(out[0].content).toContain(
      '$blk(null, 0, AliasedDeep, [\n  [[["label", "Work Phone"]], [["address", 2], ["contact", 2], ["phone", 2]]],'
    )

    const outDts = await repo.generate({ format: 'dts' })
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-deep-ref.as.d.ts')
    )
  })

  it('must respect merge strategy (replace vs append) in annotate blocks', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-merge-strategy.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('annotate-merge-strategy.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-merge-strategy.js')
    )
    const js = out[0].content

    // Split output into sections for targeted assertions
    // The values the runtime has: the blocks write the type's own nodes, the alias's entries
    // its own overrides over them (replace / append like a merge: the alias's first).
    const { mkdtempSync, rmSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-strategy-'))
    try {
      writeFileSync(path.join(dir, 'm.as.js'), js)
      const { User, User2 } = await import(path.join(dir, 'm.as.js'))
      const name = (t: any) => t.type.props.get('name').metadata
      expect(name(User).get('label')).toBe('Mutated Name')
      expect(name(User).get('mul')).toEqual([99])
      expect(name(User).get('mulAppend')).toEqual(['prop-original', 'prop-mutated'])
      expect(User.metadata.get('mulAppend')).toEqual(['top-original', 'top-mutated'])
      expect(name(User2).get('label')).toBe('Aliased Name')
      expect(name(User2).get('mul')).toEqual([77])
      // (MODEL §2: append keys read the bases' values first, then the own ones; §8: the `as`
      // copy's entries are its own, over the target's — it was the alias's first)
      expect(name(User2).get('mulAppend')).toEqual([
        'prop-original',
        'prop-mutated',
        'prop-aliased',
      ])
      expect(User2.metadata.get('mulAppend')).toEqual([
        'top-original',
        'top-mutated',
        'top-aliased',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('must render phantom props as comments in dts and as runtime props in js', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/phantom.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('phantom.as.js')
    await expect(out[0].content).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/phantom.js'))
    // Phantom props should appear in JS runtime output
    expect(out[0].content).toContain('.prop(')
    expect(out[0].content).toContain('"info"')
    expect(out[0].content).toContain('"resetPassword"')
    expect(out[0].content).toContain('.designType("phantom")')
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('phantom.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/phantom.as.d.ts')
    )
    // Phantom props should be comments in .d.ts, not real fields
    expect(outDts[0].content).toContain('// info: phantom')
    expect(outDts[0].content).toContain('// resetPassword: phantom')
    expect(outDts[0].content).not.toMatch(/^\s+info[?]?\s*:/m)
    expect(outDts[0].content).not.toMatch(/^\s+resetPassword[?]?\s*:/m)
    // Real props should still be present
    expect(outDts[0].content).toContain('name: string')
    expect(outDts[0].content).toContain('email: string')
  })

  it('must render custom phantom primitives as comments in dts and as runtime props in js', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/phantom-custom.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
      primitives: {
        ui: {
          type: 'phantom',
          isContainer: true,
          documentation: 'UI-only phantom type',
          extensions: {
            paragraph: { documentation: 'A paragraph element' },
            action: { documentation: 'An action element' },
          },
        },
      },
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('phantom-custom.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/phantom-custom.js')
    )
    // Custom phantom props should appear in JS runtime output
    expect(out[0].content).toContain('.prop(')
    expect(out[0].content).toContain('"info"')
    expect(out[0].content).toContain('"resetPassword"')
    expect(out[0].content).toContain('.designType("phantom")')
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('phantom-custom.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/phantom-custom.as.d.ts')
    )
    // Custom phantom props should be comments in .d.ts with full type chain
    expect(outDts[0].content).toContain('// info: ui.paragraph')
    expect(outDts[0].content).toContain('// resetPassword: ui.action')
    expect(outDts[0].content).not.toMatch(/^\s+info[?]?\s*:/m)
    expect(outDts[0].content).not.toMatch(/^\s+resetPassword[?]?\s*:/m)
    // Real props should still be present
    expect(outDts[0].content).toContain('name: string')
    expect(outDts[0].content).toContain('email: string')
  })

  it('must disable json schema by default (no options)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out[0].content).toContain('static toJsonSchema()')
    expect(out[0].content).toContain('$d("JSON Schema"')
    expect(out[0].content).not.toContain('buildJsonSchema as $$')
    expect(out[0].content).not.toContain('this._jsonSchema')
  })

  it('must render json schema method (explicit lazy)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin({ jsonSchema: 'lazy' })],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out[0].content).toContain('lazyJsonSchema as $jl')
    expect(out[0].content).toContain('return $jl(this)')
  })

  it('must pre-render json schema (bundle mode)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out[0].content).toContain('static toJsonSchema()')
    expect(out[0].content).toContain('return {')
    expect(out[0].content).not.toContain('buildJsonSchema')
    expect(out[0].content).toContain('"minLength":3')
    expect(out[0].content).toContain('"maxLength":20')
    expect(out[0].content).toContain('"pattern":"^[a-z]+$"')
    expect(out[0].content).toContain('"minimum":18')
    expect(out[0].content).toContain('"maximum":99')
    expect(out[0].content).toContain('"exclusiveMinimum":0')
    expect(out[0].content).toContain('"exclusiveMaximum":1')
    expect(out[0].content).toContain('"minItems":1')
    expect(out[0].content).toContain('"maxItems":5')
  })

  it('must produce $defs/$ref in bundle mode for discriminated union', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema-defs.as'],
      plugins: [tsPlugin({ jsonSchema: false })],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    const content = out[0].content
    // DogCat has @emit.jsonSchema — should have embedded schema with $defs
    expect(content).toContain('"$defs"')
    expect(content).toContain('"$ref":"#/$defs/Dog"')
    expect(content).toContain('"$ref":"#/$defs/Cat"')
    expect(content).toContain('"discriminator"')
    expect(content).toContain('"petType"')
  })

  it('must disable json schema (false mode)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin({ jsonSchema: false })],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out[0].content).toContain('static toJsonSchema()')
    expect(out[0].content).toContain('$d("JSON Schema"')
    expect(out[0].content).not.toContain('buildJsonSchema as $$')
    expect(out[0].content).not.toContain('this._jsonSchema')
  })

  it('must embed json schema for @emit.jsonSchema annotated interface even when disabled', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema-annotation.as'],
      plugins: [tsPlugin({ jsonSchema: false })],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    const content = out[0].content
    // No $$ import since global mode is false
    expect(content).not.toContain('buildJsonSchema as $$')
    // User interface has @emit.jsonSchema — should have embedded schema
    expect(content).toContain('"minLength":3')
    expect(content).toContain('"maxLength":20')
    expect(content).toContain('"minimum":18')
    expect(content).toContain('"maximum":99')
    // NoAnnotation interface should throw since it lacks the annotation
    // Split by class to check each independently
    const userSection = content.slice(
      content.indexOf('class User'),
      content.indexOf('class NoAnnotation')
    )
    const noAnnotationSection = content.slice(content.indexOf('class NoAnnotation'))
    expect(userSection).toContain('return {')
    expect(userSection).not.toContain('$d("JSON Schema"')
    expect(noAnnotationSection).toContain('$d("JSON Schema"')
    expect(noAnnotationSection).not.toContain('return {')
  })

  it('must embed json schema for @emit.jsonSchema annotated interface in lazy mode', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema-annotation.as'],
      plugins: [tsPlugin({ jsonSchema: 'lazy' })],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    const content = out[0].content
    // $jl import present for lazy mode (for non-annotated interfaces)
    expect(content).toContain('lazyJsonSchema as $jl')
    // User interface has @emit.jsonSchema — should have embedded schema (not lazy)
    const userSection = content.slice(
      content.indexOf('class User'),
      content.indexOf('class NoAnnotation')
    )
    expect(userSection).toContain('return {')
    expect(userSection).not.toContain('$$(this)')
    // NoAnnotation should use lazy mode
    const noAnnotationSection = content.slice(content.indexOf('class NoAnnotation'))
    expect(noAnnotationSection).toContain('return $jl(this)')
  })

  // --- DTS output tests for jsonSchema modes ---

  it('must render dts without deprecation in lazy mode', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin({ jsonSchema: 'lazy' })],
      annotations,
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].content).toContain('static toJsonSchema: () => any')
    expect(outDts[0].content).not.toContain('JSON Schema support is disabled')
  })

  it('must render dts without deprecation in bundle mode', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin({ jsonSchema: 'bundle' })],
      annotations,
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].content).toContain('static toJsonSchema: () => any')
    expect(outDts[0].content).not.toContain('JSON Schema support is disabled')
  })

  it('must render dts with deprecation jsdoc when json schema disabled', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin({ jsonSchema: false })],
      annotations,
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].content).toContain('@deprecated')
    expect(outDts[0].content).toContain('JSON Schema support is disabled')
    expect(outDts[0].content).toContain("jsonSchema: 'lazy'")
    expect(outDts[0].content).toContain("jsonSchema: 'bundle'")
    expect(outDts[0].content).toContain('static toJsonSchema: () => any')
  })

  it('must render dts with deprecation jsdoc by default (no options)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].content).toContain('@deprecated')
    expect(outDts[0].content).toContain('static toJsonSchema: () => any')
  })

  it('must render dts for @emit.jsonSchema annotation with json schema disabled', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema-annotation.as'],
      plugins: [tsPlugin({ jsonSchema: false })],
      annotations,
    })
    const outDts = await repo.generate({ format: 'dts' })
    const content = outDts[0].content
    // Both interfaces get the deprecation since it's at the global config level
    // (the annotation only affects .js output, not .d.ts declarations)
    expect(content).toContain('@deprecated')
    expect(content).toContain('static toJsonSchema: () => any')
  })

  it('must emit refTo and annotations for type alias refs in unions', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/union-type-alias-ref.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('union-type-alias-ref.as.js')
    // The third union item (MyString) should be a reference, not an inline primitive (P4B default format: the generated JS mirrors the .as structure,
    // MODEL §1)
    expect(out[0].content).toContain('.item($().ref(MyString).$type)')
    // The MyString ref should carry its label annotation
    expect(out[0].content).toContain('.annotate("label", "My String Label")')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/union-type-alias-ref.js')
    )
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('union-type-alias-ref.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/union-type-alias-ref.as.d.ts')
    )
  })
  it('must render __flat for @db.table interfaces', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/db-table-flat.as'],
      plugins: [tsPlugin()],
      annotations,
      // (`__flat` comes from the module evaluated at build time: a module with error
      // diagnostics — unknown `@db.*` here — is not, MODEL §12 Q8)
      unknownAnnotation: 'allow',
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].fileName).toBe('db-table-flat.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/db-table-flat.as.d.ts')
    )
  })
  it('must render __pk for @db.table interfaces with @meta.id', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/db-table-pk.as'],
      plugins: [tsPlugin()],
      annotations: {
        ...annotations,
        db: {
          mongo: {
            collection: new AnnotationSpec({
              nodeType: ['interface'],
            }),
          },
        },
      },
      unknownAnnotation: 'allow',
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].fileName).toBe('db-table-pk.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/db-table-pk.as.d.ts')
    )
  })

  it('must render __dim/__measure for @db.table interfaces with dimension/measure annotations', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/db-table-agg.as'],
      plugins: [tsPlugin()],
      annotations,
      // (MODEL §12 Q8: a module with error diagnostics is not generated; the fixture's unknown
      // annotations are rendered, not diagnosed, here)
      unknownAnnotation: 'allow',
    })
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts[0].fileName).toBe('db-table-agg.as.d.ts')
    const dts = outDts[0].content
    // Order has dim/measure
    expect(dts).toContain('static __dim: "status" | "currency"')
    expect(dts).toContain('static __measure: "amount"')
    // Product has neither
    const productDts = dts.slice(dts.indexOf('class Product'))
    expect(productDts).not.toContain('__dim')
    expect(productDts).not.toContain('__measure')
    await expect(dts).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/db-table-agg.as.d.ts'))

    const outJs = await repo.generate({ format: 'js' })
    const js = outJs[0].content
    // Order has dimensions/measures arrays
    expect(js).toContain("static dimensions = ['status', 'currency']")
    expect(js).toContain("static measures = ['amount']")
    // Product has neither
    const productJs = js.slice(js.indexOf('class Product'))
    expect(productJs).not.toContain('dimensions')
    expect(productJs).not.toContain('measures')
  })

  it('must render ref annotation arguments as lazy getters', async () => {
    const refAnnotation = new AnnotationSpec({
      argument: { name: 'target', type: 'ref' },
    })
    const refAnnotationMultiArg = new AnnotationSpec({
      argument: [
        { name: 'target', type: 'ref' },
        { name: 'label', type: 'string' },
      ],
    })
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/ref-annotation.as'],
      plugins: [tsPlugin()],
      annotations: {
        ...annotations,
        some: {
          ref: refAnnotation,
          refMulti: refAnnotationMultiArg,
        },
      },
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('ref-annotation.as.js')
    // Simple ref: PostTag → () => PostTag
    expect(out[0].content).toContain('() => PostTag')
    // Chain ref: User.name → { type: () => User, field: "name" }
    expect(out[0].content).toContain('{ type: () => User, field: "name" }')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/ref-annotation.js')
    )
  })

  // An interface extending another holds the parent's prop nodes themselves (`.share(…)`): the
  // types inside the parent's props are the parent module's business — the child imports only
  // the parent (no helper of the parent's tree is synthesized into it any more).
  const generateChild = async (fixture: string) => {
    const repo = await build({
      rootDir: wd,
      entries: [`test/fixtures/${fixture}.as`],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, `test/__snapshots__/${fixture}.js`)
    )
    return out[0].content
  }

  it('an inherited prop is the parent’s node: no import of the types inside it', async () => {
    // (P4B default format: the generated JS mirrors the .as structure: a field only the parent has is the parent's node, MODEL §5,
    // printed `$f(Parent, "field")`; it was `.share(…)`)
    const js = await generateChild('extends-cross-helper-child')
    expect(js).toContain('.prop("payload", $f(Base, "payload"))')
    const importMatch = js.match(/import \{([^}]+)\} from "\.\/extends-cross-helper-base\.as"/)
    expect(importMatch![1].split(',').map(n => n.trim())).toEqual(['Base'])
    for (const fixture of [
      'extends-synth-child',
      'extends-nested-child',
      'extends-annot-child',
      'extends-reexport-child',
      'extends-recursive-child',
    ]) {
      const code = await generateChild(fixture)
      expect(code).toMatch(/\.prop\("(payload|state)", \$f\(Base, "(payload|state)"\)\)/)
      expect(code).not.toMatch(/import \{[^}]*\bHelper\b/)
      expect(code).not.toMatch(/import \{[^}]*\bJsonValue\b/)
    }
  })

  it('an inherited prop never clashes with the child’s names (nothing synthesized)', async () => {
    // (P4B default format: the generated JS mirrors the .as structure: `$f(Parent, "field")` for the parent's node, `$().ref(T)` for a
    // reference, MODEL §1 / §5)
    const clash = await generateChild('extends-synth-clash-child')
    expect(clash).toContain('.prop("payload", $f(Base, "payload"))')
    expect(clash).not.toContain('Helper_1')
    expect(clash.slice(clash.indexOf('"own"'))).toContain('$().ref(Helper)')
    const xpath = await generateChild('extends-xpath-child')
    expect(xpath).toMatch(/import \{ Helper \} from "\.\/extends-xpath-a\.as"/)
    expect(xpath).not.toContain('Helper_1')
    expect(xpath.slice(xpath.indexOf('"fromUser"'))).toContain('$().ref(Helper)')
    const fallback = await generateChild('extends-fallback-child')
    expect(fallback).not.toContain('Helper_2')
    expect(fallback).toContain('export class Helper_1 {')
    const dedup = await generateChild('extends-dedup-child')
    const baseImports = dedup.match(/import \{[^}]*\} from "\.\/extends-dedup-base\.as"/g) || []
    expect(baseImports).toEqual(['import { Base, Helper } from "./extends-dedup-base.as"'])
  })

  it('a child of several parents, and of a parent extending another, shares each parent’s props', async () => {
    // (P4B default format: the generated JS mirrors the .as structure: `$f(Parent, "field")` for the parent's node, MODEL §5)
    const multi = await generateChild('extends-synth-multi-child')
    expect(multi).toContain('.prop("propA", $f(Base1, "propA"))')
    expect(multi).toContain('.prop("propB", $f(Base2, "propB"))')
    expect(multi).not.toMatch(/import \{[^}]*\bHelper\b/)
    // (from the parent it extends: the grandparent's prop through it)
    const grand = await generateChild('extends-grand-child')
    // (Mid.g is Grand.g itself, MODEL §5: printed as the grandparent's node)
    expect(grand).toContain('.prop("g", $f(Grand, "g"))')
    expect(grand).toContain('.prop("m", $f(Mid, "m"))')
    expect(grand).not.toMatch(/import \{[^}]*\bHelper\b/)
    // (a chain reference and a type alias in the parent's props stay the parent's)
    const chain = await generateChild('extends-chain-child')
    expect(chain).toContain('.prop("userName", $f(Base, "userName"))')
    expect(chain).not.toMatch(/import \{[^}]*\bUser\b/)
    const alias = await generateChild('extends-typealias-child')
    expect(alias).toContain('.prop("field", $f(Base, "field"))')
    expect(alias).not.toMatch(/import \{[^}]*\bMyAlias\b/)
  })

  // The downstream patterns the parents' prop trees carry — a recursive type alias, a type-alias
  // helper, a chain reference — reached through `extends` across files: the child loads,
  // validates (interpreted and compiled), has the parent's metadata (a block of the chain's
  // target included), and its JSON schemas and serialized form terminate and agree.
  it('a child holding a parent prop tree of recursive aliases, alias helpers and chains works', async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { buildJsonSchema } = await import('./runtime/json-schema')
    const { serializeAnnotatedType, deserializeAnnotatedType } = await import('./runtime/serialize')
    const { Validator } = await import('./runtime/validator')
    const files = {
      'base.as': [
        "@meta.label 'Json'",
        'export type JsonValue = string | number | boolean | null | JsonValue[] | { [/^.+$/]: JsonValue }',
        "@meta.label 'Alias'",
        'export type MyAlias = string | number | { kind: string }',
        'export interface User {',
        "  @meta.label 'User name'",
        '  @expect.maxLength 4',
        '  name: string',
        '}',
        'export interface Base {',
        '  state: {',
        '    context: JsonValue',
        '    meta?: { [/^.+$/]: JsonValue }',
        '  }',
        '  field: MyAlias',
        '  userName: User.name',
        '}',
      ].join('\n'),
      'child.as': [
        "import { Base, User } from './base'",
        'export interface Child extends Base {',
        '  id: string',
        '}',
        'annotate User {',
        "  @meta.description 'D'",
        '  name',
        '}',
      ].join('\n'),
    }
    const valid = {
      id: 'x',
      state: { context: { a: [1, 'b', null, { c: true }] }, meta: { k: [] } },
      field: { kind: 'k' },
      userName: 'abcd',
    }
    const invalid = [
      { ...valid, userName: 'abcde' },
      { ...valid, state: { context: { a: [1, { b: () => 1 }] } } },
      { ...valid, field: { kind: 1 } },
      { ...valid, id: 1 },
    ]
    const check = async (compileValidators: boolean) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'atscript-extends-trees-'))
      try {
        for (const [name, text] of Object.entries(files)) {
          writeFileSync(path.join(dir, name), text)
        }
        const repo = await build({
          rootDir: dir,
          entries: Object.keys(files),
          plugins: [tsPlugin({ jsonSchema: 'bundle', compileValidators })],
        })
        const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
        expect(errors.map(m => m.message)).toEqual([])
        for (const out of await repo.generate({ format: 'js' })) {
          writeFileSync(path.join(dir, `${path.basename(out.source)}.js`), out.content)
        }
        const { Base } = await import(path.join(dir, 'base.as.js'))
        const { Child } = await import(path.join(dir, 'child.as.js'))
        const prop = (t: any, name: string) => t.type.props.get(name)
        // (the parent's nodes themselves)
        for (const name of ['state', 'field', 'userName']) {
          expect(prop(Child, name)).toBe(prop(Base, name))
        }
        expect(Object.fromEntries(prop(Child, 'userName').metadata)).toEqual({
          'meta.label': 'User name',
          'expect.maxLength': { length: 4 },
          'meta.description': 'D',
        })
        expect(prop(Child, 'field').metadata.get('meta.label')).toBe('Alias')
        expect(prop(prop(Child, 'state'), 'context').metadata.get('meta.label')).toBe('Json')
        const verdicts = (t: any) =>
          [valid, ...invalid].map(v => new Validator(t).validate(v, true))
        expect(verdicts(Child)).toEqual([true, false, false, false, false])
        expect(Child.toJsonSchema()).toEqual(buildJsonSchema(Child))
        const copy = deserializeAnnotatedType(
          JSON.parse(JSON.stringify(serializeAnnotatedType(Child)))
        )
        expect(verdicts(copy)).toEqual([true, false, false, false, false])
        expect(prop(copy, 'userName').metadata.get('meta.description')).toBe('D')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    await check(false)
    await check(true)
  })

  it('an annotate block of the parent reaches the child through the shared prop', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/annotate-extends-child.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    const js = out[0].content
    // The child holds the parent's `username` node: the block, written once on the parent's
    // node, is the child's too (nothing baked into the child's chain).
    // (P4B default format: the generated JS mirrors the .as structure: the parent's node `$f(Parent, "field")`, MODEL §5; the block as
    // data on the parent, MODEL §3)
    expect(js).toContain('.prop("username", $f(AnnotateExtendsBase, "username"))')
    expect(js).toContain(
      '$blk($R, 0, AnnotateExtendsBase, [\n  [[["meta.id", true]], [["username", 0]]],'
    )
  })

  it('must render query annotation arguments as query tree objects', async () => {
    const filterAnnotation = new AnnotationSpec({
      argument: { name: 'filter', type: 'query' },
    })
    const joinsAnnotation = new AnnotationSpec({
      argument: [
        { name: 'target', type: 'ref' },
        { name: 'on', type: 'query' },
      ],
    })
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/query-annotation.as'],
      plugins: [tsPlugin()],
      annotations: {
        ...annotations,
        some: {
          filter: filterAnnotation,
          joins: joinsAnnotation,
        },
      },
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('query-annotation.as.js')
    // Simple comparison — $-prefixed operators
    expect(out[0].content).toContain('"$eq"')
    // Qualified ref: User.status → type: () => User
    expect(out[0].content).toContain('() => User')
    // AND logical
    expect(out[0].content).toContain('"$and"')
    // OR logical
    expect(out[0].content).toContain('"$or"')
    // NOT logical
    expect(out[0].content).toContain('"$not"')
    // in operator
    expect(out[0].content).toContain('"$in"')
    // exists operator
    expect(out[0].content).toContain('"$exists"')
    // not in operator
    expect(out[0].content).toContain('"$nin"')
    // matches/regex operator
    expect(out[0].content).toContain('"$regex"')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/query-annotation.js')
    )
  })
  it('must render expr and order annotation arguments as runtime trees', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/expr-annotation.as'],
      plugins: [tsPlugin()],
      annotations: {
        ...annotations,
        some: {
          compute: new AnnotationSpec({ argument: { name: 'expression', type: 'expr' } }),
          joins: new AnnotationSpec({
            argument: [
              { name: 'target', type: 'ref' },
              { name: 'order', type: 'order' },
            ],
          }),
        },
      },
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    const js = out[0].content
    expect(js).toContain(
      '.annotate("some.compute", { op: "+", args: [{ op: "*", args: [{ field: "openCount" }, 10] }, { field: "overdueCount" }] })'
    )
    expect(js).toContain(
      '.annotate("some.compute", { op: "-", args: [{ op: "/", args: [{ op: "*", args: [{ op: "neg", args: [{ op: "-", args: [{ field: "a" }, { field: "b" }] }] }, 2] }, { op: "coalesce", args: [{ field: "c" }, 1.5] }] }, -1] })'
    )
    expect(js).toContain(
      'order: [{ ref: { field: "raisedAt" }, desc: true }, { ref: { type: () => Issue, field: "id" } }]'
    )
    await expect(js).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/expr-annotation.js'))

    const dts = await repo.generate({ format: 'dts' })
    const globalDts = dts.find(f => f.fileName === 'atscript.d.ts')!.content
    expect(globalDts).toContain(
      '"some.compute": import("@atscript/typescript/utils").AtscriptExprNode'
    )
    expect(globalDts).toContain('order: import("@atscript/typescript/utils").AtscriptOrderItem[]')
  })
})

describe('ts-plugin — compileValidators', () => {
  const annotatedDir = path.join(wd, 'src/__test__/fixtures/compiled-annotated')

  /** The JS module rendered for `entry` (relative to `rootDir`). */
  const render = async (
    entry: string,
    opts: { format?: string; compileValidators?: boolean; rootDir?: string } = {}
  ) => {
    const repo = await build({
      rootDir: opts.rootDir ?? wd,
      entries: [entry],
      plugins: [tsPlugin({ compileValidators: opts.compileValidators })],
      annotations,
    })
    const out = await repo.generate({ format: opts.format ?? 'js' })
    return out.find(f => f.fileName === `${path.basename(entry)}.js`)!.content
  }

  // Off by default: covered by every snapshot above (byte-identical output).
  for (const [fixture, snapshot] of [
    ['interface.as', 'interface.js'],
    ['imports.as', 'imports.js'],
    ['annotate-mutating.as', 'annotate-mutating.js'],
    ['extends-recursive-base.as', 'extends-recursive-base.js'],
    ['extends-recursive-child.as', 'extends-recursive-child.js'],
  ]) {
    it(`must emit compiled validator checks (${fixture})`, async () => {
      const content = await render(`test/fixtures/${fixture}`, { compileValidators: true })
      expect(content).toContain('registerCompiledCheck as $cv')
      expect(content).not.toMatch(/\bnew Function\b|\bFunction\(|\beval\(/)
      await expect(content).toMatchFileSnapshot(
        path.join(wd, `test/__snapshots__/compiled/${snapshot}`)
      )
    })
  }

  describe('@emit.compiledValidator (option off)', () => {
    const renderAnnotated = (entry: string, opts: Parameters<typeof render>[1] = {}) =>
      render(entry, { ...opts, rootDir: annotatedDir })

    it('compiles only the annotated types', async () => {
      const content = await renderAnnotated('models.as')
      expect(content).toContain('registerCompiledCheck as $cv')
      expect(content.match(/^\$cv\((\w+)/gm)).toEqual(['$cv(Status', '$cv(Order'])
      await expect(content).toMatchFileSnapshot(
        path.join(wd, 'test/__snapshots__/compiled/compiled-annotated.js')
      )
    })

    it('a chained reference into an imported type compiles (the realm knows the field)', async () => {
      const content = await renderAnnotated('runtime.as')
      expect(content).toContain('registerCompiledCheck as $cv')
      expect(content.match(/^\$cv\((\w+)/gm)).toEqual(['$cv(Street'])
    })

    it('js:interpreted ignores the annotation; with the option on it is redundant', async () => {
      expect(await renderAnnotated('models.as', { format: 'js:interpreted' })).not.toContain('$cv')
      const all = await renderAnnotated('models.as', { compileValidators: true })
      expect(all.match(/^\$cv\((\w+)/gm)).toEqual([
        '$cv(Line',
        '$cv(Status',
        '$cv(Order',
        '$cv(Plain',
      ])
      expect(await renderAnnotated('models.as', { format: 'js:compiled' })).toBe(all)
    })

    it('a class the model cannot follow does not disable an unrelated annotated class', async () => {
      // `Street` (a chained reference through an alias of an imported type) is beyond the
      // validation model; Small does not reference it.
      const content = await renderAnnotated('unrelated.as')
      // (P4B default format: the generated JS mirrors the .as structure; MODEL §10 D3: the bare alias AddressAlias is Address)
      expect(content).toContain('$al(Street, Address, ["street"])')
      expect(content.match(/^\$cv\((\w+)/gm)).toEqual(['$cv(Small'])
    })

    it('warns about a mutating annotate of an imported type', async () => {
      const repo = await build({ rootDir: annotatedDir, entries: ['unrelated.as'], annotations })
      const diagnostics = await repo.diagnostics()
      const messages = [...diagnostics.values()].flat().map(m => m.message)
      expect(messages).toEqual([
        expect.stringContaining('@emit.compiledValidator has no effect on a mutating annotate'),
      ])
    })
  })

  it('the js:compiled / js:interpreted formats override the option', async () => {
    const entry = 'test/fixtures/interface.as'
    const plain = await render(entry)
    expect(plain).not.toContain('$cv')
    expect(await render(entry, { format: 'js:interpreted', compileValidators: true })).toBe(plain)
    expect(await render(entry, { format: 'js:compiled' })).toBe(
      await render(entry, { compileValidators: true })
    )
  })
})

describe('ts-plugin — dts of a primitive whose type is a union', () => {
  it('is parenthesized in an intersection and as an array item', async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-prim-'))
    try {
      writeFileSync(
        path.join(dir, 'prim.as'),
        'export type List = strnum[]\nexport type Both = strnum & string\nexport type Either = strnum | boolean\n'
      )
      const repo = await build({
        rootDir: dir,
        entries: ['prim.as'],
        plugins: [tsPlugin()],
        primitives: { strnum: { type: { kind: 'union', items: ['string', 'number'] } } },
      })
      const [dts] = await repo.generate({ format: 'dts' })
      expect(dts.content).toContain('export type List = (string | number)[]\n')
      expect(dts.content).toContain('export type Both = (string | number) & string\n')
      expect(dts.content).toContain('export type Either = string | number | boolean\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
