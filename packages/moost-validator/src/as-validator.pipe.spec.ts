import { defineAnnotatedType, ValidatorError } from '@atscript/typescript/utils'
import { describe, expect, it, vi } from 'vitest'

import { validatorPipe } from './as-validator.pipe'

function makeAnnotatedType(validate: (value: unknown) => void) {
  const validator = { validate }
  return {
    __is_atscript_annotated_type: true,
    validator: () => validator,
  }
}

const makeType = () =>
  defineAnnotatedType('object').prop(
    'n',
    defineAnnotatedType().designType('number').annotate('expect.max', 5).$type
  ).$type

function callPipe(pipe: ReturnType<typeof validatorPipe>, value: unknown, targetMeta: any) {
  return (pipe as any)(value, { targetMeta }, 'PARAM')
}

describe('validatorPipe', () => {
  it('validates atscript-typed values', () => {
    const validate = vi.fn()
    const type = makeAnnotatedType(validate)
    const pipe = validatorPipe()

    callPipe(pipe, 'hello', { type })

    expect(validate).toHaveBeenCalledWith('hello')
  })

  it('passes non-annotated types through without validation', () => {
    const validate = vi.fn()
    const pipe = validatorPipe()
    const result = callPipe(pipe, 'hello', { type: String })

    expect(validate).not.toHaveBeenCalled()
    expect(result).toBe('hello')
  })

  it('skips validation when optional param is undefined', () => {
    const validate = vi.fn(() => {
      throw new Error('should not run')
    })
    const type = makeAnnotatedType(validate)
    const pipe = validatorPipe()

    const result = callPipe(pipe, undefined, { type, optional: true })

    expect(validate).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('skips validation when optional param is null', () => {
    const validate = vi.fn(() => {
      throw new Error('should not run')
    })
    const type = makeAnnotatedType(validate)
    const pipe = validatorPipe()

    const result = callPipe(pipe, null, { type, optional: true })

    expect(validate).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('still validates optional params when a value IS provided', () => {
    const validate = vi.fn()
    const type = makeAnnotatedType(validate)
    const pipe = validatorPipe()

    callPipe(pipe, 'hello', { type, optional: true })

    expect(validate).toHaveBeenCalledWith('hello')
  })

  it('throws for required params with undefined values (unchanged behavior)', () => {
    const validate = vi.fn(() => {
      throw new Error('required')
    })
    const type = makeAnnotatedType(validate)
    const pipe = validatorPipe()

    expect(() => callPipe(pipe, undefined, { type })).toThrow('required')
  })

  describe('validator reuse', () => {
    it('creates one validator per type and reuses it across calls', () => {
      const type = makeType()
      const factory = vi.spyOn(type, 'validator')
      const pipe = validatorPipe({ unknownProps: 'ignore' })

      callPipe(pipe, { n: 1 }, { type })
      callPipe(pipe, { n: 2, extra: true }, { type })
      callPipe(pipe, { n: 3 }, { type })

      expect(factory).toHaveBeenCalledTimes(1)
      expect(factory).toHaveBeenCalledWith({ unknownProps: 'ignore' })
    })

    it('keeps separate validators per type and per pipe', () => {
      const a = makeType()
      const b = makeType()
      const spyA = vi.spyOn(a, 'validator')
      const spyB = vi.spyOn(b, 'validator')
      const pipe1 = validatorPipe()
      const pipe2 = validatorPipe({ unknownProps: 'ignore' })

      callPipe(pipe1, { n: 1 }, { type: a })
      callPipe(pipe1, { n: 1 }, { type: b })
      callPipe(pipe2, { n: 1, extra: 1 }, { type: a })
      expect(() => callPipe(pipe1, { n: 1, extra: 1 }, { type: a })).toThrow(ValidatorError)

      expect(spyA).toHaveBeenCalledTimes(2)
      expect(spyB).toHaveBeenCalledTimes(1)
    })

    it('reports fresh errors on every call; earlier errors are not overwritten', () => {
      const type = makeType()
      const pipe = validatorPipe()
      const fail = (value: unknown) => {
        try {
          callPipe(pipe, value, { type })
        } catch (error) {
          return error as ValidatorError
        }
        throw new Error('expected a ValidatorError')
      }

      const first = fail({ n: 10 })
      const second = fail({ n: 'x' })
      expect(callPipe(pipe, { n: 1 }, { type })).toEqual({ n: 1 })
      const third = fail({ n: 1, extra: 1 })

      expect(first.errors).toEqual([{ path: 'n', message: 'Expected maximum 5, got 10' }])
      expect(second.errors).toEqual([{ path: 'n', message: 'Expected number, got string' }])
      expect(third.errors).toEqual([{ path: 'extra', message: 'Unexpected property' }])
    })
  })
})
