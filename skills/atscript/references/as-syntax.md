# `.as` syntax

TypeScript-like but distinct grammar. Annotations are first-class.

## File layout

```atscript
// line comment
/* block comment */

import { OtherType } from './other'

export interface Foo { ... }
export type Bar = ...

type Helper = string   // file-local, not exported
```

- Only `export`ed declarations are visible to other `.as` files.
- Comments preserved as JSDoc on generated `.d.ts`.
- Import paths resolve relative; **omit the `.as` extension** — the resolver always appends `.as`. Writing `'./x.as'` resolves to `./x.as.as`.

## `interface`

```atscript
export interface User {
  id: string
  name?: string              // optional → `name?: string`
  createdAt: string
  tags: string[]
}
```

Interfaces → `declare class X { … }` in `.d.ts`; the class itself carries runtime statics (`type`, `metadata`, `validator()`).

### `extends`

```atscript
interface Base { id: string.uuid }
interface Audited { createdAt: string.isoDate }

export interface Post extends Base, Audited {
  title: string
}
```

- Multiple parents (comma-separated). Own props add to inherited.
- Prop-level annotations inherit; interface-level annotations don't.
- No overrides — redeclaring a parent prop is a diagnostic. Self/circular extends detected. To **add** annotations to an inherited prop without redeclaring it, use a mutating [`annotate`](#annotate) block (see below).
- For inline composition use `&` intersection instead.

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

`|`, `&` as in TS. Discriminated unions (members share a literal-valued prop) are auto-detected by `buildJsonSchema` and exposed via `detectDiscriminator()` for downstream consumers.

## Tuples / arrays

```atscript
export type Coordinates = [number, number]
export type Pair = [string, number]
export type Tags = string[]
```

Fixed-length tuples only — no rest element (`...T[]`).

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

Extension MUST be omitted — the resolver always appends `.as`.

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

## `annotate`

Patch annotations onto an existing type **without redeclaring its props**. Two forms — mutating (modifies target in place) and non-mutating (creates a new aliased export with merged annotations, target untouched).

```atscript
// Mutating — patches MyInterface in place. Use to add annotations to inherited
// or imported props you can't redeclare under `extends`.
@meta.description 'Mutated Interface'
annotate MyInterface {
  @label 'Mutated Name'
  @mul 42
  name                // each entry: `<annotations>` then the property path
  @label 'Mutated Age'
  age
  @label 'Mutated City'
  address.city        // dotted paths reach into nested objects
}

// Non-mutating — leaves MyInterface alone, exports a new merged view.
@meta.description 'Annotated'
export annotate MyInterface as AnnotatedInterface {
  @label 'Custom Name'
  name
}
```

- Top-level annotations on the `annotate` block apply to the type itself; entries inside the block apply to the named property path.
- Works on `interface`, `type` aliases, and unions. Body may be empty (`annotate T {}`) when you only want to add type-level annotations.
- Works across files — `import { T } from './m'` then `annotate T { … }` patches the imported type for the consuming module's compilation unit.
- Multi-value annotations merge per their declared strategy (replace vs append) — re-emit them to add additional values.
- This is the canonical way to attach plugin annotations (`@arbac.userId`, `@db.index.unique`, `@ui.form.*`, etc.) to fields inherited from a shipped base type — `extends` can't redeclare, but `annotate` can patch.

```atscript
// Concrete pattern: tag an inherited username field as the arbac user id.
import { AoothUserCredentials } from '@aooth/user/atscript'

annotate AoothUserCredentials {
  @meta.id
  @arbac.userId
  username
}

export interface AppUser extends AoothUserCredentials {
  firstName?: string
}
```

## Not supported

- Generics (`interface Foo<T>`) — model as separate types or union.
- Function / method types.
- `Record<K, V>` — use pattern properties.
- Mapped, conditional, template-literal types.
- `readonly` prop modifier.
- Tuple rest elements (`[A, ...B[]]`).

Unsupported constructs → parser diagnostic (accumulated in `TMessages`, not thrown).

## Formatting

No prescribed formatter. VSCode extension provides highlighting + assist, not auto-format.
