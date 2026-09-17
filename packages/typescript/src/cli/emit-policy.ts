export interface TEmitPolicyInput {
  /** `--noEmit` — run diagnostics only, never write. */
  noEmit?: boolean
  /** `--skipDiag` — diagnostics were not run, emit unconditionally. */
  skipDiag?: boolean
  /** Number of error-severity diagnostics found (0 when diagnostics were skipped). */
  errorCount: number
}

/**
 * - `'emit'` — write the outputs.
 * - `'noEmit'` — `--noEmit`: diagnostics only, nothing was ever going to be written.
 * - `'blocked'` — diagnostics found errors, so the previous outputs are left untouched.
 */
export type TEmitDecision = 'emit' | 'noEmit' | 'blocked'

/**
 * Printed when diagnostics found errors and the emit was suppressed, so the
 * user knows the previous outputs are still the last known-good ones.
 */
export const NOTHING_EMITTED_MESSAGE =
  'Nothing emitted — previous outputs were left untouched. Fix the errors above, or pass --skipDiag to emit anyway.'

/**
 * Decides whether `asc` may write its outputs — and, when it may not, why.
 *
 * A failing compile must never replace valid artifacts: half of the outputs
 * would be stale and aggregate manifests produced in `buildEnd` would be
 * regenerated from an incomplete document set. Errors therefore block the
 * write entirely — `--skipDiag` is the explicit opt-out.
 */
export function emitDecision(input: TEmitPolicyInput): TEmitDecision {
  if (input.noEmit) {
    return 'noEmit'
  }
  if (input.skipDiag || input.errorCount === 0) {
    return 'emit'
  }
  return 'blocked'
}
