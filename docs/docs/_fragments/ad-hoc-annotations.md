Ad-hoc annotations let you attach metadata to an existing interface or type without modifying its original definition. This works with both `interface` and `type` definitions, including primitive-based types and union types. This is useful when the original type is defined in another file, shared across modules, or when you need context-specific metadata variations.

## Syntax

There are two forms: **mutating** and **non-mutating**.

### Mutating

Injects annotations directly into the target definition at runtime:

```atscript
import { User } from './user'

annotate User {
    @meta.label 'Full Name'
    name
    @meta.label 'Email Address'
    email
}
```

The block changes `User` itself, as if its annotations had been written in `User`'s source from the start. No new type is created.

Every place that uses `User` sees the change: properties typed `User`, arrays and unions of it, `interface Admin extends User`, intersections with `User`, aliases of it and `annotate User as …` copies. The order of the declarations and of the blocks does not matter, and neither does the file holding the block, as long as its module is loaded before the type is first used (see [When blocks apply](#when-blocks-apply)).

A type alias without annotations is the type it names, so a block on it is a block on that type: with `type Account = User` (or `type Member = Account`, `type Account = (User)`), `annotate Account { @meta.label 'Name' name }` changes `User` itself, exactly like `annotate User { … }`. The same goes for an alias with type-level annotations of its own (`@meta.description 'Account' type Account = User`): its properties are `User`'s. A reference to a property (`type City = User.home`) is not a plain alias: a block on it annotates that type only.

A named merge is a type of its own: with `type AdminUser = User & Extra`, `annotate AdminUser { name }` annotates `AdminUser.name` only. It reaches neither `User` nor another `User & Extra` (see [How a merge is built](/packages/typescript/interfaces-types#how-a-merge-is-built)).

### Non-mutating (Alias)

Creates a new named type that inherits the target's structure with overridden annotations:

```atscript
import { User } from './user'

export annotate User as UserForm {
    @meta.label 'Full Name'
    name
    @meta.label 'Email Address'
    email
}
```

`UserForm` is a standalone type with its own class, type definition, and metadata. `User` remains unchanged.

`UserForm` is a copy of `User` that keeps reading from it: its structure is `User`'s, and its annotations sit on top of `User`'s, with the alias's entries (`Full Name`, `Email Address`) winning. So:

- a block on `User` reaches `UserForm` too, in any order, unless the alias sets that annotation itself;
- a block on `UserForm` (`annotate UserForm { @meta.label 'Name' name }`) annotates the alias only, and wins over the alias's own entries;
- wherever `UserForm` is used it is this type: `interface Signup extends UserForm` inherits the alias's properties (`Full Name`), and so do intersections, references to a property (`UserForm.name`), union members and array items. As with any interface, the alias's type-level annotations are not inherited through `extends`.

## Entry Syntax

Each entry inside the annotate block references a property of the target type by name. Annotations placed before the entry are applied to that property.

```atscript
annotate User {
    @meta.label 'Name'        // annotation for the property
    name                       // property reference

    @ui.placeholder 'you@example.com'
    @expect.maxLength 100
    email                      // multiple annotations on one property
}
```

An entry without annotations does nothing. An entry the compiler cannot place (a path that does not exist, a path into a `never`) is an error, and the module is not generated until you fix it:

```atscript
annotate User {
    @meta.label 'Nickname'
    nickname              // Error: Unknown property "nickname" in "User"
}
```

### Deep Property Chains

For nested object properties, use dot notation:

```atscript
annotate User {
    @meta.label 'Street Address'
    address.street

    @meta.label 'City'
    address.city
}
```

This navigates into the nested `address` structure and annotates its `city` and `street` properties.

Two rules decide where a path lands.

**A path into another type is the referrer's own, at exactly that path.** The other type and its other uses are not annotated:

```atscript
interface Address {
    @meta.label 'City'
    @meta.description 'Where it is'
    city: string
    next?: Address
}

interface Client {
    home: Address
    billing: Address
}

annotate Client {
    @meta.label 'Home City'
    home.city
    @meta.label 'Billing City'
    billing.city
}
```

Only `Client.home.city` is labelled `'Home City'` and only `Client.billing.city` `'Billing City'`; `Address.city` and every other use of `Address` keep `'City'`. Each override sits on top of `Address.city`: it reads every other annotation from it, now and later (its description is `'Where it is'`, and a later `annotate Address { @meta.description 'x' city }` reaches it too), and on the same annotation the override wins.

The path is exact: `Client.home.next.city` is `Address.city` as it is. To annotate a deeper spot, write its path (`annotate Client { home.next.city }`), which overrides exactly that spot.

**A step that reaches the annotated type itself is the annotated type.** The annotation then lands on the type's own property, so it applies at every depth, the top level included. This holds when the step reaches the type through a direct reference, an alias, an array or `| null`, also through other types (mutual recursion):

```atscript
interface Node {
    name: string
    next?: Node
    kids?: Node[]
    parent?: Node | null
}

annotate Node {
    @meta.label 'x'
    next.name   // same as: name
}
```

`name`, `next.name`, `next.next.name`, `kids[0].name` and `parent.name` all carry it. With `interface Dept { title: string; lead?: Person }` and `interface Person { name: string; dept?: Dept }`, `annotate Dept { lead.dept.title }` is `annotate Dept { title }`.

It does **not** hold through a union with another type or through an intersection member. With `either?: Node | Other` and `merged?: Node & Meta`, `annotate Node { either.name }` and `annotate Node { merged.name }` are exact paths of `Node`: `Node.name` is not annotated.

**A path through a union** lands on every branch that has the property, as the referrer's own override. With `contact: Email | Phone | Fax` where `Email` and `Phone` have `value`, `annotate Contactable { contact.value }` annotates `value` in the `Email` and `Phone` branches and skips `Fax`. When no branch has the property (or no branch takes the whole path), it is an error.

Paths go through arrays like any other step: with `type BoxL = Box[]` and `boxes?: BoxL`, `annotate User { boxes.name }` overrides the `name` of `User`'s box elements.

## Top-level Annotations

Annotations placed before the `annotate` keyword apply to the type itself (not to individual properties):

```atscript
@meta.description 'User registration form'
annotate User as RegistrationForm {
    @meta.label 'Username'
    name
}
```

Their node type is the target's: an annotation whose spec applies to interfaces (`nodeType: ['interface']`) is valid on an `annotate` block of an interface (or of an alias of one), not on one of a `type`. A spec listing `'annotate'` itself is valid on any `annotate` block.

The same goes for a spec's `defType`: it checks the type the target resolves to (through type aliases and `annotate … as` aliases), exactly like the annotation written on the target's declaration. With `type Name = string`, `@expect.minLength 2` is valid on `annotate Name {}` and on `annotate Name as ShortName {}`, and `@expect.min 2` is reported there (`Expected type is (number), got "string"`).

For mutating annotate, top-level annotations modify the target's own metadata:

```atscript
@meta.description 'Admin user'
annotate User {
    @meta.label 'Admin Name'
    name
}
```

This sets `User.metadata.get("meta.description")` to `"Admin user"` at runtime.

For non-mutating annotate, top-level annotations on the alias replace the original's. Annotations from the original that are not overridden are carried over to the alias.

## Annotation Merging

When ad-hoc annotations target properties that already have annotations, the merge strategy determines how values combine.

### Replace Strategy (default)

For annotations with the default replace strategy, the ad-hoc annotation **replaces** the original:

```atscript
export interface User {
    @meta.label 'Original Name'
    name: string
}

annotate User {
    @meta.label 'Admin Name'    // Replaces 'Original Name'
    name
}
// Result: name's label is 'Admin Name'
```

For repeatable annotations (`multiple: true`) with replace strategy, the **entire set** is replaced:

```atscript
export interface Config {
    @tag 'alpha'
    @tag 'beta'
    feature: string
}

annotate Config {
    @tag 'production'           // Replaces both 'alpha' and 'beta'
    feature
}
// Result: feature's tags are ['production'], not ['alpha', 'beta', 'production']
```

::: info `@tag` is a user-registered annotation
`@tag` is not built in — it stands in for any custom repeatable annotation you register in `atscript.config`. See [Custom Annotations](/packages/typescript/custom-annotations) for how to define one.
:::

### Append Strategy

For annotations configured with `mergeStrategy: 'append'`, ad-hoc values are **added** to the existing ones:

```atscript
export interface User {
    @expect.pattern '^[A-Z]', 'u', 'Must start uppercase'
    name: string
}

annotate User {
    @expect.pattern '.{3,}', 'u', 'Min 3 chars'   // Added, not replaced
    name
}
// Result: both patterns are validated
```

### Two Blocks Setting the Same Annotation

When several blocks set the same single-value annotation on the same property (or on the type itself), the winner is decided by a fixed order, not by the order modules happen to load in. Blocks are ordered by:

1. **import depth** of their module: a module importing no `.as` file has depth 0, any other module one more than the deepest module it imports (modules importing each other share a depth);
2. **module id** (package name and path), for modules of the same depth;
3. **source order**, within a module.

The last block in that order wins.

```atscript
// user.as (depth 0)
export interface User {
    @meta.label 'Name'
    name: string
}

// labels-a.as (depth 1: imports user.as)
import { User } from './user'
annotate User {
    @meta.label 'Label A'
    name
}

// labels-b.as (depth 1)
import { User } from './user'
annotate User {
    @meta.label 'Label B'
    name
}

// profile.as (depth 1)
import { User } from './user'
export interface Profile {
    user: User
}

// app-labels.as (depth 2: imports profile.as)
import { User } from './user'
import { Profile } from './profile'
annotate User {
    @meta.label 'App label'
    name
}
```

Without `app-labels.as`, `User.name` is `'Label B'` (`labels-b.as` comes after `labels-a.as` by id) whichever of the two loads first. With it, `User.name` is `'App label'`: its module is deeper. Everything referring to `User` has that same value. The result is stable, but it is easy to misread: set each annotation in one place.

### Non-mutating Aliases

Non-mutating annotate creates a new type with annotations merged from the original. The original is not affected:

```atscript
@meta.description 'Base user'
export interface User {
    @meta.label 'Name'
    @tag 'core'
    name: string
}

export annotate User as AdminUser {
    @meta.label 'Admin Name'   // Replaces 'Name'
    @tag 'admin'               // Appends to ['core'] → ['core', 'admin']
    name
}
// User is unchanged. AdminUser has merged annotations.
```

### Removing an Annotation: `@annotate.reset`

Annotations merge: a block can replace a single-value annotation or append to a list, but it can't take one away. `@annotate.reset '<name>'` does that. It removes the annotation named by its argument (the full name, without `@`) from the node it's written on:

```atscript
type Login = string.email

export interface Account {
    @expect.pattern '^[A-Z]'
    name: string
    login: Login
    @meta.sensitive
    token: string
}

annotate Account {
    // the declared pattern is dropped; the block's own applies
    @annotate.reset 'expect.pattern'
    @expect.pattern '^[a-z]'
    name

    // the email pattern inherited from Login is dropped (Login keeps it)
    @annotate.reset 'expect.pattern'
    login
}

export annotate Account as PublicAccount {
    // only PublicAccount.token loses it; Account.token keeps it
    @annotate.reset 'meta.sensitive'
    token
}
```

What it removes, at that node: the value written on the field itself, the value the field gets from the type it references (`login: Login`, a primitive such as `string.email`), the value of the target in an `annotate … as` copy, and the values of lower-ranked blocks (see [Two Blocks Setting the Same Annotation](#two-blocks-setting-the-same-annotation)). For append annotations such as `@expect.pattern`, it removes every value collected so far.

- **Where it can be written:** only inside `annotate` blocks, mutating or `annotate … as`. It can go on an entry, which is a property or a property path such as `billing.city`, or at the top of the block, which targets the type itself. Anywhere else is a compile error.
- **The block's own value:** a value the same block writes for that annotation applies over the reset. A value from a higher-ranked block also applies.
- **Scope:** the reset follows the same rules as any other annotation in the block. In a mutating block it changes the target type, and everything that references the type sees the change. On a path through a referrer (`annotate Client { … billing.city }`), only `Client.billing.city` changes, and `Address.city` keeps its value. In an `annotate … as` copy, only the copy changes.
- **Validation and JSON Schema:** a reset `@expect.*` constraint is no longer checked by either validator engine, compiled or interpreted, and is left out of JSON Schema.
- **The node itself:** the reset applies to the node the entry names, not to what is inside it. On a field typed `Email | null` or `Email[]`, the pattern sits on the union branch or the array element, so resetting it on the field changes nothing: name the type itself instead (`annotate Email { … }` or an `as` copy). No warning is given for such a reset.
- **Several resets:** repeat the annotation, one name per line (`@annotate.reset 'meta.label'` and `@annotate.reset 'meta.description'`).
- **Unknown names** are reported like unknown annotations, following the `unknownAnnotation` setting. The editor completes annotation names inside the quotes.
- **Runtime `metadata.delete(key)`** on a node that resets `key` brings back the inherited value.

## Annotating Types

The examples above use `interface` targets, but ad-hoc annotations work equally well with `type` definitions.

### Primitive-based Types

For types based on primitives or primitive unions, use top-level annotations with an empty block:

```atscript
export type Username = string | number

// Mutating: adds a label to Username itself
@meta.label 'User Name'
annotate Username {}

// Non-mutating: creates a labeled alias
@meta.label 'Form Name'
export annotate Username as FormName {}
```

Since primitive types have no properties, the block body is empty — only top-level annotations apply.

### Union Types with Properties

For types that are unions of object structures, you can annotate properties by name. The compiler resolves each property across all union branches:

```atscript
type Response = {
    status: string
    data: string
} | {
    status: string
    error: string
}

annotate Response {
    @meta.label 'Status'
    status
}
```

When a property like `status` appears in multiple union branches, the annotation is applied to every branch that has it, including a branch that is a reference to an interface declaring the property or inheriting it with `extends` (there it is the union type's own override, as for [a path into another type](#deep-property-chains)). A branch without the property is left as it is.

Properties that don't exist in any branch are reported as errors:

```atscript
annotate Response {
    @meta.label 'Color'
    color              // Error: Unknown property "color" in "Response"
}
```

## Cross-file Usage

Ad-hoc annotations work with imported types. Import the target type, then annotate it:

```atscript
import { User } from './user'

// Mutating: modifies the imported User
annotate User {
    @meta.label 'Name'
    name
}

// Non-mutating: creates a local alias
export annotate User as AdminUser {
    @meta.label 'Admin Name'
    name
}
```

### When blocks apply

A block applies when its module is loaded. Two consequences:

- **Load annotate modules before their types are first used.** A path override (`annotate Client { home.city }`) from a module loaded later, for example through a lazy `import()`, is not seen by merges and readers that already read the type. Import the modules holding your blocks at startup, from the files declaring or using the types.
- **A block in a file the app never imports does not apply.** The compiler warns when a block of another file's type may be missed — neither the file declaring the type nor every file using it imports the block's file, directly or not: `"User" (declared in ./user.as) is used by ./api.as without importing this file (directly or not): this annotate applies only in builds including this file …`. Import the block's file from the type's file, or from every file using the type.

In development, the Vite plugin reloads the page in full when a module with blocks changes, so the blocks apply to fresh types (see [Build Setup](/packages/typescript/build-setup#how-it-works)).

A library built and published on its own has its merges built without your app's blocks: a path override you add to a member's type does not reach a merged property that several members of the library's merge declare. Annotate the library's merged type itself, or the property directly on the member type (`annotate Address { city }`), which every merge reads.

### Import cycles

`.as` files may import each other, directly or through other files. Such import cycles are supported only under native ES modules, which is what the compiler generates. A CommonJS rewrite of the generated code (a bundler or test runner converting it to `require`) works for `.as` modules that do not import each other; for a cycle, load the generated modules as ES modules.

The blocks of a cycle's modules apply in the [fixed order](#two-blocks-setting-the-same-annotation) like any others: modules of one cycle share an import depth and are ordered by id.

## Export Rules

Non-mutating annotate can be exported:

```atscript
export annotate User as UserForm { ... }
```

Mutating annotate **cannot** be exported (it modifies an existing type, not defines a new one):

```atscript
// Error: Cannot export mutating ad-hoc annotations block
export annotate User { ... }
```

## Tree-shaking

When using a bundler (Vite, Rollup, etc.) with `unplugin-atscript`, tree-shaking works automatically:

- **Mutating annotate** produces side effects (it writes into the target type when its module loads), so the plugin keeps a module with mutating blocks — and every module of an `.as` import cycle — in the bundle even when none of its exports is used
- **Non-mutating annotate** produces a standalone class. If `UserForm` is never imported by consuming code, the bundler removes it

The unplugin marks the other generated modules `moduleSideEffects: false` to enable this behavior.

## Generated Output

### Non-mutating

A non-mutating annotate generates a standalone class identical in structure to the target, with annotations merged:

```atscript
// user-form.as
import { User } from './user'

export annotate User as UserForm {
    @meta.label 'Form Name'
    name
}
```

The generated JS creates `UserForm` as its own class over `User`'s structure, with an override of `name` labelled `"Form Name"`; every other annotation is read from `User`.

### Mutating

A mutating annotate generates runtime mutation code that modifies the target's metadata directly:

```atscript
// admin.as
import { User } from './user'

annotate User {
    @meta.label 'Admin Name'
    name
    @meta.label 'Admin City'
    address.city
}
```

The generated code imports `User` and writes the annotations into its `name` property when the module loads, applying the annotation merge strategy (replace or append) for each annotation. `address.city` is a path into another type, so it gets `User`'s own override of `Address.city` (see [Deep Property Chains](#deep-property-chains)).
