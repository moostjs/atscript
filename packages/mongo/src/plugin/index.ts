import { TAnscriptPlugin } from '@anscript/core'
import { primitives } from './primitives'
import { annotations } from './annotations'

export const MongoPlugin: () => TAnscriptPlugin = () => {
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
