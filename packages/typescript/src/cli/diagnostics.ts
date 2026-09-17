import type { BuildRepo } from '@atscript/core'

export interface TDiagnosticsSummary {
  errors: number
  warnings: number
  /** Rendered diagnostic lines, in the order the builder reports them. */
  messages: string[]
}

/**
 * Runs the builder's diagnostics and renders every message the way the
 * default `asc` command prints it. Shared by `asc` and `asc db sync` so both
 * commands count and format diagnostics identically.
 */
export async function collectDiagnostics(builder: BuildRepo): Promise<TDiagnosticsSummary> {
  const summary: TDiagnosticsSummary = { errors: 0, warnings: 0, messages: [] }
  const diagMap = await builder.diagnostics()
  for (const [docId, messages] of diagMap) {
    const doc = builder.getDoc(docId)
    for (const m of messages) {
      if (m.severity === 1) {
        summary.errors++
      } else if (m.severity === 2) {
        summary.warnings++
      }
      if (doc) {
        summary.messages.push(doc.renderDiagMessage(m, true, true))
      }
    }
  }
  return summary
}
