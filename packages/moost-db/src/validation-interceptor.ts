import { ValidatorError } from '@atscript/typescript/utils'
import { HttpError } from '@moostjs/event-http'
import { defineInterceptor, Intercept, TInterceptorPriority } from 'moost'

function transformValidationError(error: unknown, reply: (response: unknown) => void) {
  if (error instanceof ValidatorError) {
    reply(
      new HttpError(400, {
        message: error.message,
        statusCode: 400,
        errors: error.errors,
      })
    )
  }
}

export const validationErrorTransform = () =>
  defineInterceptor(
    {
      error: transformValidationError,
    },
    TInterceptorPriority.CATCH_ERROR
  )

export const UseValidationErrorTransform = () => Intercept(validationErrorTransform())
