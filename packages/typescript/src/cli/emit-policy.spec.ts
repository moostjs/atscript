import { describe, expect, it } from 'vitest'

import { NOTHING_EMITTED_MESSAGE, shouldEmit } from './emit-policy'

describe('shouldEmit', () => {
  const cases: Array<{
    title: string
    input: { noEmit?: boolean; skipDiag?: boolean; errorCount: number }
    expected: boolean
  }> = [
    { title: 'clean build emits', input: { errorCount: 0 }, expected: true },
    { title: 'errors block the emit', input: { errorCount: 2 }, expected: false },
    {
      title: '--skipDiag emits even with a stale error count',
      input: { skipDiag: true, errorCount: 3 },
      expected: true,
    },
    {
      title: '--noEmit never emits, even on a clean build',
      input: { noEmit: true, errorCount: 0 },
      expected: false,
    },
    {
      title: '--noEmit never emits, even with errors',
      input: { noEmit: true, errorCount: 5 },
      expected: false,
    },
    {
      title: '--noEmit wins over --skipDiag',
      input: { noEmit: true, skipDiag: true, errorCount: 0 },
      expected: false,
    },
    {
      title: 'warnings alone do not block (they are not counted as errors)',
      input: { errorCount: 0, skipDiag: false },
      expected: true,
    },
  ]

  for (const { title, input, expected } of cases) {
    it(title, () => {
      expect(shouldEmit(input)).toBe(expected)
    })
  }

  it('exposes the message shown when the emit was blocked', () => {
    expect(NOTHING_EMITTED_MESSAGE).toBe(
      'Nothing emitted — previous outputs were left untouched. ' +
        'Fix the errors above, or pass --skipDiag to emit anyway.'
    )
  })
})
