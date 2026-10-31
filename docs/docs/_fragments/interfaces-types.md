## Start With Interfaces

Most `.as` files are just interfaces with a few annotations and semantic types:

```atscript
export interface User {
    id: string
    name: string
    age: number
    isActive: boolean
}
```

Use an interface when you want a named object shape that can later be imported, validated, and inspected at runtime.

## Nest Objects Naturally

Inline nested objects work well when the nested shape is local to one model:

```atscript
export interface User {
    id: string
    profile: {
        name: string
        avatar?: string
    }
    settings: {
        theme: 'light' | 'dark'
    }
}
```

If you want to reuse a nested shape across files, give it its own interface or type alias and import it.

## Use Type Aliases For Reusable Values

Type aliases are useful for named primitives, unions, and reusable constraints:

```atscript
@expect.minLength 3
@expect.maxLength 20
export type Username = string

export type Status = 'pending' | 'success' | 'error'
export type ID = string | number
```

Like interfaces, exported type aliases also exist at runtime and can be validated.

## Common Property Patterns

### Optional Properties

```atscript
export interface Config {
    name: string
    bio?: string
}
```

### Arrays, Tuples, And Literals

```atscript
export interface Data {
    tags: string[]
    coords: [number, number]
    status: 'pending' | 'done'
}
```

An array of a literal is written like any array: `'y'[]` and `1[]` (the same as `('y')[]`). As in TypeScript, `[]` binds tighter than `|` and `&`: `'a' | 'b'[]` is `'a' | ('b')[]`; write `('a' | 'b')[]` for an array of either.

### Dynamic Keys

If a model needs open-ended keys, use wildcard or pattern properties:

```atscript
export interface EnvConfig {
    NODE_ENV: 'development' | 'production'
    [/^PUBLIC_.*/]: string
}
```

That is useful for configuration objects, custom metadata maps, or other flexible records.

## Reuse Types By Reference

```atscript
import { Address } from './address'

export interface User {
    address: Address
    friends: User[]
    manager?: User
}
```

You can reference other types, self-reference, and use arrays of references naturally.

A reference is the referenced type itself, not a copy: at runtime `User.address` reads its structure and annotations from `Address`, so an [`annotate Address { … }`](/packages/typescript/ad-hoc-annotations) block reaches every place that uses `Address`. A property typed by a reference has its own `?` and its own annotations on top of the type's.

A type alias without annotations is the type it names: `type Account = User`, `type Account = (User)` and aliases of aliases are `User` (the same runtime object), so a block on `Account` is a block on `User`. An alias with annotations of its own (`@meta.description 'Account' type Account = User`) is a type of its own whose annotations sit on top of `User`'s.

## Advanced Composition

### Interface Extends

```atscript
interface BaseEntity {
    id: string
    createdAt: string.isoDate
}

interface Timestamped {
    updatedAt: string
}

export interface Post extends BaseEntity, Timestamped {
    title: string
    body: string
}
```

Rules:

