import { existsSync } from 'fs'
import path from 'path'

import type { TAtscriptConfig } from '@atscript/core'
import { DEFAULT_FORMAT, loadConfig, resolveConfigFile } from '@atscript/core'

import { tsPlugin } from '../plugin'

/**
 * The config of an `asc` run: the file `configFile` (relative to the working directory), else the
 * nearest `atscript.config.*` walking up from the working directory, else the built-in one. A
 * config file's `rootDir` is absolute, resolved against the file's directory (see `loadConfig`);
 * the built-in config has none (`build()` then builds the working directory).
 */
export async function getConfig(
  configFile: string | undefined,
  logger: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
): Promise<TAtscriptConfig> {
  const root = process.cwd()
  if (configFile) {
    const c = path.resolve(root, configFile)
    if (!existsSync(c)) {
      logger.error(
        `Config file ${__DYE_UNDERSCORE__}${configFile}${__DYE_UNDERSCORE_OFF__} not found`
      )
      process.exit(1)
    }
    logger.log(`Using config file ${__DYE_CYAN__}${configFile}${__DYE_COLOR_OFF__}`)
    return loadConfig(c)
  } else {
    const resolved = await resolveConfigFile(root)
    if (resolved) {
      logger.log(`Using config file ${__DYE_CYAN__}${resolved}${__DYE_COLOR_OFF__}`)
      return loadConfig(resolved)
    }
    logger.log(`No atscript config file found`)
    return {
      format: DEFAULT_FORMAT,
      plugins: [tsPlugin()],
    }
  }
}
