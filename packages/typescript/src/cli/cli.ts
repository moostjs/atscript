import { CliApp } from '@moostjs/event-cli'
import { Commands } from './commands.controller'

new CliApp()
  .controllers(Commands)
  .useHelp({ name: 'asc' })
  .useOptions([{ keys: ['help'], description: 'Display instructions for the command.' }])
  .start()
