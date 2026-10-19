import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptAnnotatedType, TAtscriptTypeObject } from './runtime/annotated-type'
import { prepareFixtures } from './test-utils'

const rootDir = path.join(__dirname, '..', 'test', 'fixtures')

let StringLiterals: TAtscriptAnnotatedType

const meta = (name: string, key: string): unknown =>
  (
    (StringLiterals.type as TAtscriptTypeObject<string>).props.get(name)!.metadata as Map<
      string,
      unknown
    >
  ).get(key)

beforeAll(async () => {
  await prepareFixtures({ rootDir, entries: ['string-literals.as'] })
  ;({ StringLiterals } = await import(path.join(rootDir, 'string-literals.as.js')))
})

// String literals are raw: backslashes survive codegen verbatim (no escape decoding).
describe('string literal codegen round-trip', () => {
  it('a trailing escaped backslash ends the string', () => {
    expect(meta('quoted', 'meta.label')).toBe('a\\\\')
    expect(meta('quoted', 'meta.description')).toBe('b\\\\')
  })

  it('keeps escaped quotes raw across multiple args', () => {
    expect(meta('quoted', 'expect.pattern')).toEqual([
      { pattern: '^[^\\"]+$', flags: 'u', message: 'no \\"quotes\\"' },
    ])
    expect(meta('raw', 'expect.pattern')).toEqual([
      { pattern: '^\\S+\\\\$', flags: '', message: "it\\'s raw" },
    ])
  })

  it('an odd backslash run escapes the quote', () => {
    expect(meta('odd', 'meta.label')).toBe('a\\\\\\"b')
  })

  it('literal type value is raw', () => {
    const lit = (StringLiterals.type as TAtscriptTypeObject<string>).props.get('lit')!
    expect((lit.type as { value?: unknown }).value).toBe('x\\\\')
  })
})
