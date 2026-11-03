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
- Comments are source-only — they are **not** carried into generated `.as.d.ts`/`.as.js` (the JSDoc seen in `.d.ts` is generated entity headers, not your comments).
- Comments are allowed anywhere around annotations: after the annotation / last arg (`@meta.id // pk`), between args (`@x 1 /* c */, 2`), on lines between annotations and the prop. `//` inside a quoted arg is text. A multi-line `/* … */` ends the annotation like a line break (what follows is not its argument).
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
- Inherited props ARE the parent's prop nodes (blocks on the parent reach every child; a runtime write through a child changes the parent). A prop several parents declare merges, last parent wins (M2 below). Interface-level annotations don't inherit.
- No overrides — redeclaring a parent prop is a diagnostic. Self/circular extends detected. Extending a union of 2+ non-`null` branches is a compile error (a type path naming fields of one type — one declared field split by blocks, or several props of the same type — is ONE type here: P6) ("An interface can't extend a union; use a merge (`U & { … }`)"); extending `N` with `type N = X | null` = extending `X`. To **add** annotations to an inherited prop without redeclaring it, use a mutating [`annotate`](#annotate) block (see below).
- For inline composition use `&` intersection instead.

## `type`

```atscript
export type ID = string.uuid
export type Status = 'active' | 'archived'
export type Pair = [string, number]
export type Response = { ok: true } | { ok: false; reason: string }
```

Both `interface` and `type` carry runtime metadata via their `.as.js` counterpart.

**Type paths** (`ownerId: User.id`, `city?: Account.address.city`) name another type's field (its type + annotations). Through unions (written, aliased, on a prop, a distributed merge) each step keeps the branches that have the prop; `null` / non-object branches have none; a branch dead-ending deeper is skipped:

| # | Rule |
|---|---|
| P1 | No branch reaches the end → `Unknown member "…"` compile error (also when the path starts at `T \| null`). |
| P2 | One branch → that field, exactly as without the union. Branches reaching the SAME field (same declared prop, or a merged prop with the same contributors) with the same blocks AT OR BELOW it are one (`T \| T`, `Admin \| User` with `Admin extends User`, a field one merge operand declares in every branch, `k` of `(C \| E) & A & B` with `k` in A and B; a block on the union itself applies on every branch; a block only on an earlier step does not count). |
| P3 | Several → the UNION of the fields, each keeping its own annotations (structure counts positions that differ only by blocks, and fields of one type, as ONE type: P6); the referring prop gets no single field's annotations. A block at or below the field on some branches only makes the same prop two fields (union; each branch validates with its own annotations). The blocks counted are those of every file connected to the path's file by imports either way (what generated code loads together), a sibling file with the "applies only in builds including this file" warning included. A block whose own path goes through a type path it splits (`annotate T { work.h.x.y }` with `H.x?: U.work.h`, `U = T \| Other`) is a compile error: "A block's path can't cross the type path it splits." Every route crosses: an alias of the path, an array item, `\| null`, another type path naming it, an `&` operand; so do blocks whose landings depend on each other's splits (all of them are errors). To annotate every branch, put the block on the union (`annotate U { work.h.x.y }`), which does not split; one block per branch is an error per block. |
| P4 | Several fields are `phantom` only if all are; then the field is ONE phantom prop at runtime, typed by the fields' common phantom primitive (all `ui.action` → `ui.action` + its tags) else plain `phantom`, with none of the fields' annotations; a phantom/data mix is a compile error. |
| P5 | `.d.ts`: scalar field → its type; else each step is `TAtscriptField<T, "k">` (`@atscript/typescript/utils`): the union of the branches' fields, safe through optional props. The alias's descriptor (`Z.type`) is typed as what the runtime holds: `TAtscriptTypeComplex` (a union) when the path names several fields, even of one type; several `phantom` fields → one phantom node → `TAtscriptTypeFinal`. |
| P6 | Structure (`extends`, merges / `never` / distribution, the `.d.ts` data type) collapses positions that differ only by blocks, and fields of ONE type from different props (`Office.address: Address`, `Home.address?: Address` → `Place.address` is `Address`), same file or another; the runtime keeps one item per field with its own annotations. A merge / `extends` built from such a path gets: one declared field split by blocks → that field WITHOUT the blocks; several fields of one type → the type's own props + annotations ONLY (never a field's, never an annotated alias's like `@meta.label 'P' type P = Address`). Field annotations stay on the path's runtime items. Union order never changes the result. |
| P7 | A merged / inherited field typed by a path back to itself is a compile error `Circular chain reference "M.c": it resolves to itself` (`A { c?: M.c }`, `B { c?: string }`, `type M = A & B`); also through `\| null`, `extends` (`J extends A, B`, `c?: J.c`), an `annotate M as X` copy (`c?: X.c`). Fix: type the field directly. |

## Unions / intersections

```atscript
export type Role = 'admin' | 'editor' | 'viewer'
export type Project = { id: string.uuid; name: string } & WithAudit
```

`|`, `&` as in TS (`&` binds tighter; the `.d.ts` keeps the parentheses of `(A | null) & (B | null)`). **Guarantee:** `L & R` accepts exactly what `L` and `R` both accept (interpreted and compiled), except the annotation merge below, the `never` shapes and pattern props (merged into one list: a key passes if ANY merged pattern accepts its value — `A {[*]: string} & C {[/^n_/]: number}` accepts `{n_1: 'a'}`); a key is unknown only when no member declares it; `p?: L & R` also passes `undefined` / `null`.

**Merges (`A & B`, `extends A, B`) — the compiler writes the final structure; the runtime merges nothing:**

| # | Rule |
|---|------|
| M1 | A prop only one member has IS that member's prop (same runtime node; blocks on the member's type reach it). |
| M2 | A prop several members have is the merge's own node reading through the members' props: later member wins on the same key (`extends A, B`: `B` wins); `append` keys = earlier member's values first. |
| M3 | A member written in place (`User & { @expect.maxLength 8 name: string }`) beats the others and later blocks on them. |
| M4 | `type AB = A & B` is a class of its own: `annotate AB { … }` annotates `AB` only — not `A`, `B`, nor `A & B` written elsewhere. The same unnamed merge in two modules = two runtime objects. |
| M5 | `type P = A` / `type P = (A)` IS `A` (same object; a block on `P` is a block on `A`). `@meta.x '…' type P = A` is a node of its own over `A` (blocks on `P` still target `A`). |
| M6 | `(A & B) & C` flattens. `(A\|B) & C` distributes; `(A\|B) & (C\|D)` = product `A&C \| A&D \| B&C \| B&D`, `never` branches dropped. Unions of scalars / arrays distribute too: `{c?: string \| X[]} & {c?: Y[]}` → `c?: (X & Y)[]`. `(X \| null) & Z` = `X & Z`; every operand nullable keeps `null`: `(X \| null) & (Z \| null)` = `X & Z \| null`, `{y: A \| null} & {y: B \| null}` → `y: A & B \| null`. |
| M7 | A recursive merge is a recursive type (`(A & B).next` is `A & B` when `A.next?: A`, `B.next?: B`). |
| M8 | Type-level annotations of operands are carried under the merge's own, later wins, except `passedWhenReferred: false` ones (operand = reference). |
| M9 | Unmergeable prop → `never` + warning (`Intersection of … cannot be merged at "M.u"; the type resolves to never`), keeps `?` when optional in every member: union of objects vs object (`{p: X\|Y} & {p: Z}`), tuples holding objects, arrays of arrays / tuples / object unions (also the same type written inline twice, `{n: X[][]} & {n?: X[][]}` — only a named type is one type: `type V = X[][]` merges), nothing in common (`{p: X} & {p: string}`; an object / array and a bare `null` — `{a: X} & {a: null}` — unless every member may be `null`, then `null`; a scalar / array union none of whose branches merge). Scalar unions / scalar tuples merge. |
| M10 | Scalars as in TS: `'x' & string` → `'x'`, `string & string.email` → `string.email`, `'x' & 'y'` / `string & number` → `never`; two sides each checking something (`1 & number.int`, `'x' & S3`) → runtime intersection checking both. Different tuple lengths → `never`; an array & a tuple → a tuple of the item intersections (`string[] & [string, string]` → `[string, string]`). A member picked from a union keeps its type's checks: `{a: string} & {a: string.email \| number}` → `a: string.email` (email check kept); an annotated alias picked the same way keeps its annotations; same for each scalar branch of a distributed prop. |
| M11 | A repeated operand counts ONCE, at its LATEST occurrence, however spelled (direct or via named merges): `X & Y & X` = `Y & X`; `XX = X & X`, `XY = XX & Y` → `X & XY & XX` = `Y & X` (X wins on a shared key). |

