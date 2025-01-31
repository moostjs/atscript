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
    expect(out[0].name).toBe('interface.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface.js')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('interface.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface.dd.ts')
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
    expect(out[0].name).toBe('type.as.js')
    await expect(out[0].content).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/type.js'))
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('type.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/type.dd.ts')
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
    expect(out[0].name).toBe('multiple-interface.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/multiple-interface.js')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('multiple-interface.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/multiple-interface.dd.ts')
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
    expect(out[0].name).toBe('imports.as.js')
    await expect(out[0].content).toMatchFileSnapshot(path.join(wd, 'test/__snapshots__/imports.js'))
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('imports.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/imports.dd.ts')
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
    expect(out[0].name).toBe('interface-metadata.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface-metadata.js')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('interface-metadata.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/interface-metadata.dd.ts')
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
    expect(out[0].name).toBe('inherit-metadata.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-metadata.js')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('inherit-metadata.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-metadata.dd.ts')
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
    expect(out[0].name).toBe('inherit-from-type.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-from-type.js')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('inherit-from-type.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-from-type.dd.ts')
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
    expect(out[0].name).toBe('inherit-chain.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-chain.js')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('inherit-chain.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/inherit-chain.dd.ts')
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
    expect(out[0].name).toBe('real-world-1.as.js')
    await expect(out[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/real-world-1.js')
    )
    const outDts = await repo.generate({ context: 'prepare' })
    expect(outDts).toHaveLength(1)
    expect(outDts[0].name).toBe('real-world-1.as.d.ts')
    await expect(outDts[0].content).toMatchFileSnapshot(
      path.join(wd, 'test/__snapshots__/real-world-1.dd.ts')
    )
  })
})
