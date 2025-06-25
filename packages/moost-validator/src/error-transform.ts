import { defineInterceptorFn, Intercept, TInterceptorPriority } from 'moost'
import { HttpError } from '@moostjs/event-http'
import { ValidatorError } from '@atscript/typescript'

export const validationErrorTransform = defineInterceptorFn((before, after, onError) => {
  after(transformValidationError)
  onError(transformValidationError)
}, TInterceptorPriority.CATCH_ERROR)

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

export const UseValidationErrorTransform = Intercept(validationErrorTransform)
