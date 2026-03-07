import type { TAtscriptConfigOutput } from '@atscript/core'
import { build, DEFAULT_FORMAT } from '@atscript/core'
import { Cli, CliOption, CliExample } from '@moostjs/event-cli'
import type { TConsoleBase } from 'moost'
import { Controller, Description, InjectMoostLogger, Optional } from 'moost'

import { getConfig } from './config'

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
    const config = await getConfig(configFile, this.logger)
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
}
