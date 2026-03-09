import type { TValidatorPlugin } from '@atscript/typescript/utils'

export interface DbValidationContext {
  mode: 'insert' | 'replace' | 'patch'
}

/**
 * Validator plugin for database operations.
 *
 * Handles navigation field constraints and delegates to the standard validator
 * for type checking. The annotated type tree already includes nav fields with
 * their full target types — this plugin controls WHEN recursion is allowed
 * based on the operation mode (insert/replace/patch).
 *
 * Replaces the old `navFieldsValidatorPlugin` (which blindly skipped all nav
 * fields) and `_checkNavProps()` (which validated constraints separately).
 */
export function createDbValidatorPlugin(): TValidatorPlugin {
  return (ctx, def, value) => {
    const dbCtx = ctx.context as DbValidationContext | undefined
    if (!dbCtx) { return undefined }

    // ── Nav field handling ──────────────────────────────────────────────────
    const isTo = def.metadata.has('db.rel.to')
    const isFrom = def.metadata.has('db.rel.from')
    const isVia = def.metadata.has('db.rel.via')

    if (isTo || isFrom || isVia) {
      // Extract field name from the current validation path
      const pathParts = ctx.path.split('.')
      const fieldName = pathParts[pathParts.length - 1] || ctx.path

      // Null nav prop is always an error
      if (value === null) {
        ctx.error(`Cannot process null navigation property '${fieldName}'`)
        return false
      }

      // Absent nav prop is always OK (nav fields are optional)
      if (value === undefined) {
        return true
      }

      // Patch mode: only TO relations allowed
      if (dbCtx.mode === 'patch') {
        if (isFrom) {
          ctx.error(`Cannot patch relation '${fieldName}' — patching 1:N relations not supported. Use replaceOne.`)
          return false
        }
        if (isVia) {
          ctx.error(`Cannot patch relation '${fieldName}' — patching M:N relations not supported. Use replaceOne.`)
          return false
        }
        // TO in patch: fall through → validates nested data with deep partial
      }

      // VIA items can be references (ID only) or new objects — skip validation
      if (isVia) {
        return true
      }

      // TO and FROM with present nav data: fall through → validator
      // recurses into the nav field's target type naturally
      return undefined
    }

    // ── All other fields: fallthrough to default validation ─────────────────
    return undefined
  }
}
