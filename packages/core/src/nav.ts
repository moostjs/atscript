/*
 * The `@atscript/core/nav` entry: it imports nothing, so run-time code (a browser included) reads
 * the list without loading the compiler. The main entry re-exports it (`flatten.ts`).
 */

/**
 * Annotations that make a prop a navigation property (a relation, not a stored field).
 * `db.rel.store` is a relation resolved by the store: an adapter that reads the related rows
 * itself, without foreign keys.
 */
export const NAV_PROP_ANNOTATIONS = [
  'db.rel.to',
  'db.rel.from',
  'db.rel.via',
  'db.rel.store',
] as const
