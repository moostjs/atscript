import path from 'path'

import { describe, expect, it } from 'vitest'

import type { TAtscriptConfig } from '../config'
import { PluginManager } from './plugin-manager'
import { createAtscriptPlugin } from './types'

describe('PluginManager.config', () => {
  it("keeps the manager's root as rootDir, whatever a plugin's config hook returns", async () => {
    const root = path.resolve('/project/root')
    let seen: TAtscriptConfig | undefined
    const manager = new PluginManager(
      {
        rootDir: 'src',
        plugins: [
          createAtscriptPlugin({ name: 'moves-root', config: () => ({ rootDir: 'elsewhere' }) }),
          createAtscriptPlugin({
            name: 'reader',
            buildStart: config => {
              seen = config
            },
          }),
        ],
      },
      root
    )

    await manager.buildStart()
    const config = await manager.config()

    expect(config.rootDir).toBe(root)
    expect(seen?.rootDir).toBe(root)
  })

  it("without a root: the config's rootDir resolved against the working directory", async () => {
    const seen: Array<string | undefined> = []
    const plugin = createAtscriptPlugin({
      name: 'reader',
      config: config => {
        seen.push(config.rootDir)
        return undefined
      },
    })

    const relative = await new PluginManager({ rootDir: 'rel', plugins: [plugin] }).config()
    const unset = await new PluginManager({ plugins: [plugin] }).config()

    expect([relative.rootDir, unset.rootDir]).toEqual([path.resolve('rel'), process.cwd()])
    expect(seen).toEqual([path.resolve('rel'), process.cwd()])
  })

  it('runs the config hooks again after they failed', async () => {
    let calls = 0
    const manager = new PluginManager({
      plugins: [
        createAtscriptPlugin({
          name: 'fails-once',
          config: () => {
            calls++
            if (calls === 1) {
              throw new Error('not ready')
            }
            return { unknownAnnotation: 'warn' }
          },
        }),
      ],
    })

    await expect(manager.config()).rejects.toThrow('not ready')
    const config = await manager.config()
    expect(config.unknownAnnotation).toBe('warn')
    // (and kept once it succeeded)
    await manager.config()
    expect(calls).toBe(2)
  })
})