**Merge compile errors** (module not generated; fix by splitting with named types):

| Message | Trigger | Fix |
|---|---|---|
| `a type cannot be an operand of its own merge; recurse through a field instead` | `type X = A & X`, or a cycle of named merges (`type Y = Z & A`, `type Z = Y & A`) | `interface X extends A { next?: X }` |
| `union members are not supported in recursive merges; split with named types` | a merge ON a recursion cycle merges a prop several members declare with a union among them (`Tagged { next?: (Card \| Note) & Tagged }` with `Card.next`, `Note.next`) | move the recursive prop out of the union members (`(CardFields \| NoteFields) & Tagged`). Top-level `(N \| D) & C` and ordinary merges inside a recursive merge are fine |
| `merge too complex: split it with named types` | > 200 distinct merged types in one module, or union members distributing into > 16,384 branch combinations | name intermediate merges / the parts |
| `flattening this type reaches mutually recursive merges; split it with named types` | a `@db.table` / `@db.view` whose flattening reaches a cycle through ≥ 2 different unnamed merges (`author?: Author & Extra`, `latest?: Post & Extra`) | name the merges (`type AuthorX = Author & Extra`); self-recursive merges and validate-only types are fine |

Discriminated unions (members share a literal-valued prop) are auto-detected by `buildJsonSchema` and exposed via `detectDiscriminator()`.

