import type { AtscriptDbReadable } from './db-readable'
import type { TDbFieldMeta, TDbStorageType } from './types'

interface TFieldSnapshot {
  physicalName: string
  designType: string
  optional: boolean
  isPrimaryKey: boolean
  storage: TDbStorageType
}

interface TIndexSnapshot {
  key: string
  type: string
  fields: Array<{ name: string; sort: string }>
}

interface TForeignKeySnapshot {
  fields: string[]
  targetTable: string
  targetFields: string[]
  onDelete?: string
  onUpdate?: string
}

export interface TTableSnapshot {
  tableName: string
  fields: TFieldSnapshot[]
  indexes: TIndexSnapshot[]
  foreignKeys: TForeignKeySnapshot[]
}

/**
 * Extracts a canonical, serializable snapshot from a readable's metadata.
 * Sorted deterministically so the hash is stable across runs.
 */
export function computeTableSnapshot(readable: AtscriptDbReadable): TTableSnapshot {
  const fields: TFieldSnapshot[] = readable.fieldDescriptors
    .filter((f: TDbFieldMeta) => !f.ignored)
    .map((f: TDbFieldMeta) => ({
      physicalName: f.physicalName,
      designType: f.designType,
      optional: f.optional,
      isPrimaryKey: f.isPrimaryKey,
      storage: f.storage,
    }))
    .sort((a, b) => a.physicalName.localeCompare(b.physicalName))

  const indexes: TIndexSnapshot[] = [...readable.indexes.values()]
    .map(idx => ({
      key: idx.key,
      type: idx.type,
      fields: idx.fields.map(f => ({ name: f.name, sort: f.sort })),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))

  const foreignKeys: TForeignKeySnapshot[] = [...readable.foreignKeys.values()]
    .map(fk => ({
      fields: [...fk.fields].sort(),
      targetTable: fk.targetTable,
      targetFields: [...fk.targetFields].sort(),
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate,
    }))
    .sort((a, b) => a.fields.join(',').localeCompare(b.fields.join(',')))

  return {
    tableName: readable.tableName,
    fields,
    indexes,
    foreignKeys,
  }
}

/**
 * Computes a deterministic hash string from multiple table snapshots.
 * Uses FNV-1a for speed — not cryptographic, just needs stability + collision resistance.
 */
export function computeSchemaHash(snapshots: TTableSnapshot[]): string {
  const sorted = [...snapshots].sort((a, b) => a.tableName.localeCompare(b.tableName))
  const json = JSON.stringify(sorted)
  return fnv1a(json)
}

/** FNV-1a 32-bit hash → hex string */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.codePointAt(i)!
    hash = Math.imul(hash, 0x01000193)
  }
  return Math.trunc(hash).toString(16).padStart(8, '0')
}
