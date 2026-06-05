import { describe, expect, it } from 'vitest'

import { loadConfig } from './load-config'

describe('loadConfig', () => {
  it('rejects with a clean error when given no config path', async () => {
    // resolveConfigFile returns undefined when no atscript.config.* is found.
    // loadConfig must surface a clear, catchable Error instead of a raw
    // ERR_INVALID_ARG_TYPE from path.extname(undefined).
    await expect(loadConfig(undefined as unknown as string)).rejects.toThrow(
      /no config path provided/u
    )
  })

  it('rejects with a clean error on an empty config path', async () => {
    await expect(loadConfig('')).rejects.toThrow(/no config path provided/u)
  })
})
