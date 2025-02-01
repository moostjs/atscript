import { Moost } from 'moost'
import { MoostCli, cliHelpInterceptor } from '@moostjs/event-cli'
import { Commands } from './commands.controller'

const app = new Moost()
const cli = new MoostCli({
  debug: false,
  wooksCli: {
    cliHelp: { name: 'asc' },
  },
  globalCliOptions: [{ keys: ['help'], description: 'Display instructions for the command.' }],
})
app.adapter(cli)
app.registerControllers(Commands)
app.applyGlobalInterceptors(
  cliHelpInterceptor({
    colors: true,
    lookupLevel: 3,
  })
)

app.init()
