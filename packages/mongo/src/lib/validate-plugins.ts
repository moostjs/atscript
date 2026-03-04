import type {
  TValidatorPlugin,
} from '@atscript/typescript/utils'
import { ObjectId } from 'mongodb'

export const validateMongoIdPlugin: TValidatorPlugin = (ctx, def, value) => {
  if (ctx.path === '_id' && def.type.tags.has('objectId')) {
    return ctx.validateAnnotatedType(def, value instanceof ObjectId ? value.toString() : value)
  }
}
