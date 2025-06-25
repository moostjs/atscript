import {
  isAnnotatedType,
  type TValidatorOptions,
  type TAtscriptAnnotatedType,
} from '@atscript/typescript'
import { definePipeFn, Pipe, TPipePriority } from 'moost'

export const validatorPipe = (opts?: Partial<TValidatorOptions>) =>
  definePipeFn<any>((value, metas, level) => {
    if (
      isAnnotatedType(metas?.targetMeta?.type) &&
      typeof metas.targetMeta.type.validator === 'function'
    ) {
      const validator = (metas.targetMeta.type as TAtscriptAnnotatedType).validator(opts)
      validator.validate(value)
    }
    return value
  }, TPipePriority.VALIDATE)

export const UseValidatorPipe = (opts?: Partial<TValidatorOptions>) => Pipe(validatorPipe(opts))
