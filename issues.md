# DB Layer Architectural Issues

Tracked issues in the generic DB abstraction stack: `DbSpace -> AtscriptDbTable -> AtscriptDbReadable -> BaseDbAdapter -> concrete adapters`.

---

## 1. Readable is a God Object (~2,100 lines)

**File:** `packages/db-utils/src/table/db-readable.ts`

**Problem:** `AtscriptDbReadable` does five distinct jobs in one class:
- Metadata compilation (`_flatten`, `_scanGenericAnnotations`, `_classifyFields`, `_buildFieldDescriptors`)
- Query translation (`_translateQuery`, `_translateFilter`, `_translateControls`)
- Result reconstruction (`_reconstructFromRead`, boolean/decimal coercion, JSON parsing)
- Relation loading (`_loadRelations`, `_loadToRelation`, `_loadFromRelation`, `_loadViaRelation`)
- ID resolution (`_resolveIdFilter`, `_tryFieldFilter`)

It holds 22 internal maps/sets all populated during a single `_flatten()` pass. Hard to reason about, test in isolation, or extend for a new adapter type (e.g., graph DB).

**Fix:** Extract a `FieldMetadataCompiler` that takes an annotated type + adapter hooks and produces an immutable `TableMetadata` object. Readable becomes a thin orchestrator delegating to metadata, query translator, and relation loader — each independently testable.

**Severity:** High (maintainability)
**Effort:** Large refactor
**Status:** [ ] Open

---

## 2. Feature Flags Create Branching Tax

**Files:** `packages/db-utils/src/base-adapter.ts`, `packages/db-utils/src/table/db-readable.ts`, `packages/db-utils/src/table/db-table.ts`

**Problem:** Adapter capabilities declared via boolean methods cause conditional branching throughout the generic layer:

| Flag | Branches in |
|------|-------------|
| `supportsNestedObjects()` | `_flatten`, `_classifyFields`, `_buildFieldDescriptors`, `_prepareForWrite`, `_reconstructFromRead` |
| `supportsNativeForeignKeys()` | `deleteOne`, `deleteMany`, `_validateForeignKeys` |
| `supportsNativeRelations()` | `_loadRelations` |
| `supportsNativePatch()` | `bulkUpdate` |
| `supportsNativeValueDefaults()` + `nativeDefaultFns()` | `_applyDefaults` |

The generic layer is essentially two interleaved implementations: one for relational DBs, one for document DBs. Each new adapter capability adds another conditional path.

**Fix:** Instead of "does your DB support X? if no, I'll do it for you", make the adapter always responsible. For adapters that can't do something natively, provide mixins/helpers (e.g., `ApplicationLevelCascadeMixin`) they explicitly opt into. The generic layer stays clean; complexity moves to where it belongs.

**Severity:** High (architectural)
**Effort:** Medium
**Status:** [ ] Open

---

## 3. Write Path and Read Path Have Divergent Flattening

**Files:** `packages/db-utils/src/table/db-readable.ts` (read), `packages/db-utils/src/table/db-table.ts` (`_prepareForWrite`)

**Problem:** Two independent implementations of logical-to-physical field mapping:

- **Read side:** Pre-computed maps (`_pathToPhysical`, `_physicalToPath`) built once during `_flatten()`. Reconstruction uses `_physicalToPath` to rebuild nested objects.
- **Write side:** `_prepareForWrite()` does its own manual traversal — iterating payload keys, checking `_flattenedParents`, `_jsonFields`, `_columnMap`, `_pathToPhysical`.

If a new field classification is added (e.g., `@db.binary`), both paths need updating independently with no enforcement that they stay in sync.

**Fix:** Unify into a shared bidirectional mapper used by both read reconstruction and write preparation.

**Severity:** Medium (bug risk)
**Effort:** Medium
**Status:** [ ] Open

---

## 4. Adapter Mutates Readable State via Back-Reference

**Files:** `packages/db-utils/src/base-adapter.ts`, `packages/db-utils/src/table/db-readable.ts`, `packages/mongo/src/lib/mongo-adapter.ts`

**Problem:** Bidirectional coupling where the adapter mutates readable internals during flattening:

```typescript
// MongoAdapter.onAfterFlatten():
this._table.addPrimaryKey('_id')
this._table.removePrimaryKey('id')
this._table.addUniqueField('id')
```

Consequences:
- Readable metadata depends on which adapter is attached, not just the type
- `addPrimaryKey`/`removePrimaryKey` are public but only safe during `_flatten()`
- No validation that mutations are consistent (e.g., removing the only PK)

**Fix:** `onAfterFlatten()` should return a `MetadataOverrides` object that the readable applies atomically, not mutate state through back-references. Or, the adapter hooks should feed into the metadata compiler (see issue 1) rather than mutating post-hoc.

**Severity:** Medium (correctness)
**Effort:** Medium
**Status:** [ ] Open

---

## 5. Nav Field Purge is Fragile

**File:** `packages/db-utils/src/table/db-readable.ts:1102` (`_purgeNavFieldDescendants`)

