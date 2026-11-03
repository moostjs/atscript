import { defineAnnotatedType, ValidatorError } from '@atscript/typescript/utils'
import { HttpError } from '@moostjs/event-http'
import { describe, expect, it } from 'vitest'

import { validationErrorTransform } from './error-transform'

describe('validationErrorTransform', () => {
  it('replies 400 whose body carries each error with its code and params', () => {
    const type = defineAnnotatedType('object')
      .prop(
        'name',
        defineAnnotatedType().designType('string').annotate('expect.minLength', { length: 3 }).$type
      )
      .prop(
        'age',
        defineAnnotatedType()
          .designType('number')
          .annotate('expect.max', { maxValue: 120, message: 'Too old' }).$type
      ).$type
    let error: unknown
    try {
      type.validator().validate({ name: 'x', age: 200 })
    } catch (error_) {
      error = error_
    }
    expect(error).toBeInstanceOf(ValidatorError)

    let replied: unknown
    validationErrorTransform().error!(
      error as Error,
      (response: unknown) => {
        replied = response
      },
      undefined as never
    )
    expect(replied).toBeInstanceOf(HttpError)
    expect((replied as HttpError).body).toEqual({
      statusCode: 400,
      message: 'name: Expected minimum length of 3 characters, got 1 characters',
      error: 'Bad Request',
      _body: [
        {
          path: 'name',
          message: 'Expected minimum length of 3 characters, got 1 characters',
          code: 'MIN_LENGTH',
          params: { min: 3, actual: 1 },
        },
        {
          path: 'age',
          message: 'Too old',
          code: 'MAX',
          params: { max: 120, actual: 200 },
          custom: true,
        },
      ],
    })
  })

  it('passes other errors and results through', () => {
    let replied = false
    const reply = () => {
      replied = true
    }
    validationErrorTransform().error!(new Error('x'), reply, undefined as never)
    validationErrorTransform().after!({ ok: true }, reply, undefined as never)
    expect(replied).toBe(false)
  })
})
