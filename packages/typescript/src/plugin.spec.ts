import { AnnotationSpec, build } from '@anscript/core'
import { describe, expect, it } from 'vitest'
import { tsPlugin } from './plugin'
import path from 'path'

const wd = process.cwd().replace(/src$/, '')

const annotations = {
  label: new AnnotationSpec({
    argument: {
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
  obj: new AnnotationSpec({
    argument: [
      {
        name: 'prop1',
        type: 'string',
      },
      {
        name: 'prop2',
        type: 'number',
      },
      {
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
})
