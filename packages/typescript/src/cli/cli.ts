import { CliApp } from '@moostjs/event-cli'

import { Commands } from './commands.controller'
import { DbSyncController } from './db-sync.controller'

new CliApp()
  .controllers(Commands, DbSyncController)
  .useHelp({ name: 'asc' })
  .useOptions([{ keys: ['help'], description: 'Display instructions for the command.' }])
  .start()
