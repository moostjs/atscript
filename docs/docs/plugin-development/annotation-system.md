# Custom Annotations

Annotations are the metadata layer in Atscript. They can carry labels, validation rules, API hints, UI hints, or any other model-level information your plugin needs.

For a first plugin, you usually only need:

- a name
- a `nodeType`
- zero or more typed arguments

Start there. Validation callbacks, merge strategies, and AST mutation are useful later, but they are not required for a useful first annotation.

## The AnnotationSpec Class

Every annotation is defined by an `AnnotationSpec` instance:

```typescript
import { AnnotationSpec } from '@atscript/core'

new AnnotationSpec({
  description: 'Mark field as searchable',
  nodeType: ['prop'],
  argument: { name: 'weight', type: 'number', optional: true },
  multiple: false,
  mergeStrategy: 'replace',
})
```

### TAnnotationSpecConfig Options

| Option               | Type                    | Default     | Description                                                                                                                      |
| -------------------- | ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `description`        | `string`                | —           | Documentation shown in IntelliSense hover                                                                                        |
| `nodeType`           | `TNodeEntity[]`         | —           | Where annotation can appear: `'interface'`, `'type'`, `'prop'`                                                                   |
| `argument`           | `object \| object[]`    | —           | Argument definition(s)                                                                                                           |
| `multiple`           | `boolean`               | `false`     | Allow the annotation to appear more than once on the same node                                                                   |
| `mergeStrategy`      | `'replace' \| 'append'` | `'replace'` | How values combine during annotation inheritance                                                                                 |
| `passedWhenReferred` | `boolean`               | `true`      | Whether fields referencing the annotated node inherit this annotation. See [Ref boundaries](#ref-boundaries-passedwhenreferred). |
| `defType`            | `string[]`              | —           | Restrict to specific value types. See [Available `defType` values](#simple-alternative-deftype).                                 |
| `validate`           | `function`              | —           | Custom validation at parse time                                                                                                  |
| `modify`             | `function`              | —           | AST mutation after validation                                                                                                    |

### Type references inside inherited annotations (since 0.1.100)

A `ref` argument, and the type part of a qualified `Type.field` in a `query` / `expr` / `order` argument, names a type that is imported in the file **declaring** the annotation. When the annotation is inherited into another file — through a chain ref (`color: Ticket.color`) or `extends` — the generated JavaScript for that file adds the missing import itself (aliased `Name_1` if the name clashes with a local declaration), so the argument's getter (`target: () => Dict`) never throws `ReferenceError`. Plugins do not need to do anything; this applies to every annotation whose spec has `passedWhenReferred: true` (the default).

## Registering Annotations via config()

Annotations are registered in a nested tree structure. The tree path becomes the dot-notation name:

```typescript
import { createAtscriptPlugin, AnnotationSpec } from '@atscript/core'

export const apiPlugin = () =>
  createAtscriptPlugin({
    name: 'api',
    config() {
      return {
        annotations: {
          api: {
            // @api.* namespace
            endpoint: new AnnotationSpec({
              // @api.endpoint
              description: 'REST endpoint for this interface',
              nodeType: ['interface'],
              argument: { name: 'path', type: 'string' },
            }),
            method: new AnnotationSpec({
              // @api.method
              description: 'HTTP method',
              nodeType: ['interface'],
              argument: {
                name: 'method',
                type: 'string',
                values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
              },
            }),
            field: {
              // @api.field.* sub-namespace
              readonly: new AnnotationSpec({
                // @api.field.readonly
                description: 'Field is read-only in API responses',
                nodeType: ['prop'],
              }),
              writeOnly: new AnnotationSpec({
                // @api.field.writeOnly
                description: 'Field is accepted in requests but excluded from responses',
                nodeType: ['prop'],
              }),
            },
          },
        },
      }
    },
  })
```

The nesting depth is arbitrary — `@api.field.readonly` comes from `annotations.api.field.readonly`.

## Annotation Arguments

Each argument is defined with `TAnnotationArgument`:

```typescript
interface TAnnotationArgument {
  name: string
  type: 'string' | 'number' | 'boolean' | 'ref' | 'query' | 'expr' | 'order'
  optional?: boolean
  description?: string
  values?: string[] // Enum — restrict to specific values
  // Editor (LSP) hooks — see "Editor Support for Arguments" below
  fieldScope?: (argToken: Token, doc: AtscriptDoc) => TQueryScope | undefined // backtick / 'string' args
  refFilter?: (decl: SemanticNode, doc: AtscriptDoc) => boolean // 'ref' args
  valueScope?: (annotationToken: Token, doc: AtscriptDoc) => TValueCandidate[] | undefined // 'string' / 'number' args
}
```

The argument types correspond to the tokens accepted in `.as` source:

| `type`      | Accepts                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `'string'`  | Quoted string literal (`"text"`)                                                    |
| `'number'`  | Numeric literal (`42`, `-1.5`)                                                      |
| `'boolean'` | Identifier `true` / `false`                                                         |
| `'ref'`     | Bare identifier referencing another type (e.g. `User`)                              |
| `'query'`   | Backtick-delimited query expression — used by DB plugins for SQL-like filter syntax |
| `'expr'`    | Backtick-delimited arithmetic expression (since 0.1.99)                             |
| `'order'`   | Backtick-delimited ordering — field refs with `asc` / `desc` (since 0.1.99)         |

Query expressions accept the comparison operators `=`, `!=`, `>`, `>=`, `<`, `<=` at any nesting level, including inside parentheses (since 0.1.90) — e.g. `` `A.at >= B.start and (B.end = null or A.at <= B.end)` ``.

### Expression and Order Arguments

Since 0.1.99 a backtick argument is parsed by the grammar of its spec `type`; a backtick in a position without a spec (unknown annotation, extra argument) keeps the query grammar.

| `type`    | Grammar                                                                                                                                                                             | Example                                    | Runtime value (`metadata.get(...)`)                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `'expr'`  | `+ - * /`, unary `-`, parentheses, numeric literals, `coalesce(a, b, …)` (2+ args), field refs (`field`, `Type.field`). No comparisons, strings, booleans, `null`, other functions. | `` `openCount * 10 + coalesce(rank, 0)` `` | `AtscriptExprNode`: a number, a field ref `{ field, type? }`, or `{ op, args }` with `op` ∈ `+ - * / neg coalesce` |
| `'order'` | `key (asc \| desc)?, …` — each key a field ref, `asc` by default                                                                                                                    | `` `raisedAt desc, id` ``                  | `AtscriptOrderItem[]`: `[{ ref: { field, type? }, desc?: true }]`                                                  |

```typescript
import { AnnotationSpec } from '@atscript/core'
import type { AtscriptExprNode, AtscriptOrderItem } from '@atscript/typescript/utils'

export const reportAnnotations = {
  score: new AnnotationSpec({
    nodeType: ['prop'],
    argument: { name: 'expression', type: 'expr' },
  }),
  sort: new AnnotationSpec({
    nodeType: ['interface'],
    argument: { name: 'order', type: 'order' },
  }),
}

// at runtime
const expr = Report.type.props.get('score')?.metadata.get('report.score') as AtscriptExprNode
const order = Report.metadata.get('report.sort') as AtscriptOrderItem[]
```

- Syntax errors are reported by core at the offending token; checking that the referenced fields exist and have the right types is the plugin's job (`validate`).
- `a -5` and `a+1` parse as `a - 5` / `a + 1`; `-5` alone is a negative literal.
- `/` is division inside backticks. A regexp literal is recognized only after `matches`, with or without a space (`name matches /^a/i`, `name matches/^a/i`); since 0.1.99 `field = /x/` no longer lexes as a regexp.
- Number literals in `expr` must be finite, must not underflow to `0` (`1e-400`), and must stay within ±`Number.MAX_SAFE_INTEGER` (`2^53 - 1`); otherwise core reports an error at the literal.
- `fieldScope` works for both types exactly as for `query` (completion, hover, go-to-definition, references, rename); the editor completes `coalesce(`, operators, and `asc` / `desc` by position.
- The generated `atscript.d.ts` types these arguments as `AtscriptExprNode` / `AtscriptOrderItem[]`.

### No Arguments (Flag Annotation)

Omit `argument` entirely:

```typescript
new AnnotationSpec({
  description: 'Mark field as deprecated',
  nodeType: ['prop', 'interface'],
})
```

Usage: `@api.deprecated` (no arguments)

### Single Argument

Pass a single object:

```typescript
new AnnotationSpec({
  description: 'Display label for the field',
  argument: { name: 'text', type: 'string' },
})
```

Usage: `@meta.label "Full Name"`

### Multiple Arguments

Pass an array of objects. Arguments are positional:

```typescript
new AnnotationSpec({
  description: 'Vector search index',
  argument: [
    { name: 'dimensions', type: 'number' },
    {
      name: 'similarity',
      type: 'string',
      optional: true,
      values: ['cosine', 'euclidean', 'dotProduct'],
    },
    { name: 'indexName', type: 'string', optional: true },
  ],
})
```

Usage: `@search.vector 512, "cosine", "my-index"`

### Enum Values

The `values` field restricts which strings are accepted — the compiler reports an error for any other value:

```typescript
new AnnotationSpec({
  argument: {
    name: 'strategy',
    type: 'string',
    values: ['replace', 'merge'],
  },
})
```

Usage: `@patch.strategy "replace"` (accepted) vs `@patch.strategy "upsert"` (error)

### Editor Support for Arguments

Arguments that point at types or fields can tell the VSCode extension what they point at. The editor then offers completion, hover, go-to-definition, find-references and rename inside the argument. The hooks only drive editor features — they don't validate anything, so keep checks in [`validate`](#custom-validation).

| Hook         | Argument `type`                | Returns                                                        | Enables                                                                                                                                                                                                          |
| ------------ | ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fieldScope` | `'query'`, `'expr'`, `'order'` | `{ allowedTypes, unqualifiedTarget }` (`TQueryScope`)          | Field/type completion, hover, go-to-definition, find-references and rename inside the backticks                                                                                                                  |
| `fieldScope` | `'string'`                     | `{ allowedTypes, unqualifiedTarget }` (`TQueryScope`)          | The string is a field path of `unqualifiedTarget` (`'amount'`, `'address.city'`): field completion level by level, hover, go-to-definition, and every segment shows up in its field's find-references and rename |
| `valueScope` | `'string'`, `'number'`         | `TValueCandidate[]` (`{ value, definition?, documentation? }`) | The argument names one of a closed set of values declared elsewhere in the document (the literals of the annotated union, say): completion offers them, go-to-definition on the argument jumps to `definition`   |
| `refFilter`  | `'ref'`                        | `boolean`                                                      | Narrows the type names offered by completion                                                                                                                                                                     |

`fieldScope` receives the argument token and the document holding it. The annotated node is `argToken.parentNode`; its sibling annotations are on `argToken.parentNode.annotations`. `getSiblingAnnotation(argToken)` (from `@atscript/core`) returns the annotation the argument belongs to, so `getSiblingAnnotation(argToken)?.args[0]?.text` reads the sibling argument that scopes the others. Return `undefined` when the scope can't be determined — the editor then offers nothing rather than guessing.

`valueScope` receives the annotation's main token (`annotationToken.parentNode` is the annotated node) and the document holding it. It is advisory: it drives the editor, it does not validate. `TValueCandidate.definition` is `{ doc, token }` of the declaring token, in the document that declares it.

`refFilter` receives each candidate declaration (interface or type node) and the document that **declares** it, so `doc.unwindType(...)` resolves names from the declaration's own imports.

**Sibling-scoped arguments (since 0.1.100).** An annotation with several arguments can scope a later one by an earlier one. For example, in `` @binding Order, 'amount', `amount > 5` `` the first argument (a `ref`) is the type that the `'amount'` string and the backtick filter refer to. In the hook, find the annotation with `argToken.parentNode.annotations.find(a => a.args.includes(argToken))` and read `args[0].text`; return `undefined` when that argument is missing or not an identifier. The same hooks work for annotations written in an `annotate` block entry. Go-to-definition on a `ref` argument (`Order`) jumps to the type's declaration, including across imports.

**Introspecting the annotated field: `annotatedDefinition()`.** A `validate` hook that needs the type of the field an annotation sits on must not read `node.getDefinition()` directly, because inside an `annotate` block the annotated node is an entry that only names a property. `doc.annotatedDefinition(node)` returns `{ def, doc }` for both forms: the node's own definition for an inline prop or type declaration, or the type of the target property an annotate-block entry names (`annotate Host { @x.y name }` gives the type of `Host.name`, including nested entries such as `addr.status`). `doc` is the document that declares `def`, which may be another file, so resolve names from `def` through that document. It returns `undefined` when the node has no definition or the entry does not resolve.

```typescript
import { AnnotationSpec, isInterface } from '@atscript/core'
import type { SemanticNode, Token } from '@atscript/core'

/** Type named by `@report.source` on the annotated interface */
function sourceOf(argToken: Token): string | undefined {
  const owner = argToken.parentNode
  return owner?.annotations?.find(a => a.name === 'report.source')?.args[0]?.text
}

const isStored = (decl: SemanticNode) =>
  isInterface(decl) && !!decl.annotations?.some(a => a.name === 'report.stored')

export const reportAnnotations = {
  source: new AnnotationSpec({
    nodeType: ['interface'],
    argument: { name: 'type', type: 'ref', refFilter: isStored },
  }),
  where: new AnnotationSpec({
    nodeType: ['interface'],
    argument: {
      name: 'condition',
      type: 'query',
      fieldScope: argToken => {
        const source = sourceOf(argToken)
        return source ? { allowedTypes: [source], unqualifiedTarget: source } : undefined
      },
    },
  }),
  total: new AnnotationSpec({
    nodeType: ['interface'],
    argument: {
      name: 'field',
      type: 'string',
      fieldScope: argToken => {
        const source = sourceOf(argToken)
        return source ? { allowedTypes: [], unqualifiedTarget: source } : undefined
      },
    },
  }),
}
```

```atscript
// completion after `@report.source` offers only @report.stored interfaces
@report.source Order
// `status` completes, hovers and jumps to Order.status
@report.where `status = 'paid'`
// `amount` completes, hovers and jumps to Order.amount
@report.total 'amount'
interface PaidOrders {}
```

- `unqualifiedTarget` is the type a bare `field` resolves against; `allowedTypes` lists the types a qualified `Type.field` may name. Set `unqualifiedTarget: null` to require qualified refs.
- A `string` argument's path is never qualified: it always resolves against `unqualifiedTarget`, and `allowedTypes` is ignored.
- Hooks run on every editor request — keep them to cheap lookups on the syntax tree (sibling annotations, `doc.unwindType`).
- A hook's answer is final: for an argument with `fieldScope`, the editor never falls back to anything else.
- Without hooks: `string` arguments complete only their `values`, `ref` arguments complete every declared type (no primitives), and `query` arguments get no field scope apart from the deprecated built-ins below.

::: info Built-in `@db.*` rules (deprecated)
`@atscript/core` still carries built-in query scopes for `@db.view.filter`, `@db.view.joins` and `@db.rel.filter`, used only when the argument declares no `fieldScope`. They will be removed in the next minor — plugins should declare `fieldScope` themselves.
:::

## Merge Strategies

When annotations are inherited through type references, the merge strategy controls how values combine:

### `'replace'` (Default)

The annotation on the child/inner type overwrites the parent's:

```typescript
new AnnotationSpec({
  mergeStrategy: 'replace', // default
  argument: { name: 'value', type: 'string' },
})
```

```atscript
interface Base {
    @meta.label "Base Name"
    name: string
}

annotate Base as Extended {
    @meta.label "Extended Name"    // overwrites "Base Name"
    name
}
```

### `'append'`

Values accumulate — both parent and child annotations are preserved as an array:

```typescript
new AnnotationSpec({
  multiple: true,
  mergeStrategy: 'append',
  argument: { name: 'tag', type: 'string' },
})
```

```atscript
interface Base {
    @tag "searchable"
    name: string
}

annotate Base as Tagged {
    @tag "sortable"           // both "searchable" and "sortable" are kept
    name
}
```

::: tip
`mergeStrategy: 'append'` almost always pairs with `multiple: true` — otherwise the base annotation would error on duplicates.
:::

Across a ref (`status: Status`, `ownerId: User.id`) the emitted runtime metadata lists the referenced type's entries first, then the referring prop's own, in source order within each group. A consumer that folds the entries into a map (last entry wins) therefore lets the prop's own entry override the type's entry for the same key. Since 0.1.100.

## Ref Boundaries (`passedWhenReferred`)

When a field references another declaration's field (`ownerId: User.id`, directly or through intermediate refs), the referenced field's annotations fold into the referring field — merged nearest-first, so precedence is: local declaration → nearest ref → deeper refs → resolved type.

That inheritance is right for annotations that describe the **value or its presentation** (labels, validation constraints, UI hints) and wrong for annotations that describe the **declaring scope itself** — a database index, a storage option, a primary-key marker. `passedWhenReferred: false` opts an annotation out of crossing ref boundaries:

```typescript
new AnnotationSpec({
  description: 'Unique index on this column',
  nodeType: ['prop'],
  multiple: true,
  mergeStrategy: 'append',
  passedWhenReferred: false, // an index on User.id must not follow refs into other tables
})
```

Rules:

- Applies **only** at ref boundaries. `extends` and intersection merging always inherit the full annotation set — the child owns the inherited props.
- Default is `true`: value/presentation annotations travel with the field they describe.
- Built-in specs that declare `false`: `@meta.id`, `@meta.required`, `@meta.default`, `@meta.readonly` — a field referencing a primary key is not itself a primary key, and requiredness/defaults/mutability are the referring declaration's own contract.

## Custom Validation

For validation logic beyond type checks and argument counts, provide a `validate` function:

```typescript
validate(mainToken: Token, args: Token[], doc: AtscriptDoc): TMessages | undefined
```

| Parameter   | Description                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| `mainToken` | The annotation token (e.g., `@api.endpoint`). Access the parent node via `mainToken.parentNode`.          |
| `args`      | Array of argument tokens. Each has `.text` (raw value), `.type` (token type), `.range` (source location). |
| `doc`       | The `AtscriptDoc` instance for resolving types and querying the document.                                 |

Return an array of diagnostic messages, or `undefined` if valid:

```typescript
interface TMessage {
  severity: 1 | 2 | 3 | 4 // 1=Error, 2=Warning, 3=Info, 4=Hint
  message: string
  range: { start: Position; end: Position }
}
```

::: tip
Built-in validation runs before your `validate` callback. The `AnnotationSpec` class automatically checks `multiple`, `nodeType`, argument count, argument types, `values`, and `defType`. Your callback only needs to handle domain-specific logic.
:::

### Example: Validate a Required Sibling Property

A `@store.collection` annotation that requires an `id` field of type `string` or `number`:

```typescript
new AnnotationSpec({
  nodeType: ['interface'],
  validate(token, args, doc) {
    const parent = token.parentNode
    if (!isInterface(parent) || !parent.props.has('id')) {
      return [
        {
          severity: 1,
          message: '@store.collection requires an "id" property',
          range: token.range,
        },
      ]
    }

    const errors = []
    const idProp = parent.props.get('id')!

    if (idProp.token('optional')) {
      errors.push({
        severity: 1,
        message: '"id" cannot be optional on a @store.collection',
        range: idProp.token('identifier')!.range,
      })
    }

    // Resolve the property type and check it is string or number
    let def = idProp.getDefinition()
    if (isRef(def)) {
      def = doc.unwindType(def.id!, def.chain)?.def || def
    }
    if (isPrimitive(def) && !['string', 'number'].includes(def.type!)) {
      errors.push({
        severity: 1,
        message: '"id" must be of type string or number',
        range: idProp.token('identifier')!.range,
      })
    }

    return errors.length > 0 ? errors : undefined
  },
})
```

### Example: Validate Field Type

Restrict an annotation to object or array fields:

```typescript
new AnnotationSpec({
  nodeType: ['prop'],
  argument: {
    name: 'strategy',
    type: 'string',
    values: ['replace', 'merge'],
  },
  validate(token, args, doc) {
    const field = token.parentNode!
    const definition = field.getDefinition()
    if (!definition) return

    // Resolve references
    let def = definition
    if (isRef(def)) {
      def = doc.unwindType(def.id!, def.chain)?.def || def
    }

    if (!isStructure(def) && !isInterface(def) && !isArray(def)) {
      return [
        {
          severity: 1,
          message: 'Patch strategy requires an object or array type',
          range: token.range,
        },
      ]
    }
  },
})
```

### Simple Alternative: defType

For basic type restrictions, use `defType` instead of a full `validate` function:

```typescript
new AnnotationSpec({
  description: 'Decimal precision for numeric display',
  defType: ['number'], // only valid on number fields
  argument: { name: 'digits', type: 'number' },
})
```

Available `defType` values:

- Final scalar kinds: `'string'`, `'number'`, `'boolean'`, `'decimal'`, `'phantom'`, `'null'`, `'void'`, `'never'`
- Composite kinds: `'object'`, `'array'`, `'union'`, `'intersection'`

`'object'` matches both interfaces and inline structures; `'union'` / `'intersection'` match group nodes.

A nullable union also passes the `defType` check when every member other than `null` / `undefined` matches (since 0.1.103): `defType: ['number']` accepts `number | null`, `number.int | undefined` and an alias `type N = number | null`. Mixed unions (`number | string`) are still rejected.

To give a custom `validate` hook the same behavior, use `nonNullishMembers(def, doc)` from `@atscript/core`. It returns the resolved non-null members of a union (nested unions and aliases flattened), or `undefined` when `def` is not a union:

```typescript
import { AnnotationSpec, isArray, isRef, nonNullishMembers } from '@atscript/core'

new AnnotationSpec({
  validate(token, args, doc) {
    let def = token.parentNode!.getDefinition()
    let defDoc = doc
    if (isRef(def)) {
      const unwound = doc.unwindType(def.id!, def.chain)
      def = unwound?.def
      defDoc = unwound?.doc || doc
    }
    const members = nonNullishMembers(def, defDoc)
    const ok = members ? members.length > 0 && members.every(isArray) : isArray(def)
    return ok ? [] : [{ severity: 1, message: 'Requires an array field', range: token.range }]
  },
})
```

Pass the document the union is declared in (the `doc` returned by `unwindType`), so member refs resolve.

## AST Modification with modify()

The `modify` hook runs after successful validation and can mutate the AST. This is a powerful feature for plugins that need to inject computed properties or restructure the parsed document.

```typescript
modify(mainToken: Token, args: Token[], doc: AtscriptDoc): void
```

### Example: Auto-Add an ID Property

An `@store.collection` annotation that automatically adds an `id` property when the interface doesn't already have one:

```typescript
new AnnotationSpec({
  nodeType: ['interface'],
  modify(token, args, doc) {
    const parent = token.parentNode
    const struc = parent?.getDefinition()
    if (isInterface(parent) && !parent.props.has('id') && isStructure(struc)) {
      struc.addVirtualProp({
        name: 'id',
        type: 'string',
        documentation: 'Primary identifier',
      })
    }
  },
})
```

Now every `@store.collection` interface automatically gets `id: string` without the author writing it explicitly:

```atscript
@store.collection "users"
export interface User {
    // id: string — injected automatically
    email: string.email
    name: string
}
```

### Example: Inject Timestamp Fields

A plugin that auto-adds created/updated timestamps:

```typescript
new AnnotationSpec({
  description: 'Automatically add timestamp fields',
  nodeType: ['interface'],
  modify(token, args, doc) {
    const parent = token.parentNode
    const struc = parent?.getDefinition()
    if (isInterface(parent) && isStructure(struc)) {
      if (!parent.props.has('createdAt')) {
        struc.addVirtualProp({
          name: 'createdAt',
          type: 'number.timestamp',
          documentation: 'Creation timestamp',
        })
      }
      if (!parent.props.has('updatedAt')) {
        struc.addVirtualProp({
          name: 'updatedAt',
          type: 'number.timestamp',
          documentation: 'Last update timestamp',
        })
      }
    }
  },
})
```

::: tip
`modify` runs once per annotation occurrence. If `multiple: true` and the annotation appears twice, `modify` runs twice. Make sure your modifications are idempotent (check before adding).
:::

## Complete Plugin Example

Here's a full plugin combining primitives and annotations for an API documentation system:

```typescript
import { createAtscriptPlugin, AnnotationSpec, isInterface } from '@atscript/core'

export const openApiPlugin = () =>
  createAtscriptPlugin({
    name: 'openapi',
    config() {
      return {
        primitives: {
          openapi: {
            extensions: {
              date: {
                type: 'string',
                documentation: 'ISO 8601 date string (format: date)',
                tags: ['date'],
                annotations: {
                  'expect.pattern': {
                    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                    message: 'Expected ISO date format (YYYY-MM-DD)',
                  },
                },
              },
              dateTime: {
                type: 'string',
                documentation: 'ISO 8601 date-time string (format: date-time)',
                tags: ['dateTime'],
                annotations: {
                  'expect.pattern': {
                    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
                    message: 'Expected ISO date-time format',
                  },
                },
              },
            },
          },
        },
        annotations: {
          openapi: {
            schema: new AnnotationSpec({
              description: 'OpenAPI schema name for this interface',
              nodeType: ['interface'],
              argument: { name: 'name', type: 'string', optional: true },
            }),
            tag: new AnnotationSpec({
              description: 'OpenAPI tag for grouping endpoints',
              nodeType: ['interface'],
              multiple: true,
              mergeStrategy: 'append',
              argument: { name: 'tag', type: 'string' },
            }),
            deprecated: new AnnotationSpec({
              description: 'Mark as deprecated in OpenAPI spec',
              nodeType: ['prop', 'interface'],
            }),
            example: new AnnotationSpec({
              description: 'Example value for OpenAPI documentation',
              nodeType: ['prop'],
              argument: { name: 'value', type: 'string' },
            }),
          },
        },
      }
    },
  })
```

Usage in `.as` files:

```atscript
@openapi.schema "CreateUserRequest"
@openapi.tag "users"
export interface CreateUser {
    @meta.label "Email Address"
    @openapi.example "user@example.com"
    email: string.email

    @meta.label "Full Name"
    @openapi.example "Jane Doe"
    name: string.required

    @meta.label "Date of Birth"
    @openapi.example "1990-01-15"
    birthday?: openapi.date
}
```

## Next Steps

- [Building a Code Generator](/plugin-development/code-generation) — generate output files that consume your annotations and primitives
- [Plugin Hooks Reference](/plugin-development/plugin-hooks) — all six hooks in detail
