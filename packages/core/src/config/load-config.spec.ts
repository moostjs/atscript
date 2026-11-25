import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadConfig } from './load-config'

const dirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** A directory holding the config file `name` with `content`: the file's path. */
function configFile(name: string, content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-config-'))
  dirs.push(dir)
  const file = path.join(dir, name)
  writeFileSync(file, content)
  return file
}

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

  it('loads a .ts config', async () => {
    const file = configFile(
      'atscript.config.ts',
      "const format: string = 'dts'\nexport default { format }\n"
    )
    await expect(loadConfig(file)).resolves.toEqual({ format: 'dts' })
  })

  for (const name of ['atscript.config.ts', 'atscript.config.mjs']) {
    it(`rejects a ${path.extname(name)} config that throws while it is evaluated`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const file = configFile(
        name,
        "if (globalThis) {\n  throw new Error('config failed')\n}\nexport default {}\n"
      )
      const error = await loadConfig(file).catch((error_: unknown) => error_)
      expect(error).toBeInstanceOf(Error)
      expect(((error as Error).cause as Error | undefined)?.message).toBe('config failed')
    })
  }

  it('removes the bundled copies a process that is gone left beside the config, only those', async () => {
    const file = configFile('atscript.config.ts', "export default { format: 'dts' }\n")
    const dir = path.dirname(file)
    const gone = spawnSync(process.execPath, ['-e', '']).pid
    expect(() => process.kill(gone, 0)).toThrow()
    const leftovers = [`atscript.config.Ab-1_c.${gone}.0.mjs`, `atscript.config.Xy2.${gone}.3.cjs`]
    const kept = [
      `atscript.config.Ab-1_c.${process.pid}.999.mjs`,
      'atscript.config.mts',
      'atscript.config.Ab-1_c.mjs',
      `other.config.Ab.${gone}.0.mjs`,
    ]
    for (const name of [...leftovers, ...kept]) {
      writeFileSync(path.join(dir, name), 'export default {}\n')
    }

    await expect(loadConfig(file)).resolves.toEqual({ format: 'dts' })

    expect(leftovers.filter(name => existsSync(path.join(dir, name)))).toEqual([])
    expect(kept.filter(name => existsSync(path.join(dir, name)))).toEqual(kept)
  })

  it('rejects a .ts config importing a package that is not installed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = configFile(
      'atscript.config.ts',
      "import plugin from 'atscript-package-not-installed'\nexport default { plugins: [plugin()] }\n"
    )
    const error = await loadConfig(file).catch((error_: unknown) => error_)
    expect(error).toBeInstanceOf(Error)
    expect(String(((error as Error).cause as Error | undefined)?.message)).toContain(
      'atscript-package-not-installed'
    )
  })
})
