import type { TDbFieldMeta, TExistingColumn, TColumnDiff } from './types'

/**
 * Computes the difference between desired schema fields and existing database columns.
 *
 * @param desired - Field descriptors from the Atscript type (after flattening).
 * @param existing - Columns currently in the database (from introspection).
 * @param typeMapper - Optional function to map Atscript design types to DB-native type strings
 *                     (e.g., `sqliteTypeFromDesignType`). Required for type change detection.
 */
export function computeColumnDiff(
  desired: readonly TDbFieldMeta[],
  existing: TExistingColumn[],
  typeMapper?: (designType: string) => string
): TColumnDiff {
  const existingByName = new Map(existing.map(c => [c.name, c]))
  const desiredByName = new Map<string, TDbFieldMeta>()

  const added: TDbFieldMeta[] = []
  const typeChanged: TColumnDiff['typeChanged'] = []

  for (const field of desired) {
    if (field.ignored) { continue }
    desiredByName.set(field.physicalName, field)

    const existingCol = existingByName.get(field.physicalName)
    if (!existingCol) {
      added.push(field)
    } else if (typeMapper) {
      const expectedType = typeMapper(field.designType)
      if (expectedType.toUpperCase() !== existingCol.type.toUpperCase()) {
        typeChanged.push({ field, existingType: existingCol.type })
      }
    }
  }

  const removed: TExistingColumn[] = existing.filter(
    c => !desiredByName.has(c.name)
  )

  return { added, removed, typeChanged }
}
