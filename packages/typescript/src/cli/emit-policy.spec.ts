import { describe, expect, it } from 'vitest'

import type { TEmitDecision, TEmitPolicyInput } from './emit-policy'
import { NOTHING_EMITTED_MESSAGE, emitDecision } from './emit-policy'

describe('emitDecision', () => {
  const cases: Array<{ title: string; input: TEmitPolicyInput; expected: TEmitDecision }> = [
    { title: 'clean build emits', input: { errorCount: 0 }, expected: 'emit' },
    { title: 'errors block the emit', input: { errorCount: 2 }, expected: 'blocked' },
    {
      title: '--skipDiag emits even with a stale error count',
      input: { skipDiag: true, errorCount: 3 },
      expected: 'emit',
    },
    {
      title: '--noEmit never emits, even on a clean build',
      input: { noEmit: true, errorCount: 0 },
      expected: 'noEmit',
    },
    {
      title: '--noEmit never emits, even with errors',
      input: { noEmit: true, errorCount: 5 },
      expected: 'noEmit',
    },
    {
      title: '--noEmit wins over --skipDiag',
      input: { noEmit: true, skipDiag: true, errorCount: 0 },
      expected: 'noEmit',
    },
    {
      title: 'warnings alone do not block (they are not counted as errors)',
      input: { errorCount: 0, skipDiag: false },
      expected: 'emit',
    },
  ]

  for (const { title, input, expected } of cases) {
    it(title, () => {
      expect(emitDecision(input)).toBe(expected)
    })
  }

  it("the 'blocked' message names the opt-out that turns 'blocked' into 'emit'", () => {
    expect(NOTHING_EMITTED_MESSAGE).toContain('--skipDiag')
    expect(emitDecision({ skipDiag: true, errorCount: 1 })).toBe('emit')
  })
})
