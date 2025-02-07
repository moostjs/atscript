import { TAtscriptPlugin } from '@atscript/core'
import { primitives } from './primitives'
import { annotations } from './annotations'

export const MongoPlugin: () => TAtscriptPlugin = () => {
  //
  return {
    name: 'mongo',

    config() {
      return {
        primitives,
        annotations,
      }
    },
  }
}
