import { describe, expect, it, vi } from 'vitest'

import { validatorPipe } from './as-validator.pipe'

function makeAnnotatedType(validate: (value: unknown) => void) {
  const validator = { validate }
  return {
    __is_atscript_annotated_type: true,
    validator: () => validator,
  }
}

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
})
