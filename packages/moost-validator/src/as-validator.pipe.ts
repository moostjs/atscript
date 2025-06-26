import {
  isAnnotatedType,
  type TValidatorOptions,
  type TAtscriptAnnotatedType,
} from '@atscript/typescript'
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