- Own properties are added to the inherited ones.
- An inherited property is the parent's own property: `Post.id` is `BaseEntity.id`, with every annotation it has, including those added by blocks of `BaseEntity`.
- A property several parents declare is [merged](#how-a-merge-is-built), the last parent winning on the same annotation.
- Interface-level annotations are not inherited.
- Overriding a parent property in a child is not allowed. To **add** annotations to an inherited property without redeclaring it, use a mutating [`annotate`](/packages/typescript/ad-hoc-annotations) block: `annotate Post { @meta.label 'Post id' id }` annotates `Post.id` only (`Post`'s own property on top of `BaseEntity.id`), and `annotate BaseEntity { id }` annotates the parent and every child.
- Self-extends and circular extends are detected as errors.

### Intersection Types

```atscript
interface Timestamped {
    createdAt: string
}

export type Post = {
    title: string
} & Timestamped
```

Intersections are useful when you want to combine types inline instead of declaring a new parent interface. Use `type` (not `interface`) for the intersection itself — interfaces cannot end with a trailing `& Other`.

An intersection of object types is merged into one object type, as in TypeScript, and `extends` merges its parents the same way.

**The guarantee:** an intersection `L & R` accepts exactly the values `L` and `R` both accept, in every validation engine (the walk, the interpreted pre-check, compiled checks) — except that the annotations of a property several members declare merge by priority (below), the shapes listed under [Merges that resolve to `never`](#merges-that-resolve-to-never), and pattern properties. With `unknownProps: 'error'` / `'strip'`, a key is unknown only when no member declares it. A `p?: L & R` property also passes `undefined` and `null`, like any optional property.

**Pattern properties are the exception.** The merge keeps every member's pattern properties in one list, and a key passes if any merged pattern accepts its value. So `A { [*]: string } & C { [/^n_/]: number }` accepts `{ n_1: 'a' }`: `A`'s wildcard accepts the value, although `C` alone would reject it.

### How a merge is built

The compiler writes the merged type as its final structure; nothing is merged at runtime.

- **A property only one member has is that member's property** — the same runtime object, so blocks on that member's type reach it.
- **A property several members have is a property of the merge**, whose annotations sit on top of the members' properties. On the same annotation the later member wins; repeatable `append` annotations (`@expect.pattern` …) collect every member's values, the earlier member's first. Blocks on the members' types still reach it, unless a later member sets that annotation.
- **A member written in place wins over the others**: in `User & { @expect.maxLength 8 name: string }` the in-place `maxLength` beats `User.name`'s own and those of later blocks on `User`.
- **A named merge is a type of its own.** `type AB = A & B` has its own runtime class. `annotate AB { … }` annotates `AB` only: not `A`, not `B`, and not the same `A & B` written somewhere else.
- **Merges flatten:** `(A & B) & C` is the merge of `A`, `B` and `C`.
- **A union operand is distributed:** `(A | B) & C` is `A & C | B & C`, and `(A | B) & (C | D)` is the product `A & C | A & D | B & C | B & D`. Branches that cannot merge (they would be `never`) are dropped. This also applies to a union of scalars and arrays: `{ c?: string | X[] } & { c?: Y[] }` gives `c?: (X & Y)[]`, because the `string` branch cannot merge with an array.
- **A type picked from a union keeps its checks:** when distributing leaves a single member of a union, the merged property is that member's type, with its built-in and annotated checks. `{ a: string } & { a: string.email | number }` gives `a: string.email`, which still checks the email format. With `@expect.pattern '^x' type X = string`, `{ a: string } & { a: X | number }` gives `a: X` with its pattern. The same applies to each scalar branch of a distributed property.
- **A nullable operand at the top is the type it holds:** `(X | null) & Z` and `XN & Z` with `type XN = X | null` are `X & Z`.

```atscript
interface A {
    @meta.label 'A.x'
    @expect.pattern '^a'
    x: string
    onlyA: string
}

interface B {
    @meta.label 'B.x'
    @expect.pattern '^ab'
    x: string
}

export type AB = A & B
// AB.x: label 'B.x' (the later member wins), patterns '^a' then '^ab'
// AB.onlyA: A.onlyA itself
```

**Merge rules at a glance:**

| Operands                                                                                                    | Result                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The same type twice (`X & X`), or a type and one checking nothing more (`S3 & string`)                      | That type (the one carrying the checks)                                                        |
| Primitives of different kinds (`string & number`), different literals (`'x' & 'y'`)                         | `never`                                                                                        |
| A literal and its primitive (`'x' & string`), an extension and its base (`string.email & string`)           | Narrowed: the literal, the extension (with its built-in checks)                                |
| Two sides that each check something (`'x' & S3`, `1 & number.int`, `string.email & string.uuid`, `decimal`) | A runtime intersection checking both                                                           |
| Objects                                                                                                     | One object with the props of all members; a prop several declare gets the intersection of them |
| Arrays; tuples of scalars                                                                                   | Element by element; item by item                                                               |
| A prop typed by a union of objects, a tuple of objects, an array of arrays (or of unions) of objects        | `never`, with a warning (see below)                                                            |
| A union and anything                                                                                        | Distributed over the branches; branches that cannot match are dropped                          |

In detail:

- A property declared by several members gets the intersection of their types: `{ x: A[] } & { x: B[] }` gives `x: (A & B)[]`, and `{ y: A | null } & { y: B }` gives `y: A & B`.
- A recursive merge is a recursive type: with `A.next?: A` and `B.next?: B`, `(A & B).next` is `A & B` again.
- An intersection carries its members' type-level annotations (of the interfaces, types and `annotate … as` aliases it intersects), below its own, the later member winning. An operand is a reference: type-level annotations whose spec declares `passedWhenReferred: false` (`@meta.readonly`, `@meta.required`, `@meta.id`, `@meta.default`) are not carried. For example, `@expect.minLength 2 type L1 = X[]` makes `L1 & X[]` reject a single element.
- Tuples of scalars intersect item by item: `[string, number] & [string, number]` gives `[string, number]`, and an array intersecting such a tuple gives a tuple of the items' intersections. Tuples of different lengths give `never`.
- Primitives of different types (`string & number`) give `never`. A literal narrows a primitive of its type (`'x' & string` is `'x'`, `{ p: 'a' | 'b' } & { p: 'a' }` gives `p: 'a'`; `'x' & 'y'` is `never`), and a primitive extension its base (`string & string.email` is `string.email`, in either order). A literal and an extension (`1 & number.int`), or two extensions (`string.email & string.uuid`), stay an intersection checking both. A side is dropped only when it checks nothing the other does not, so no constraint is lost: with `@expect.minLength 3 type S3 = string`, `S3 & string` and `string & S3` are `S3`, while `'x' & S3`, `S3 & L4` (another annotated alias) and `'x' & decimal` stay intersections checking both.
- A type repeated (`X & Y & X`) counts once, where it last occurs: `X & Y & X` is `Y & X`. Parentheses around a single type (`({ a: string })[]`) change nothing.
- An optional property passes `null` (as it passes `undefined`): intersected with a required one that may be `null`, it may be `null` too (`{ a?: X } & { a: null }` gives `a: null`). Otherwise `null` is a scalar like any other: an object or array merged with a bare `null` (`{ a: X } & { a: null }`, `{ a?: X[] } & { a?: null }`) resolves to `never`, with a warning. When every member's type may be `null` (`{ a: X | null } & { a?: null }`), the merge is `null`.

### Merges that resolve to `never`

A merge matches the members' props slot by slot: a prop's object, an array's element, the type a nullable union holds. Where two members declare a prop the merge cannot match slot by slot, the prop resolves to `never` (no value is valid there), and the compiler warns: `Intersection of unions of objects cannot be merged at "M.u"; the type resolves to never`. These shapes are:

- a union of several types holding objects in one member and an object in another (`{ p: X | Y } & { p: Z }`, `A & B` with `u: X | Y` and `u: X | Z`);
- tuples holding objects (`{ p: [X] } & { p: [Z] }`);
- arrays of arrays, of tuples or of unions holding objects (`{ p: X[][] } & { p: Z[][] }`, `{ p: (X | Y)[] } & { p: Z[] }`). This applies even when both members write the same type inline (`{ n: X[][] } & { n?: X[][] }`), because only a named type counts as one type. Name it to merge it: with `type V = X[][]`, `{ n: V } & { n?: V }` gives `n: V`;
- values with nothing in common (`{ p: X } & { p: string }`, `string & number`, an object or array and a bare `null` unless every member may be `null`), including a union of scalars and arrays whose branches all fail to merge (`{ m?: number | number[] } & { m?: { c: number } }`).

A prop optional in every member stays optional when it resolves to `never`: a value without it is valid.

A union at the top of an intersection (`(X | Y) & Z`, `p: (X | Y) & Z`) is not one of them: it is distributed over its branches, as above. The props of scalars (`{ p: 'a' | 'b' } & { p: 'b' | 'c' }`, `{ p: string[][] } & { p: string[][] }`) merge as before.

### Merges the compiler rejects

A few merge shapes are compile errors. The module is not generated until you fix them; each fix splits the shape with named types.

**A type cannot be an operand of its own merge.** Recurse through a field instead:

```atscript
interface A {
    a: string
}

export type X = A & X // Error: a type cannot be an operand of its own merge; recurse through a field instead
```

The same goes for a cycle of named merges (`type Y = Z & A` with `type Z = Y & A`). Write the recursion as a property: `interface X extends A { next?: X }`.

**A union member inside a recursive merge.** When a merge on a recursion cycle merges a property several members declare and one of them is a union, the compiler reports `union members are not supported in recursive merges; split with named types`:

```atscript
interface Card {
    title?: string
    next?: Card
}

interface Note {
    text?: string
    next?: Note
}

export interface Tagged {
    tag?: string
    next?: (Card | Note) & Tagged // Error: next is declared by Card / Note and by Tagged
}
```

Split the members so that the recursive property is declared by one of them only:

```atscript
interface CardFields {
    title?: string
}

interface Card extends CardFields {
    next?: Card
}

interface NoteFields {
    text?: string
}

interface Note extends NoteFields {
    next?: Note
}

export interface Tagged {
    tag?: string
    next?: (CardFields | NoteFields) & Tagged
}
```

A union at the top of a merge whose branches recurse (`t?: (N | D) & C`), and ordinary merges nested inside a recursive merge, are fine.

**Too many merges in one module.** A module whose merges need more than 200 distinct merged types (merges of merges of recursive types can multiply) reports `merge too complex: split it with named types`. Name the intermediate merges (`type AB = A & B`) and use the names. The same error covers a merge whose union members distribute into too many branches (more than 16,384 combinations, such as 15 two-member unions intersected): name the parts.

**Mutually recursive merges in a database table.** Where the db layer needs a table's flat field list (`@db.table`, `@db.view`), a recursion that passes through two or more different merges is an error on the table: `flattening this type reaches mutually recursive merges; split it with named types`.

```atscript
interface Extra {
    note?: string
}

interface Post {
    title: string
    author?: Author & Extra
}

interface Author {
    name: string
    latest?: Post & Extra
}

@db.table 'feeds'
export interface Feed { // Error: flattening this type reaches mutually recursive merges
    id: string
    top?: Post
}
```

Name the merges (`type AuthorX = Author & Extra`, `type PostX = Post & Extra`, and `author?: AuthorX`, `latest?: PostX`), or drop the merge from the cycle. A merge that recurses only into itself (`next?: A & B` inside `A`) is fine, and types that are only validated (not db tables) are not affected.

## Practical Example

```atscript
import { Address } from './address'

export interface User {
    id: string.uuid
    username: string.required
    email: string.email

    profile: {
        displayName: string
        bio?: string
        [/^social_.*/]: string
    }

    addresses: Address[]
    status: 'active' | 'inactive' | 'pending'
    createdAt: string.isoDate
}
```
