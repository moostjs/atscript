# Uniquery Type Safety Improvements — Spec for @uniqu/core

## Context

Atscript generates typed static properties on `@db.table` interfaces:
- `__flat` — all queryable dot-notation paths with value types
- `__pk` — primary key type
- `__ownProps` — (NEW) flat paths for table-owned fields only (no nav props)
- `__navProps` — (NEW) navigation property map: `{ author: Author, comments: Comment[] }`

The consuming side (`@atscript/utils-db`) passes these as generics to Uniquery:
```typescript
table.findOne(query: Uniquery<OwnProps, NavProps>)
```

This spec describes the changes needed in `@uniqu/core` to support typed `$with` and optional filter/controls.

## Current State (`@uniqu/core/src/types.ts`)

```typescript
export interface Uniquery<T = Record<string, unknown>> {
  name?: string
  filter: FilterExpr<T>           // required
  controls: UniqueryControls<T>   // required
  insights?: UniqueryInsights
}

export interface UniqueryControls<T = Record<string, unknown>> {
  $sort?: Partial<Record<keyof T & string, 1 | -1>>
  $skip?: number
  $limit?: number
  $count?: boolean
  $select?: (keyof T & string)[] | Partial<Record<keyof T & string, 0 | 1>>
  $with?: WithRelation[]          // untyped
  [key: `$${string}`]: unknown
}

export type WithRelation = Uniquery & { name: string }  // name is just string
```

## Required Changes

### 1. Make `filter` and `controls` optional

```typescript
export interface Uniquery<T = Record<string, unknown>, Nav extends Record<string, unknown> = Record<string, unknown>> {
  name?: string
  filter?: FilterExpr<T>
  controls?: UniqueryControls<T, Nav>
  insights?: UniqueryInsights
}
```

This allows `table.findOne({})` or `table.findOne({ filter: { status: 'active' } })` without requiring empty objects.

**Impact**: All internal code that reads `query.filter` or `query.controls` must handle `undefined`. Typically: `query.filter ?? {}` and `query.controls ?? {}`. The `walkFilter` and `computeInsights` functions should accept `undefined` filter/controls gracefully (treat as empty).

### 2. Add `Nav` generic parameter

Add a second generic `Nav` to `Uniquery` and `UniqueryControls`:

```typescript
export interface Uniquery<
  T = Record<string, unknown>,
  Nav extends Record<string, unknown> = Record<string, unknown>
> {
  name?: string
  filter?: FilterExpr<T>
  controls?: UniqueryControls<T, Nav>
  insights?: UniqueryInsights
}
```

`Nav` represents a map of navigation property names to their types. When provided by the Atscript codegen (e.g., `{ author: Author, comments: Comment[] }`), it constrains `$with`.

### 3. Type `$with` via `Nav` generic

```typescript
export interface UniqueryControls<
  T = Record<string, unknown>,
  Nav extends Record<string, unknown> = Record<string, unknown>
> {
  $sort?: Partial<Record<keyof T & string, 1 | -1>>
  $skip?: number
  $limit?: number
  $count?: boolean
  $select?: (keyof T & string)[] | Partial<Record<keyof T & string, 0 | 1>>
  $with?: TypedWithRelation<Nav>[]
  [key: `$${string}`]: unknown
}
```

### 4. Define `TypedWithRelation<Nav>`

This is the key type that constrains `$with` entries:

