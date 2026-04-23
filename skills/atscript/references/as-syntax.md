# `.as` syntax

TypeScript-like but distinct grammar. Annotations are first-class.

## File layout

```atscript
// line comment
/* block comment */

import { OtherType } from './other.as'

export interface Foo { ... }
export type Bar = ...

type Helper = string   // file-local, not exported
```

- Only `export`ed declarations are visible to other `.as` files.
- Comments preserved as JSDoc on generated `.d.ts`.
- Import paths resolve relative; extension optional (`'./x'` → `./x.as`).

## `interface`

```atscript
export interface User {
  id: string
  name?: string              // optional → `name?: string`
  readonly createdAt: string
  tags: string[]
}
```

Interfaces → class-like types in `.d.ts` with attached runtime metadata namespace. `readonly` honored.

## `type`

```atscript
export type ID = string.uuid
export type Status = 'active' | 'archived'
export type Pair = [string, number]
export type Response = { ok: true } | { ok: false; reason: string }
```

Both `interface` and `type` carry runtime metadata via their `.as.js` counterpart.

## Unions / intersections

```atscript
export type Role = 'admin' | 'editor' | 'viewer'
export type Project = { id: string.uuid; name: string } & WithAudit
```

`|`, `&` as in TS. Discriminated unions (members share a literal-valued prop) are auto-detected by `buildJsonSchema`.

## Tuples / arrays

```atscript
export type Coordinates = [number, number]
export type Labeled = [string, ...number[]]   // rest element
export type Tags = string[]
```

Array constraints go on the property via `@expect.minLength` / `@expect.maxLength` / `@expect.array.key` / `@expect.array.uniqueItems`.

## Inline objects

```atscript
export interface Order {
  customer: { id: string.uuid; email: string.email }
  items: { sku: string; qty: number.int.positive }[]
}
```

Inline `{ … }` valid anywhere a type is. Merged with parent annotations at runtime.

## Pattern properties

```atscript
export interface Translations {
  [/^[a-z]{2}(-[A-Z]{2})?$/]: string
}
```

Any key matching the regex validates against the value type. Multiple allowed; checked in declaration order.

## Primitives + extensions

```atscript
userId: string.uuid           // semantic extension
price: decimal                // string-backed exact decimal
count: number.int.positive    // int ≥ 1
```

Full list → [primitives.md](primitives.md).

## Imports / exports

```atscript
import { User, Project } from './models'

export interface Team {
  lead: User
  projects: Project[]
}

export type MaybeUser = User | null
```

- Imports are local; re-export explicitly via `export type A = B`.
- Circular imports OK unless they produce infinite expansion (parser reports diagnostic).

## Not supported

- Generics (`interface Foo<T>`) — model as separate types or union.
- Function / method types.
- `Record<K, V>` — use pattern properties.
- Mapped, conditional, template-literal types.

Unsupported constructs → parser diagnostic (accumulated in `TMessages`, not thrown).

## Formatting

No prescribed formatter. VSCode extension provides highlighting + assist, not auto-format.
