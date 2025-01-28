import { build } from '@anscript/core'
import { describe, expect, it } from 'vitest'
import { tsPlugin } from './plugin'
import path from 'path'

const wd = process.cwd().replace(/src$/, '')

describe('ts-plugin', () => {
  it('must render interface', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/interface.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('interface.ts')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface.ts')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('interface.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface.d.ts')
    )
  })
  it('must render type', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/type.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('type.ts')
    await expect(out[0].content).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/type.ts'))
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('type.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/type.d.ts')
    )
  })
  it('must render multiple interfaces', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/multiple-interface.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('multiple-interface.ts')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/multiple-interface.ts')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('multiple-interface.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/multiple-interface.d.ts')
    )
  })
  it('must render imports', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/imports.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('imports.ts')
    await expect(out[0].content).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/imports.ts'))
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('imports.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/imports.d.ts')
    )
  })

  it('must render basic interface metadata', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/interface-metadata.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('interface-metadata.ts')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface-metadata.ts')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('interface-metadata.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface-metadata.d.ts')
    )
  })
  it('must render metadata inherited from other interface', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/inherit-metadata.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('inherit-metadata.ts')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-metadata.ts')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('inherit-metadata.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-metadata.d.ts')
    )
  })
  it('must render metadata inherited from type', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/inherit-from-type.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('inherit-from-type.ts')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-from-type.ts')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('inherit-from-type.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-from-type.d.ts')
    )
  })
  it('must render metadata inherited from multiple ancestors', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/inherit-chain.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('inherit-chain.ts')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-chain.ts')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('inherit-chain.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-chain.d.ts')
    )
  })
  it('must render real-world example (entity with address)', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/real-world-1.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({ context: 'build' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('real-world-1.ts')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/real-world-1.ts')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('real-world-1.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/real-world-1.d.ts')
    )
  })
})