## Tuples / arrays

```atscript
export type Coordinates = [number, number]
export type Pair = [string, number]
export type Tags = string[]
```

Fixed-length tuples only — no rest element (`...T[]`). An array of a literal is written like any array (`'y'[]`, `1[][]`, same as `('y')[]`); `[]` binds tighter than `|` / `&`, so `'a' | 'b'[]` is `'a' | ('b')[]` (as in TS, `.d.ts` identical).

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

Any key matching the regex validates against the value type. Multiple allowed; checked in declaration order. Flags `g` / `y` are dropped at runtime (stateless key test; `y` → anchored at the key start) and warn.

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
- Circular imports OK unless they produce infinite expansion (parser reports diagnostic); at runtime they need native ESM (see A11 below).

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

- Top-level annotations on the `annotate` block apply to the type itself (checked against the target's node type — `interface` / `type`, through aliases to theirs — unless the spec lists `'annotate'`; a spec's `defType` is checked against the type the target resolves to, through aliases — `@expect.minLength 2 annotate Name {}` with `type Name = string` is valid); entries inside the block apply to the named property path.
- Works on `interface`, `type` aliases, and unions. Body may be empty (`annotate T {}`) when you only want type-level annotations. An entry with no annotations does nothing.
- Multi-value annotations merge per their declared strategy (replace vs append).

**Mutating `annotate T { … }` — invariants:**

| # | Rule |
|---|------|
| A1 | As if written in `T`'s source: writes `T`'s own nodes. Every reference, `extends`, merge, alias and `as` copy of `T` sees it; block order is irrelevant. |
| A2 | A path into another type is the REFERRER's own override, at EXACTLY that path: `annotate Client { home.city }` (`home: Address`) → `Client.home.city` only; it reads everything else from `Address.city` (live) and wins on its own keys. `Client.home.next.city` stays `Address.city` — write `home.next.city` for that spot. |
| A3 | Self-collapse: a step reaching `T` itself through a direct reference, alias, array or `\| null` (also via other types: `Dept.lead.dept`) IS `T` → `annotate Node { next.name }` = `annotate Node { name }` (every depth). NOT through `Node \| Other` or `Node & Meta`: those are exact paths. |
| A4 | Path through a union: applies to every branch having the prop (as the referrer's overrides); branches without it (incl. non-object) skipped; no branch takes the whole path → compile error. |
| A5 | Same key set by several blocks: static order (import depth, module id, source order); last wins, any load order. Depth = 0 for a module importing no `.as`, else 1 + deepest import (a cycle shares one). Set each annotation in one place. |
| A6 | Block on a bare/annotated alias = block on its target. Block on a named merge `AB` = `AB` only. Block on a chain alias `type C = B.n` = `C` only. |
| A7 | Load annotate modules BEFORE their types are first used: a path override loaded later (lazy `import()`) is not seen by merges/readers that already read the type. A prebuilt library's merges don't see an app's path override on props several members declare — annotate the merged type or the member prop itself. |
| A8 | Unreachable block warning (`"T" (declared in ./t.as) is used by ./p.as without importing this file (directly or not): this annotate applies only in builds including this file …`): import the block's file from `T`'s file or every file using `T`. A never-imported block never applies. |
| A9 | Invalid entry (unknown path, path into `never`, no union branch) = compile error; the module is NOT generated. |
| A10 | Dev (Vite): editing a module with mutating blocks = FULL PAGE RELOAD; ordinary edits hot-update. |
| A11 | `.as` import cycles need native ESM (generated code is ESM); CommonJS rewrites work only for non-cyclic `.as` modules. |

**Non-mutating `annotate T as X { … }`:** X = own class over `T`'s structure; metadata reads through `T`, X's entries on top. Blocks on X beat X's entries; later blocks on `T` reach X unless X sets the key. `append` keys: `T`'s values first. Wherever X is used it is X (`extends X` inherits X's props; type-level annotations not inherited, as for any `extends`). An `as` copy keeps `passedWhenReferred: false` keys.

- This is the canonical way to attach plugin annotations (`@arbac.userId`, `@db.index.unique`, `@ui.form.*`, etc.) to fields inherited from a shipped base type — `extends` can't redeclare, but `annotate` can patch (`annotate Base { f }` for every child, `annotate Child { f }` for that child only).

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
