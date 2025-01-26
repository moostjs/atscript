import { build } from '@anscript/core'
import { describe, expect, it } from 'vitest'
import { tsPlugin } from './plugin'

describe('ts-plugin', () => {
  it('must render ts files', async () => {
    const repo = await build({
      entries: ['./test/fixtures/interface.as'],
      plugins: [tsPlugin()],
    })
    const out = await repo.generate({})
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('interface.ts')
    expect(out[0].content).toMatchFileSnapshot('../test/__snapshots__/interface.as.ts')
  })
})
