import type { TAtscriptAnnotatedType, TAtscriptTypeArray } from '@atscript/typescript/utils'

import type { AtscriptDbTable } from './db-table'
import { getKeyProps } from './patch-types'

/**
 * Decomposes a patch payload into a flat update object for adapters
 * that don't support native patch operations.
 *
 * Handles:
 * - Top-level array patches (`$replace`, `$insert`, `$upsert`, `$update`, `$remove`)
 * - Merge strategy for nested objects
 * - Simple field sets
 *
 * For adapters with native patch support (e.g., MongoDB aggregation pipelines),
 * use {@link BaseDbAdapter.nativePatch} instead.
 *
 * @param payload - The patch payload from the user.
 * @param table - The AtscriptDbTable instance for metadata access.
 * @returns A flat update object suitable for a basic `updateOne` call.
 */
export function decomposePatch(
  payload: Record<string, unknown>,
  table: AtscriptDbTable
): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  const topLevelArrayTag = 'db.__topLevelArray'

  flattenPatchPayload(payload, '', update, table, topLevelArrayTag)

  return update
}

function flattenPatchPayload(
  payload: Record<string, unknown>,
  prefix: string,
  update: Record<string, unknown>,
  table: AtscriptDbTable,
  topLevelArrayTag: string
): void {
  for (const [_key, value] of Object.entries(payload)) {
    const key = prefix ? `${prefix}.${_key}` : _key

    // Skip primary key fields in updates
    if (table.primaryKeys.includes(key)) {
      continue
    }

    const flatType = table.flatMap.get(key)
    const isTopLevelArray = flatType?.metadata?.get(topLevelArrayTag) as boolean | undefined

    if (typeof value === 'object' && value !== null && isTopLevelArray) {
      // Top-level array with patch operators
      decomposeArrayPatch(key, value as Record<string, unknown>, flatType!, update, table)
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      flatType?.metadata?.get('db.patch.strategy') === 'merge'
    ) {
      // Merge strategy: recursively flatten
      flattenPatchPayload(value as Record<string, unknown>, key, update, table, topLevelArrayTag)
    } else {
      // Simple field set
      update[key] = value
    }
  }
}

/**
 * Decomposes array patch operators into simple field updates.
 *
 * For adapters without native array operations, this does a best-effort
 * decomposition:
 * - `$replace` → direct set
 * - `$insert` → value to append (adapter must handle)
 * - `$upsert` → value to upsert by key (adapter must handle)
 * - `$update` → value to update by key (adapter must handle)
 * - `$remove` → value to remove by key (adapter must handle)
 *
 * Note: For full correctness with `$insert`/`$upsert`/`$update`/`$remove`,
 * the adapter should implement native patch support. This generic decomposition
 * handles `$replace` directly and stores the other operations in a structured
 * format the adapter can interpret.
 */
function decomposeArrayPatch(
  key: string,
  value: Record<string, unknown>,
  fieldType: TAtscriptAnnotatedType,
  update: Record<string, unknown>,
  table: AtscriptDbTable
): void {
  const keyProps =
    fieldType.type.kind === 'array'
      ? getKeyProps(fieldType as TAtscriptAnnotatedType<TAtscriptTypeArray>)
      : new Set<string>()

  // $replace takes precedence — full array replacement
  if (value.$replace !== undefined) {
    update[key] = value.$replace
    return
  }

  // For other operations, store them in a structured format
  // that the adapter's updateOne can interpret.
  // Adapters without native patch support get a simplified view.
  if (value.$insert !== undefined) {
    // Best-effort: store as a concat instruction
    update[`${key}.__$insert`] = value.$insert
  }
  if (value.$upsert !== undefined) {
    update[`${key}.__$upsert`] = value.$upsert
    if (keyProps.size > 0) {
      update[`${key}.__$keys`] = [...keyProps]
    }
  }
  if (value.$update !== undefined) {
    update[`${key}.__$update`] = value.$update
    if (keyProps.size > 0) {
      update[`${key}.__$keys`] = [...keyProps]
    }
  }
  if (value.$remove !== undefined) {
    update[`${key}.__$remove`] = value.$remove
    if (keyProps.size > 0) {
      update[`${key}.__$keys`] = [...keyProps]
    }
  }
}
