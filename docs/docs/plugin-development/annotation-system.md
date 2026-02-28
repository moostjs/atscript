# Custom Annotations

Annotations are the metadata layer in Atscript — `@label "Name"`, `@expect.minLength 3`, `@db.table "users"`. Plugins can define custom annotations with typed arguments, validation logic, and even AST modification. Custom annotations get full IntelliSense, type checking, and flow into runtime metadata.

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

| Option          | Type                    | Default     | Description                                                                                        |
| --------------- | ----------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `description`   | `string`                | —           | Documentation shown in IntelliSense hover                                                          |
| `nodeType`      | `TNodeEntity[]`         | —           | Where annotation can appear: `'interface'`, `'type'`, `'prop'`                                     |
| `argument`      | `object \| object[]`    | —           | Argument definition(s)                                                                             |
| `multiple`      | `boolean`               | `false`     | Allow the annotation to appear more than once on the same node                                     |
| `mergeStrategy` | `'replace' \| 'append'` | `'replace'` | How values combine during annotation inheritance                                                   |
| `defType`       | `string[]`              | —           | Restrict to specific value types: `'string'`, `'number'`, `'boolean'`, `'array'`, `'object'`, etc. |
| `validate`      | `function`              | —           | Custom validation at parse time                                                                    |
| `modify`        | `function`              | —           | AST mutation after validation                                                                      |

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
  type: 'string' | 'number' | 'boolean'
  optional?: boolean
  description?: string
  values?: string[] // Enum — restrict to specific values
}
```

### No Arguments (Flag Annotation)

Omit `argument` entirely:

```typescript
new AnnotationSpec({
  description: 'Mark field as deprecated',
  nodeType: ['prop', 'interface'],
})
```

Usage: `@deprecated` (no arguments)

### Single Argument

Pass a single object:

```typescript
new AnnotationSpec({
  description: 'Display label for the field',
  argument: { name: 'text', type: 'string' },
})
```

Usage: `@label "Full Name"`

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
    @label "Base Name"
    name: string
}

annotate Base as Extended {
    @label "Extended Name"    // overwrites "Base Name"
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

### Example: Validate Collection ID Type

The MongoDB plugin's `@db.mongo.collection` validates that the `_id` field (if present) has the right type:

```typescript
new AnnotationSpec({
  nodeType: ['interface'],
  validate(token, args, doc) {
    const parent = token.parentNode
    if (!isInterface(parent) || !parent.props.has('_id')) {
      return // no _id field — nothing to validate
    }

    const errors = []
    const _id = parent.props.get('_id')!

    // Check _id is not optional
    if (_id.token('optional')) {
      errors.push({
        severity: 1,
        message: '_id cannot be optional in a MongoDB collection',
        range: _id.token('identifier')!.range,
      })
    }

    // Check _id is string or number
    const definition = _id.getDefinition()
    if (isRef(definition)) {
      const resolved = doc.unwindType(definition.id!, definition.chain)?.def
      if (isPrimitive(resolved) && !['string', 'number'].includes(resolved.config.type)) {
        errors.push({
          severity: 1,
          message: '_id must be of type string, number, or mongo.objectId',
          range: _id.token('identifier')!.range,
        })
      }
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

Available `defType` values: `'string'`, `'number'`, `'boolean'`, `'array'`, `'object'`, `'union'`, `'intersection'`.

## AST Modification with modify()

The `modify` hook runs after successful validation and can mutate the AST. This is a powerful feature for plugins that need to inject computed properties or restructure the parsed document.

```typescript
modify(mainToken: Token, args: Token[], doc: AtscriptDoc): void
```

### Example: Auto-Add \_id Property

The MongoDB plugin uses `modify` on `@db.mongo.collection` to automatically add an `_id` property when the interface doesn't already have one:

```typescript
new AnnotationSpec({
  nodeType: ['interface'],
  modify(token, args, doc) {
    const parent = token.parentNode
    const struc = parent?.getDefinition()
    if (isInterface(parent) && !parent.props.has('_id') && isStructure(struc)) {
      struc.addVirtualProp({
        name: '_id',
        type: 'mongo.objectId',
        documentation: 'MongoDB Primary Key ObjectId',
      })
    }
  },
})
```

Now every `@db.mongo.collection` interface automatically gets `_id: mongo.objectId` without the author writing it explicitly:

```atscript
@db.table "users"
@db.mongo.collection
export interface User {
    // _id: mongo.objectId — injected automatically
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
                expect: {
                  pattern: /^\d{4}-\d{2}-\d{2}$/,
                  message: 'Expected ISO date format (YYYY-MM-DD)',
                },
              },
              dateTime: {
                type: 'string',
                documentation: 'ISO 8601 date-time string (format: date-time)',
                tags: ['dateTime'],
                expect: {
                  pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
                  message: 'Expected ISO date-time format',
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
    @label "Email Address"
    @openapi.example "user@example.com"
    email: string.email

    @label "Full Name"
    @openapi.example "Jane Doe"
    name: string.required

    @label "Date of Birth"
    @openapi.example "1990-01-15"
    birthday?: openapi.date
}
```

## Next Steps

- [Building a Code Generator](/plugin-development/code-generation) — generate output files that consume your annotations and primitives
- [Plugin Hooks Reference](/plugin-development/plugin-hooks) — all six hooks in detail
