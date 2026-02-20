import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TValidatorPlugin,
} from '@atscript/typescript/utils'
// oxlint-disable max-depth
import { ObjectId } from 'mongodb'

import { CollectionPatcher } from './collection-patcher'

export const validateMongoIdPlugin: TValidatorPlugin = (ctx, def, value) => {
  if (ctx.path === '_id' && def.type.tags.has('objectId')) {
    return ctx.validateAnnotatedType(def, value instanceof ObjectId ? value.toString() : value)
  }
}

export const validateMongoUniqueArrayItemsPlugin: TValidatorPlugin = (ctx, def, value) => {
  if (def.metadata.has('mongo.array.uniqueItems') && def.type.kind === 'array') {
    if (Array.isArray(value)) {
      const separator = '▼↩'
      const seen = new Set<string>()
      const keyProps = CollectionPatcher.getKeyProps(
        def as TAtscriptAnnotatedType<TAtscriptTypeArray>
      )
      for (const item of value) {
        let key: string = ''
        if (keyProps.size > 0) {
          for (const prop of keyProps) {
            key += JSON.stringify(item[prop]) + separator
          }
        } else {
          key = JSON.stringify(item)
        }
        if (seen.has(key)) {
          ctx.error(`Duplicate items are not allowed`)
          return false
        }
        seen.add(key)
      }
    }
  }
  return undefined
}
