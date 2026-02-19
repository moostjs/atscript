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
    // Multiple+replace annotation clears before appending
    expect(out[0].content).toContain('metadata.delete("mul")')
    expect(out[0].content).toContain('$a(MyInterface.type.props.get("name")?.metadata, "mul", 42, true)')
    // Top-level annotation on mutating annotate generates mutation on target's metadata
    expect(out[0].content).toContain('$a(MyInterface.metadata, "meta.description", "Mutated Interface")')
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
    expect(out[0].content).toContain('$a(MyInterface.type.props.get("name")?.metadata, "label"')
    // Deep chain mutation for address.city
    expect(out[0].content).toContain('.type.props.get("address")?.type.props.get("city")?')
    // Top-level annotation on cross-file mutating annotate
    expect(out[0].content).toContain('$a(MyInterface.metadata, "meta.description", "Cross-File Mutated")')
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
    // Mutating annotate on union type uses items[N] path, not direct .props
    expect(out[0].content).toContain('.items[')
    expect(out[0].content).not.toContain('TO.type.props.get(')
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
    const userInline = js.slice(js.indexOf('$("object", User)'), js.indexOf('\n$a('))
    const mutationSection = js.slice(js.indexOf('\n$a('), js.indexOf('$("object", User2)'))
    const user2Section = js.slice(js.indexOf('$("object", User2)'))

    // --- User inline definition (original annotations only, no ad-hoc merge) ---
    expect(userInline).toContain('.annotate("label", "Original Name")')
    expect(userInline).toContain('.annotate("mulAppend", "prop-original", true)')
    expect(userInline).toContain('.annotate("mul", 1, true)')
    expect(userInline).toContain('.annotate("mul", 2, true)')
    // Ad-hoc annotations are NOT in the inline definition
    expect(userInline).not.toContain('"Mutated Name"')
    expect(userInline).not.toContain('"prop-mutated"')
    expect(userInline).not.toContain('.annotate("mul", 99')
    // Top-level: only original
    expect(userInline).toContain('\n  .annotate("mulAppend", "top-original", true)')

    // --- Mutation statements (right after User, before User2) ---
    // Replace (single): label mutation does NOT use asArray
    expect(mutationSection).toContain('$a(User.type.props.get("name")?.metadata, "label", "Mutated Name")')
    expect(mutationSection).not.toContain('"label", "Mutated Name", true)')
    // Replace (multiple): mul clears existing before appending
    expect(mutationSection).toContain('metadata.delete("mul")')
    expect(mutationSection).toContain('$a(User.type.props.get("name")?.metadata, "mul", 99, true)')
    // Append: mulAppend does NOT clear, just appends
    expect(mutationSection).not.toContain('metadata.delete("mulAppend")')
    expect(mutationSection).toContain('$a(User.type.props.get("name")?.metadata, "mulAppend", "prop-mutated", true)')
    expect(mutationSection).toContain('$a(User.metadata, "mulAppend", "top-mutated", true)')

    // --- User2 inline definition (non-mutating annotate alias — merged) ---
    // Replace: label replaced to "Aliased Name"
    expect(user2Section).toContain('.annotate("label", "Aliased Name")')
    expect(user2Section).not.toContain('"Original Name"')
    // Replace: mul replaced to 77 (originals 1,2 gone)
    expect(user2Section).toContain('.annotate("mul", 77, true)')
    expect(user2Section).not.toContain('.annotate("mul", 1')
    expect(user2Section).not.toContain('.annotate("mul", 2')
    // Append: both prop-level mulAppend values present
    expect(user2Section).toContain('.annotate("mulAppend", "prop-aliased", true)')
    expect(user2Section).toContain('.annotate("mulAppend", "prop-original", true)')
    // Top-level: both aliased and original present (append)
    expect(user2Section).toContain('.annotate("mulAppend", "top-aliased", true)')
    expect(user2Section).toContain('.annotate("mulAppend", "top-original", true)')
  })

  it('must render phantom props as comments in dts and as runtime props in js', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/phantom.as'],
      plugins: [tsPlugin()],
      annotations,
    })
    const out = await repo.generate({ format: 'js' })
    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('phantom.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/phantom.js')
    )
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
    expect(out[0].content).toContain('throw new Error')
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
    expect(out[0].content).toContain('buildJsonSchema as $$')
    expect(out[0].content).toContain('this._jsonSchema ?? (this._jsonSchema = $$(this))')
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
    expect(out[0].content).toContain('"minItems":1')
    expect(out[0].content).toContain('"maxItems":5')
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
    expect(out[0].content).toContain('throw new Error')
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
    const userSection = content.slice(content.indexOf('class User'), content.indexOf('class NoAnnotation'))
    const noAnnotationSection = content.slice(content.indexOf('class NoAnnotation'))
    expect(userSection).toContain('return {')
    expect(userSection).not.toContain('throw new Error')
    expect(noAnnotationSection).toContain('throw new Error')
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
    // $$ import present for lazy mode (for non-annotated interfaces)
    expect(content).toContain('buildJsonSchema as $$')
    // User interface has @emit.jsonSchema — should have embedded schema (not lazy)
    const userSection = content.slice(content.indexOf('class User'), content.indexOf('class NoAnnotation'))
    expect(userSection).toContain('return {')
    expect(userSection).not.toContain('$$(this)')
    // NoAnnotation should use lazy mode
    const noAnnotationSection = content.slice(content.indexOf('class NoAnnotation'))
    expect(noAnnotationSection).toContain('this._jsonSchema ?? (this._jsonSchema = $$(this))')
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
    expect(outDts[0].content).not.toContain('@deprecated')
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
    expect(outDts[0].content).not.toContain('@deprecated')
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
})
