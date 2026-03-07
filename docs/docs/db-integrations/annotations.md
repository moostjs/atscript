---
outline: deep
---

# Annotations Reference

Complete reference for all `@db.*` annotations. These annotations are shipped with `@atscript/core` — no extra packages needed.

## Table & Schema

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.table 'name'` | interface | Map interface to a database table |
| `@db.table.renamed 'oldName'` | interface | Track table rename for [schema sync](./schema-sync) |
| `@db.schema 'name'` | interface | Assign table to a database schema/namespace |

## Column Configuration

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.column 'name'` | field | Override the physical column name |
| `@db.column.renamed 'oldName'` | field | Track column rename for [schema sync](./schema-sync) |
| `@db.json` | field | Store as a single JSON column instead of flattening |
| `@db.ignore` | field | Exclude field from database schema |

## Defaults

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.default 'value'` | field | Static default value |
| `@db.default.fn 'name'` | field | Generated default: `'increment'`, `'uuid'`, or `'now'` |

## Indexes

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.index.plain 'name'` | field | Non-unique index |
| `@db.index.plain 'name', 'desc'` | field | Non-unique index with sort direction |
| `@db.index.unique 'name'` | field | Unique index |
| `@db.index.fulltext 'name'` | field | Full-text search index |

Add the same index name to multiple fields for composite indexes.

## Relations

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.rel.FK` | field | Declare a [foreign key](./foreign-keys) |
| `@db.rel.FK 'alias'` | field | Foreign key with alias (for multiple FKs to the same table) |
| `@db.rel.onDelete 'action'` | field | Referential action on delete |
| `@db.rel.onUpdate 'action'` | field | Referential action on update |
| `@db.rel.to` | field | Forward [navigation](./navigation) (FK on this table) |
| `@db.rel.to 'alias'` | field | Forward navigation with alias |
| `@db.rel.from` | field | Reverse [navigation](./navigation) (FK on other table) |
| `@db.rel.from 'alias'` | field | Reverse navigation with alias |
| `@db.rel.via JunctionType` | field | Many-to-many [navigation](./navigation) through a junction table |
| `` @db.rel.filter `condition` `` | field | Filter condition for navigation property |

**Referential actions** for `@db.rel.onDelete` / `@db.rel.onUpdate`:

| Action | Description |
|--------|-------------|
| `'cascade'` | Delete/update related rows automatically |
| `'restrict'` | Prevent if related rows exist |
| `'noAction'` | No action (database default) |
| `'setNull'` | Set FK to null (field must be optional) |
| `'setDefault'` | Set FK to default value |

## Views

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.view 'name'` | interface | Declare a database [view](./views) |
| `@db.view.for Type` | interface | Entry table for a managed view |
| `` @db.view.joins Type, `condition` `` | interface | Join another table with a [query condition](./query-expressions) |
| `` @db.view.filter `condition` `` | interface | WHERE clause for the view |
| `@db.view.materialized` | interface | Mark view as materialized |
| `@db.view.renamed 'oldName'` | interface | Track view rename for [schema sync](./schema-sync) |

## Patch Behavior

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.patch.strategy 'replace'` | field | Replace entire nested object on update (default) |
| `@db.patch.strategy 'merge'` | field | Deep-merge nested object on update |

## Schema Sync

| Annotation | Target | Description |
|-----------|--------|-------------|
| `@db.sync.method 'drop'` | interface | Drop and recreate table on structural changes (lossy) |
| `@db.sync.method 'recreate'` | interface | Recreate with data preservation on structural changes |