```typescript
/**
 * A typed $with relation entry.
 * When Nav is typed (from __navProps), name is constrained to known nav prop keys.
 * Each entry gets its own filter/controls typed to the target entity.
 *
 * Nav shape: { author: Author, comments: Comment[] }
 * Where Author/Comment have their own __ownProps and __navProps static properties.
 */
export type TypedWithRelation<Nav extends Record<string, unknown>> =
  [keyof Nav & string] extends [never]
    ? WithRelation  // fallback to untyped when Nav is empty/unknown
    : {
        [K in keyof Nav & string]: {
          name: K
          filter?: FilterExpr<NavTarget<Nav[K]> extends { __ownProps: infer F } ? F : Record<string, unknown>>
          controls?: UniqueryControls<
            NavTarget<Nav[K]> extends { __ownProps: infer F } ? F : Record<string, unknown>,
            NavTarget<Nav[K]> extends { __navProps: infer N extends Record<string, unknown> } ? N : Record<string, unknown>
          >
          insights?: UniqueryInsights
        }
      }[keyof Nav & string]

/** Unwrap array types to get the element type for nav props. */
type NavTarget<T> = T extends Array<infer U> ? U : T
```

When `Nav` is the default `Record<string, unknown>`, `TypedWithRelation` falls back to untyped `WithRelation` (any string name, untyped filter/controls).

When `Nav` is e.g. `{ author: Author, comments: Comment[] }`:
- `name` autocompletes to `'author' | 'comments'`
- For `name: 'author'`, `filter` is typed to `Author['__ownProps']`
- For `name: 'comments'`, `filter` is typed to `Comment['__ownProps']`
- Nested `$with` inside controls is typed to the target's `__navProps` (recursive!)

### 5. Keep `WithRelation` as the untyped version

```typescript
/** Untyped $with relation — used when Nav generic is not provided. */
export type WithRelation = {
  name: string
  filter?: FilterExpr
  controls?: UniqueryControls
  insights?: UniqueryInsights
}
```

Note: `WithRelation` also gets optional `filter`/`controls` to match the new `Uniquery` shape.

### 6. Update `walkFilter` and `computeInsights`

These functions should handle optional filter/controls:

```typescript
// walkFilter should accept undefined (no-op)
export function walkFilter<R>(
  filter: FilterExpr | undefined,
  visitor: FilterVisitor<R>
): R | undefined

// computeInsights should accept undefined filter/controls
export function computeInsights(
  filter?: FilterExpr,
  controls?: UniqueryControls
): UniqueryInsights
```

### 7. Update exports

```typescript
export type {
  // ... existing exports ...
  TypedWithRelation,  // NEW
  NavTarget,          // NEW (utility, optional)
} from './types'
```

## Type Inference Examples

### Fully typed (from Atscript codegen):
```typescript
// Given:
// Post.__ownProps = { id: number, title: string, authorId: number }
// Post.__navProps = { author: Author, comments: Comment[] }
// Author.__ownProps = { id: number, name: string }
// Author.__navProps = { posts: Post[] }

const query: Uniquery<Post['__ownProps'], Post['__navProps']> = {
  filter: { title: 'hello' },           // ✓ typed to Post own fields
  controls: {
    $sort: { id: -1 },                  // ✓ typed to Post own fields
    $with: [{
      name: 'author',                   // ✓ autocomplete: 'author' | 'comments'
      filter: { name: 'Alice' },        // ✓ typed to Author own fields
      controls: {
        $with: [{
          name: 'posts',                // ✓ typed to Author's nav props
        }]
      }
    }]
  }
}
```

### Untyped (URL parser, generic usage):
```typescript
const query: Uniquery = {
  filter: { anything: 'goes' },
  controls: {
    $with: [{ name: 'whatever' }]  // still works, just untyped
  }
}
```

### Minimal (optional filter/controls):
```typescript
const query: Uniquery<Post['__ownProps']> = {}  // valid!
const query2: Uniquery<Post['__ownProps']> = { filter: { id: 1 } }  // no controls needed
```

## Notes

- The `NavTarget` utility unwraps `Comment[]` → `Comment` so we can access `Comment['__ownProps']` from the nav map
- The fallback `[keyof Nav & string] extends [never]` check ensures that when `Nav` is `Record<string, unknown>` (default), we don't break existing untyped usage
- `filter` and `controls` being optional is a DX improvement — internal code should default to `{}` where needed
- The `[key: \`$\${string}\`]: unknown` index signature on `UniqueryControls` remains for pass-through keywords
