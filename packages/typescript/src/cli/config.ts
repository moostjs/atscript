import { existsSync } from 'fs'
import path from 'path'

import type { TAtscriptConfig } from '@atscript/core'
import { DEFAULT_FORMAT, loadConfig, resolveConfigFile } from '@atscript/core'

import { tsPlugin } from '../plugin'

export async function getConfig(
  configFile: string | undefined,
  logger: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): Promise<TAtscriptConfig> {
  const root = process.cwd()
  if (configFile) {
    const c = path.join(root, configFile)
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
