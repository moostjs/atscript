import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { build } from '../build'
import { fileUriToPath } from '../parser/utils'
import { loadConfig, resolveConfigFile } from './load-config'

const dirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** A new temporary directory, named `prefix` and a random suffix (removed after the test). */
function tmpDir(prefix = 'atscript-config-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

/** A directory holding the config file `name` with `content`: the file's path. */
function configFile(name: string, content: string): string {
  const file = path.join(tmpDir(), name)
  writeFileSync(file, content)
  return file
}

const CONFIG_NAMES = [
  'atscript.config.js',
  'atscript.config.mjs',
  'atscript.config.cjs',
  'atscript.config.ts',
]

const isCjs = (name: string) => name.endsWith('.cjs')

/** The source of config file `name` exporting `config`. */
function configSource(name: string, config: Record<string, unknown>): string {
  return `${isCjs(name) ? 'module.exports =' : 'export default'} ${JSON.stringify(config)}\n`
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
    await expect(loadConfig(file)).resolves.toEqual({ format: 'dts', rootDir: path.dirname(file) })
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

  it('removes the bundled copies a process that is gone left in node_modules and beside the config, only those', async () => {
    const file = configFile('atscript.config.ts', "export default { format: 'dts' }\n")
    const dir = path.dirname(file)
    const temp = path.join(dir, 'node_modules', '.atscript-temp')
    mkdirSync(temp, { recursive: true })
    const gone = spawnSync(process.execPath, ['-e', '']).pid
    expect(() => process.kill(gone, 0)).toThrow()
    const leftovers = [
      path.join(temp, `atscript.config.Ab-1_c.${gone}.0.mjs`),
      // (beside the config: left by a version before 0.2.22)
      path.join(dir, `atscript.config.Xy2.${gone}.3.cjs`),
    ]
    const kept = [
      `atscript.config.Ab-1_c.${process.pid}.999.mjs`,
      'atscript.config.mts',
      'atscript.config.Ab-1_c.mjs',
      `other.config.Ab.${gone}.0.mjs`,
    ].map(name => path.join(dir, name))
    for (const name of [...leftovers, ...kept]) {
      writeFileSync(name, 'export default {}\n')
    }

    await expect(loadConfig(file)).resolves.toEqual({ format: 'dts', rootDir: dir })

    expect(leftovers.filter(name => existsSync(name))).toEqual([])
    expect(kept.filter(name => existsSync(name))).toEqual(kept)
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

  describe('rootDir: relative to the config file, whatever the working directory', () => {
    for (const name of CONFIG_NAMES) {
      it(`of a ${path.extname(name)} config: a relative one, a missing one, an absolute one`, async () => {
        const dir = tmpDir()
        const file = path.join(dir, name)
        const write = (rootDir?: string) => {
          writeFileSync(file, configSource(name, rootDir ? { rootDir } : {}))
        }
        // (the working directory is not the config's)
        expect(process.cwd()).not.toBe(dir)

        write('src')
        await expect(loadConfig(file)).resolves.toMatchObject({ rootDir: path.join(dir, 'src') })
        write('../models')
        await expect(loadConfig(file)).resolves.toMatchObject({
          rootDir: path.resolve(dir, '../models'),
        })
        write()
        await expect(loadConfig(file)).resolves.toMatchObject({ rootDir: dir })
        write('/abs/root')
        await expect(loadConfig(file)).resolves.toMatchObject({ rootDir: '/abs/root' })
      })
    }

    it('a config given by a relative path: resolved against its own directory', async () => {
      const dir = tmpDir()
      writeFileSync(path.join(dir, 'atscript.config.mjs'), "export default { rootDir: 'src' }\n")

      const config = await loadConfig(
        path.relative(process.cwd(), path.join(dir, 'atscript.config.mjs'))
      )

      expect(config.rootDir).toBe(path.join(dir, 'src'))
    })

    it('build() of a loaded config builds the config’s rootDir (not the working directory)', async () => {
      const dir = tmpDir()
      mkdirSync(path.join(dir, 'src'))
      mkdirSync(path.join(dir, 'sub'))
      writeFileSync(path.join(dir, 'src', 'a.as'), 'export interface A {\n  id: string\n}\n')
      writeFileSync(path.join(dir, 'sub', 'b.as'), 'export interface B {\n  id: string\n}\n')
      const file = path.join(dir, 'atscript.config.mjs')
      // (the working directory a subfolder of the config's)
      vi.spyOn(process, 'cwd').mockReturnValue(path.join(dir, 'sub'))
      const built = async () => {
        const repo = await build(await loadConfig(file))
        const diagnostics = await repo.diagnostics()
        return [...diagnostics.keys()].map(id => path.relative(dir, fileUriToPath(id))).sort()
      }

      writeFileSync(file, "export default { rootDir: 'src' }\n")
      expect(await built()).toEqual([path.join('src', 'a.as')])
      writeFileSync(file, 'export default {}\n')
      expect(await built()).toEqual([path.join('src', 'a.as'), path.join('sub', 'b.as')])
    })
  })

  describe('a fresh load each time, whatever the format', () => {
    for (const name of CONFIG_NAMES) {
      it(`an edited ${path.extname(name)} config`, async () => {
        const dir = tmpDir()
        const file = path.join(dir, name)

        writeFileSync(file, configSource(name, { unknownAnnotation: 'error' }))
        await expect(loadConfig(file)).resolves.toMatchObject({ unknownAnnotation: 'error' })
        writeFileSync(file, configSource(name, { unknownAnnotation: 'warn' }))
        await expect(loadConfig(file)).resolves.toMatchObject({ unknownAnnotation: 'warn' })
        expect(readdirSync(dir)).toEqual([name])
      })

      it(`a ${path.extname(name)} config that failed loads once fixed`, async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const dir = tmpDir()
        const file = path.join(dir, name)
        writeFileSync(file, "throw new Error('config failed')\n")
        const error = await loadConfig(file).catch((error_: unknown) => error_)
        expect(((error as Error).cause as Error | undefined)?.message).toBe('config failed')

        writeFileSync(file, configSource(name, { unknownAnnotation: 'warn' }))

        await expect(loadConfig(file)).resolves.toEqual({ unknownAnnotation: 'warn', rootDir: dir })
      })
    }

    it('a .cjs config requiring a package and a local module', async () => {
      const dir = tmpDir()
      writeFileSync(path.join(dir, 'level.cjs'), "module.exports = 'warn'\n")
      writeFileSync(
        path.join(dir, 'atscript.config.cjs'),
        "const path = require('node:path')\nmodule.exports = { unknownAnnotation: require('./level.cjs'), rootDir: path.join('a', 'b') }\n"
      )

      await expect(loadConfig(path.join(dir, 'atscript.config.cjs'))).resolves.toEqual({
        unknownAnnotation: 'warn',
        rootDir: path.join(dir, 'a', 'b'),
      })
    })

    it('a .ts config: the local module it imports is read again too', async () => {
      const dir = tmpDir()
      const file = path.join(dir, 'atscript.config.ts')
      writeFileSync(
        file,
        "import { level } from './options'\nexport default { unknownAnnotation: level }\n"
      )
      const writeLocal = (level: string) => {
        writeFileSync(path.join(dir, 'options.ts'), `export const level = '${level}'\n`)
      }

      writeLocal('error')
      await expect(loadConfig(file)).resolves.toMatchObject({ unknownAnnotation: 'error' })
      writeLocal('warn')
      await expect(loadConfig(file)).resolves.toMatchObject({ unknownAnnotation: 'warn' })
    })

    it('leaves nothing beside a .ts config: a module it imports with import() is inlined', async () => {
      const dir = tmpDir()
      writeFileSync(path.join(dir, 'models.mjs'), 'export const models = ["M"]\n')
      const file = path.join(dir, 'atscript.config.ts')
      writeFileSync(
        file,
        "export default { models: () => import('./models.mjs').then(m => m.models) }\n"
      )

      const config = await loadConfig(file)

      expect(await config.models?.()).toEqual(['M'])
      expect(readdirSync(dir).sort()).toEqual(['atscript.config.ts', 'models.mjs'])
    })

    it('bundles a .ts config into the nearest node_modules: packages resolve, nothing beside it', async () => {
      const dir = tmpDir()
      const pkg = path.join(dir, 'node_modules', 'atscript-test-pkg')
      mkdirSync(pkg, { recursive: true })
      writeFileSync(path.join(pkg, 'package.json'), '{ "type": "module", "main": "index.js" }\n')
      writeFileSync(path.join(pkg, 'index.js'), "export const format = 'dts'\n")
      const file = path.join(dir, 'atscript.config.ts')
      // (the folders as the config sees them while it is evaluated)
      writeFileSync(
        file,
        "import { readdirSync } from 'node:fs'\nimport { format } from 'atscript-test-pkg'\n" +
          'const copies = readdirSync(import.meta.dirname + "/node_modules/.atscript-temp")\n' +
          'export default { format, copies, beside: readdirSync(import.meta.dirname).sort() }\n'
      )

      await expect(loadConfig(file)).resolves.toEqual({
        format: 'dts',
        copies: [expect.stringMatching(/^atscript\.config\..+\.mjs$/u)],
        beside: ['atscript.config.ts', 'node_modules'],
        rootDir: dir,
      })

      expect(readdirSync(path.join(dir, 'node_modules', '.atscript-temp'))).toEqual([])
    })

    for (const name of ['atscript.config.js', 'atscript.config.mjs', 'atscript.config.cjs']) {
      it(`a ${path.extname(name)} config importing a file that does not exist yet (lazily) loads`, async () => {
        const dir = tmpDir()
        const file = path.join(dir, name)
        writeFileSync(
          file,
          `${isCjs(name) ? 'module.exports =' : 'export default'} { unknownAnnotation: 'warn', models: () => import('./dist/models.mjs') }\n`
        )

        const config = await loadConfig(file)

        expect(config.unknownAnnotation).toBe('warn')
        await expect(config.models?.()).rejects.toThrow()
        expect(readdirSync(dir)).toEqual([name])
      })
    }
  })
})

describe('resolveConfigFile', () => {
  it('a document URI percent-encoded (a space in a folder name): the config file’s path', async () => {
    const dir = tmpDir('atscript config space-')
    mkdirSync(path.join(dir, 'sub'))
    writeFileSync(path.join(dir, 'atscript.config.mjs'), 'export default {}\n')
    const uri = pathToFileURL(path.join(dir, 'sub', 'a.as')).toString()
    expect(uri).toContain('%20')

    await expect(resolveConfigFile(uri)).resolves.toBe(path.join(dir, 'atscript.config.mjs'))
    await expect(resolveConfigFile(uri, dir)).resolves.toBe(path.join(dir, 'atscript.config.mjs'))
    await expect(resolveConfigFile(path.join(dir, 'sub'))).resolves.toBe(
      path.join(dir, 'atscript.config.mjs')
    )
  })

  it('none above a document: undefined, walking up to the filesystem root without an error', async () => {
    const dir = tmpDir()
    const uri = pathToFileURL(path.join(dir, 'missing folder', 'a.as')).toString()

    await expect(resolveConfigFile(uri)).resolves.toBeUndefined()
    await expect(resolveConfigFile(path.join(dir, 'missing folder'))).resolves.toBeUndefined()
  })

  it('stops at the root folder (checked too)', async () => {
    const dir = tmpDir()
    mkdirSync(path.join(dir, 'app', 'sub'), { recursive: true })
    writeFileSync(path.join(dir, 'atscript.config.mjs'), 'export default {}\n')
    const uri = pathToFileURL(path.join(dir, 'app', 'sub', 'a.as')).toString()

    await expect(resolveConfigFile(uri, path.join(dir, 'app'))).resolves.toBeUndefined()
    await expect(resolveConfigFile(uri, dir)).resolves.toBe(path.join(dir, 'atscript.config.mjs'))
  })
})