**Problem:** When a navigation field is detected, its descendants are purged from 8 separate collections:

```
_defaults, _columnMap, _jsonFields, _collateMap, _primaryKeys,
_originalMetaIdFields, _indexes, _foreignKeys
```

But it does NOT purge from `_ignoredFields`, `_flatMap`, `_booleanFields`, `_decimalFields`, or `_valueFormatters`. Some are populated later, but the inconsistency means if initialization order changes, bugs slip through. Adding a new map (e.g., `_encryptedFields`) requires remembering to update the purge method — no enforcement.

**Fix:** Either use a single registry-of-collections pattern that purge iterates automatically, or restructure so nav field descendants are never added in the first place (filter during scan, not purge after).

**Severity:** Medium (bug risk)
**Effort:** Small
**Status:** [ ] Open

---

## 6. `compositeKey()` Uses Lossy String Concatenation

**File:** `packages/db-utils/src/table/db-readable.ts:184`

**Problem:**
```typescript
function compositeKey(fields: string[], obj: Record<string, unknown>): string {
  return fields.map(f => String(obj[f] ?? '')).join('\0')
}
```

- `null` and `undefined` both become `''` — indistinguishable
- Field values containing `\0` produce incorrect keys
- `String(someObject)` produces `[object Object]` — non-primitive values silently break

Used for FK matching in relation loading — wrong matches mean incorrect data returned to users.

**Fix:** Use structured key comparison or a safer serialization (e.g., `JSON.stringify([...values])` which distinguishes `null` from `undefined` and handles nested values).

**Severity:** Low-Medium (data correctness risk)
**Effort:** Small
**Status:** [ ] Open

---

## 7. Cascade Delete Has No Cycle Detection

**File:** `packages/db-utils/src/table/db-table.ts:668` (`_cascadeBeforeDelete`)

**Problem:** Transitive cascade works because `target.deleteMany()` calls the full `AtscriptDbTable.deleteMany()` which checks `_needsCascade()` internally. However:

- **No cycle detection** — if A -> B -> A with mutual cascades, infinite recursion
- **No depth limit** — deeply nested cascades could stack overflow
- **Performance** — each level does N+1 queries (fetch parents, then per-child-table delete), no batching across the cascade tree

**Fix:** Add a `visited: Set<string>` parameter threaded through cascade calls to detect cycles. Consider a depth limit (e.g., 10 levels).

**Severity:** Low (edge case, but crash when hit)
**Effort:** Small
**Status:** [ ] Open

---

## 8. DbSpace Creates Orphan Adapters

**File:** `packages/db-utils/src/table/db-space.ts:129-144`

**Problem:**
```typescript
async dropTableByName(tableName: string): Promise<void> {
  const adapter = this.adapterFactory()  // Fresh adapter with NO registered readable
  if (adapter.dropTableByName) {
    await adapter.dropTableByName(tableName)
  }
}
```

This adapter has `_table` as `undefined!` (never registered). If `dropTableByName` accidentally accesses `this._table`, it crashes with an opaque error.

**Fix:** Extract connection-level operations (drop table/view by name) into a separate interface that doesn't require a registered readable. Or have DbSpace hold one "bare" adapter for administrative ops.

**Severity:** Low (crash risk on specific code path)
**Effort:** Small
**Status:** [ ] Open

---

## 9. Value Formatters Have Asymmetric Application

**Files:** `packages/db-utils/src/table/db-readable.ts` (`_formatFilterValue`, `_formatWriteValues`)

**Problem:** Formatters are cached by physical column name and applied in both filter translation (read) and write preparation. But they're the same function for both directions. If a formatter converts epoch -> datetime for writes, it also converts epoch -> datetime in read filters (correct). But:

- Reconstruction (`_reconstructFromRead`) doesn't use formatters at all — no inverse path
- If an adapter ever needs asymmetric formatting (different transform for read vs. write), there's no mechanism
- Formatters are tied to physical column name, not field metadata — if two fields ever shared a physical name (shouldn't happen, but no validation), they'd share a formatter

**Fix:** Consider a `{ toStorage, fromStorage }` formatter pair instead of a single function. Even if `fromStorage` is identity for now, the structure would be correct.

**Severity:** Low (latent design gap)
**Effort:** Small
**Status:** [ ] Open

---

## 10. No Adapter-Annotation Compatibility Validation

**Problem:** When you create `new DbSpace(() => new SqliteAdapter(driver))` and register types with `@db.mongo.search.vector`, nothing fails. Annotations are silently ignored because SQLite's adapter doesn't scan for them. Using `@db.default.increment` with an adapter that doesn't support it and doesn't generate values client-side produces rows with `undefined` values.

No upfront check that annotations used in a schema are compatible with the adapter.

**Fix:** Adapters could declare which annotation namespaces they recognize. During `_flatten()`, warn on unrecognized `@db.*` annotations. Low priority since cross-adapter annotation use is unlikely in practice.

**Severity:** Low (developer experience)
**Effort:** Small
**Status:** [ ] Open
