import {
  isAnnotatedType,
  type TValidatorOptions,
  type TAtscriptAnnotatedType,
  type Validator,
} from '@atscript/typescript/utils'
import { definePipeFn, Pipe, TPipePriority } from 'moost'

/**
 * **validatorPipe** ─ Creates a Moost *pipe* that runs atscript validation on
 * handler parameters (body, params, query, etc.).
 *
 * The pipe inspects the runtime metadata supplied by Moost; when the target
 * parameter type is an atscript‑annotated class or interface it calls
 * `type.validator(opts).validate(value)` to perform synchronous validation.
 *
 * The pipe is registered at {@link TPipePriority.VALIDATE}, ensuring it fires
 * before any transformation pipes and long before business logic executes.
 *
 * @param opts {@link TValidatorOptions}.
 * @returns A ready‑to‑use `PipeFn` instance.
 *
 * @example
 * ```ts
 * // for method:
 * ‎@Post()
 * ‎@Pipe(validatorPipe())
 * async create(@Body() dto: CreateUserDto) {}
 *
 * // or globally:
 * const app = new Moost();
 * app.applyGlobalPipes(validatorPipe());
 * ```
 */
export const validatorPipe = (opts?: Partial<TValidatorOptions>) => {
  // One Validator per type for this pipe's options. `validate()` is synchronous and
  // resets all per-call state (a fresh `errors` array each call), so a cached instance
  // is safe to reuse across requests.
  const validators = new WeakMap<TAtscriptAnnotatedType, Validator>()
  return definePipeFn<any>((value, metas) => {
    if (metas?.targetMeta?.optional && (value === undefined || value === null)) {
      return value
    }
    const type = metas?.targetMeta?.type
    if (isAnnotatedType(type) && typeof type.validator === 'function') {
      let validator = validators.get(type)
      if (!validator) {
        validator = type.validator(opts)
        validators.set(type, validator)
      }
      validator.validate(value)
    }
    return value
  }, TPipePriority.VALIDATE)
}

/**
 * Syntactic sugar decorator that applies {@link validatorPipe} to a handler or
 * an entire controller class.
 *
 * @param opts {@link TValidatorOptions}.
 *
 * @example
 * ```ts
 * // for method:
 * ‎@Post()
 * ‎@UseValidatorPipe()
 * async create(@Body() dto: CreateUserDto) {}
 * ```
 */
export const UseValidatorPipe = (opts?: Partial<TValidatorOptions>) => Pipe(validatorPipe(opts))
