import { ObjectId } from 'mongodb'
import { TValidatorOptions, Validator } from 'packages/typescript/dist'

const opts: Pick<TValidatorOptions<any>, 'validate'> = {
  validate(def, value) {
    if (this.stackPath.join('.').slice(1) === '_id') {
      if (def.type.tags.has('objectId')) {
        return this.validateAnnotatedType(def, value instanceof ObjectId ? value.toString() : value)
      } else {
        return this.validateAnnotatedType(def, value)
      }
    }
    return this.validateAnnotatedType(def, value)
  },
}

export const validateIdHelper = opts.validate
