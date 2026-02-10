import { AnnotationSpec, build } from '@atscript/core'
import { describe, expect, it } from 'vitest'
import { tsPlugin } from './plugin'
import path from 'path'

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
  it('must render interfaces/types with intersections', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/intersections.as'],
      plugins: [tsPlugin()],
      annotations,
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
    // Top-level annotation on non-mutating annotate replaces the original in alias
    expect(out[0].content).toContain('.annotate("meta.description", "Annotated")')
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
    // Deep chain mutation navigates via .type.props.get()
    expect(out[0].content).toContain('.type.props.get("address")?.type.props.get("city")?')
    // Multiple annotation uses array push pattern
    expect(out[0].content).toContain('Array.isArray')
    // Top-level annotation on mutating annotate generates mutation on target's metadata
    expect(out[0].content).toContain('MyInterface.metadata.set("meta.description", "Mutated Interface")')
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
    // Should inline the full type definition with overridden annotations
    expect(out[0].content).toContain('ImportedAnnotated')
    expect(out[0].content).toContain('"Imported Name"')
    expect(out[0].content).toContain('"Imported City"')
    // Cross-file non-mutating annotate carries over target's type-level annotation
    expect(out[0].content).toContain('.annotate("meta.description", "Original")')
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
    // Should generate mutation code
    expect(out[0].content).toContain('MyInterface.type.props.get("name")')
    expect(out[0].content).toContain('.metadata.set("label"')
    // Deep chain mutation for address.city
    expect(out[0].content).toContain('.type.props.get("address")?.type.props.get("city")?')
    // Top-level annotation on cross-file mutating annotate
    expect(out[0].content).toContain('MyInterface.metadata.set("meta.description", "Cross-File Mutated")')
    const outDts = await repo.generate({ format: 'dts' })
    expect(outDts).toHaveLength(2)
    expect(outDts[0].fileName).toBe('annotate-import-mutating.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/annotate-import-mutating.as.d.ts')
    )
  })

  it('must render json schema method', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out[0].content).toContain('static toJsonSchema()')
    expect(out[0].content).toContain('buildJsonSchema as $$')
  })

  it('must pre-render json schema', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/jsonschema.as'],
      plugins: [tsPlugin({ preRenderJsonSchema: true })],
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
    expect(out[0].content).toContain('"minItems":1')
    expect(out[0].content).toContain('"maxItems":5')
  })
})
