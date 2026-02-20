import { existsSync } from 'fs'
import path from 'path'

import type { TAtscriptConfig, TAtscriptConfigOutput } from '@atscript/core'
import { build, DEFAULT_FORMAT, loadConfig, resolveConfigFile } from '@atscript/core'
import { Cli, CliOption, CliExample } from '@moostjs/event-cli'
import type { TConsoleBase } from 'moost'
import { Controller, Description, InjectMoostLogger, Optional } from 'moost'

import { tsPlugin } from '../plugin'

@Controller()
export class Commands {
  constructor(@InjectMoostLogger('asc') private readonly logger: TConsoleBase) {}

  @Cli('')
  @Description('Builds .as files using --config and --format')
  @CliExample('-c atscript.config.js', 'Build .as files using atscript.config.js')
  @CliExample('-f dts', 'Build "d.ts" files for ".as" files')
  @CliExample('--noEmit', 'Only check for errors, do not emit files')
  @CliExample('--skipDiag', 'Emit files without running diagnostics')
  async default(
    @CliOption('c', 'config')
    @Optional()
    @Description('Path to config file')
    configFile?: string,

    @CliOption('f', 'format')
    @Optional()
    @Description('Output format (e.g. js, dts). Omit to run all plugins with their default output.')
    format?: string,

    @CliOption('noEmit')
    @Optional()
    @Description('Only run diagnostics without emitting files')
    noEmit?: boolean,

    @CliOption('skipDiag')
    @Optional()
    @Description('Skip diagnostics and always emit files')
    skipDiag?: boolean
  ) {
    const config = await this.getConfig(configFile)
    config.format = format || DEFAULT_FORMAT
    this.logger.log(`Format: ${__DYE_CYAN__}${config.format}${__DYE_COLOR_OFF__}`)
    const builder = await build(config)

    let errorCount = 0
    let warningCount = 0

    if (!skipDiag) {
      const diagMap = await builder.diagnostics()
      for (const [docId, messages] of diagMap) {
        const doc = builder.getDoc(docId)
        for (const m of messages) {
          if (m.severity === 1) {
            errorCount++
          } else if (m.severity === 2) {
            warningCount++
          }
          if (doc) {
            this.logger.log(doc.renderDiagMessage(m, true, true))
          }
        }
      }
    }

    if (!noEmit) {
      const out = await builder.write(config as TAtscriptConfigOutput)
      for (const { target } of out) {
        this.logger.log(`✅ created ${__DYE_GREEN__}${target}${__DYE_COLOR_OFF__}`)
      }
    }

    if (errorCount > 0 || warningCount > 0) {
      const parts = [] as string[]
      if (errorCount > 0) {
        parts.push(
          `${__DYE_RED__}${errorCount} error${errorCount > 1 ? 's' : ''}${__DYE_COLOR_OFF__}`
        )
      }
      if (warningCount > 0) {
        parts.push(
          `${__DYE_YELLOW__}${warningCount} warning${warningCount > 1 ? 's' : ''}${__DYE_COLOR_OFF__}`
        )
      }
      this.logger.log(`\nFound ${parts.join(' and ')}`)
    }

    if (errorCount > 0) {
      process.exit(1)
    }
  }

  async getConfig(configFile?: string): Promise<TAtscriptConfig> {
    const root = process.cwd()
    if (configFile) {
      const c = path.join(root, configFile)
      if (!existsSync(c)) {
        this.logger.error(
          `Config file ${__DYE_UNDERSCORE__}${configFile}${__DYE_UNDERSCORE_OFF__} not found`
        )
        process.exit(1)
      }
      this.logger.log(`Using config file ${__DYE_CYAN__}${configFile}${__DYE_COLOR_OFF__}`)
      return loadConfig(c)
    } else {
      const resolved = await resolveConfigFile(root)
      if (resolved) {
        this.logger.log(`Using config file ${__DYE_CYAN__}${resolved}${__DYE_COLOR_OFF__}`)
        return loadConfig(resolved)
      }
      this.logger.log(`No atscript config file found`)
      return {
        format: DEFAULT_FORMAT,
        plugins: [tsPlugin()],
      }
    }
  }
}
