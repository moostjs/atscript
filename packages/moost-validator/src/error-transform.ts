import { defineInterceptorFn, Intercept, TInterceptorPriority } from 'moost'
import { HttpError } from '@moostjs/event-http'
import { ValidatorError } from '@atscript/typescript/utils'

/**
 * **validationErrorTransform** ─ Moost interceptor that catches
 * {@link ValidatorError}s thrown by {@link validatorPipe} (or manually) and
 * converts them into a structured `HttpError(400)`
 *
 * Applied at {@link TInterceptorPriority.CATCH_ERROR}
 *
 * @example
 * ```ts
 * // apply globally
 * const app = new Moost();
 * app.applyGlobalInterceptors(validationErrorTransform());
 * ```
 */
export const validationErrorTransform = () =>
  defineInterceptorFn((before, after, onError) => {
    after(transformValidationError)
    onError(transformValidationError)
  }, TInterceptorPriority.CATCH_ERROR)

/**
 * Internal helper that performs the actual conversion: wraps a
 * `ValidatorError` into {@link HttpError} and passes it to Moost's `reply`.
 */
function transformValidationError(error: any, reply: (response: any) => void) {
  if (error instanceof ValidatorError) {
    reply(
      new HttpError(400, {
        message: error.message,
        statusCode: 400,
        _body: error.errors,
      })
    )
  }
}

/**
 * Decorator that registers {@link validationErrorTransform} on a controller or
 * route handler.
 *
 * @example
 * ```ts
 * // for method:
 * ‎@Post()
 * ‎@UseValidationErrorTransform()
 */
export const UseValidationErrorTransform = () => Intercept(validationErrorTransform())
