import { Controller, Description, InjectMoostLogger, Optional, TConsoleBase } from 'moost'
import { Cli, CliOption, CliExample } from '@moostjs/event-cli'
import path from 'path'
import {
  build,
  loadConfig,
  resolveConfigFile,
  TAnscriptConfig,
  TAnscriptConfigOutput,
} from '@ts-anscript/core'
import { existsSync } from 'fs'
import { tsPlugin } from '../plugin'

@Controller()
export class Commands {
  constructor(@InjectMoostLogger('asc') private readonly logger: TConsoleBase) {}

  @Cli('')
  @Description('Builds .as files using --config and --format')
  @CliExample('-c anscript.config.js', 'Build .as files using anscript.config.js')
  @CliExample('-f dts', 'Build "d.ts" files for ".as" files')
  async default(
    @CliOption('c', 'config')
    @Optional()
    @Description('Path to config file')
    configFile?: string,

    @CliOption('f', 'format')
    @Optional()
    @Description('Output format (js|dts), default: "dts"')
    format?: string
  ) {
    const config = await this.getConfig(configFile)
    if (format) {
      config.format = format
    }
    this.logger.log(`Format: ${__DYE_CYAN__}${config.format}${__DYE_COLOR_OFF__}`)
    const builder = await build(config)
    const out = await builder.write(config as TAnscriptConfigOutput)
    for (const { target } of out) {
      this.logger.log(`✅ created ${__DYE_GREEN__}${target}${__DYE_COLOR_OFF__}`)
    }
  }

  async getConfig(configFile?: string): Promise<TAnscriptConfig> {
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
      this.logger.log(`No anscript config file found`)
      return {
        format: 'dts',
        plugins: [tsPlugin()],
      }
    }
  }
}
