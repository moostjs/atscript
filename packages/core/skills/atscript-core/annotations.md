# Annotations Reference — @atscript/core

> Complete reference for all built-in annotations and the `AnnotationSpec` API for defining custom ones.

## Built-in Annotation Namespaces

### `@meta.*` — Semantic Metadata

| Annotation            | Arguments            | Multiple | NodeType         | Description                                                |
| --------------------- | -------------------- | -------- | ---------------- | ---------------------------------------------------------- |
| `@meta.label`         | `text: string`       | no       | any              | Human-readable label for UI, logs, documentation           |
| `@meta.id`            | _(none)_             | no       | prop             | Mark field as unique identifier; multiple = composite PK   |
| `@meta.description`   | `text: string`       | no       | any              | Detailed description                                       |
| `@meta.documentation` | `text: string`       | **yes**  | any              | Multi-line Markdown docs (each appends a line)             |
| `@meta.sensitive`     | _(none)_             | no       | prop, type       | Sensitive data (passwords, keys) — hidden in logs/UI       |
| `@meta.readonly`      | _(none)_             | no       | prop, type       | Read-only field                                            |
| `@meta.required`      | `message?: string`   | no       | string, boolean  | Required: strings must be non-whitespace; booleans `true`  |
| `@meta.default`       | `value: string`      | no       | prop, type       | Default value (strings as-is, others parsed as JSON)       |
| `@meta.example`       | `value: string`      | no       | prop, type       | Example value (strings as-is, others parsed as JSON)       |

### `@expect.*` — Validation Constraints

| Annotation          | Arguments                                               | Multiple | Applies To    | Description                 |
| ------------------- | ------------------------------------------------------- | -------- | ------------- | --------------------------- |
| `@expect.minLength` | `length: number`, `message?: string`                    | no       | string, array | Minimum length              |
| `@expect.maxLength` | `length: number`, `message?: string`                    | no       | string, array | Maximum length              |
| `@expect.min`       | `minValue: number`, `message?: string`                  | no       | number        | Minimum value               |
| `@expect.max`       | `maxValue: number`, `message?: string`                  | no       | number        | Maximum value               |
| `@expect.int`       | _(none)_                                                | no       | number        | Must be integer             |
| `@expect.pattern`   | `pattern: string`, `flags?: string`, `message?: string` | **yes** (append) | string | Regex validation     |
| `@expect.array.key` | _(none)_                                                | no       | string, number | Key field in arrays         |

### `@ui.*` — UI / Presentation Hints

| Annotation        | Arguments                      | Multiple        | NodeType                | Description                              |
| ----------------- | ------------------------------ | --------------- | ----------------------- | ---------------------------------------- |
| `@ui.placeholder` | `text: string`                 | no              | prop, type              | Input placeholder text                   |
| `@ui.component`   | `name: string`                 | no              | prop, type              | UI component hint (`"select"`, etc.)     |
| `@ui.hidden`      | _(none)_                       | no              | prop, type, interface   | Hide from UI forms/tables                |
| `@ui.group`       | `name: string`                 | no              | prop                    | Group fields into form sections          |
| `@ui.order`       | `order: number`                | no              | prop                    | Display order (lower = first)            |
| `@ui.width`       | `width: string`                | no              | prop, type              | Layout hint (`"half"`, `"full"`, etc.)   |
| `@ui.icon`        | `name: string`                 | no              | prop, type, interface   | Icon hint                                |
| `@ui.hint`        | `text: string`                 | no              | prop, type              | Help text / tooltip                      |
| `@ui.disabled`    | _(none)_                       | no              | prop, type              | Non-interactive field                    |
| `@ui.type`        | `type: string`                 | no              | prop, type              | Input type (`"textarea"`, `"password"`)  |
| `@ui.attr`        | `key: string`, `value: string` | **yes** (append) | prop, type, interface  | Arbitrary HTML/component attribute       |
| `@ui.class`       | `names: string`                | **yes** (append) | prop, type, interface  | CSS class names                          |
| `@ui.style`       | `css: string`                  | **yes** (append) | prop, type, interface  | Inline CSS styles                        |

### `@db.*` — Database Schema

| Annotation          | Arguments                    | Multiple        | NodeType  | Description                              |
| ------------------- | ---------------------------- | --------------- | --------- | ---------------------------------------- |
| `@db.table`         | `name: string \| true`       | no              | interface | Database table/collection name           |
| `@db.schema`        | `name: string`               | no              | interface | Database schema (PostgreSQL, etc.)       |
| `@db.index.plain`   | `name?: string`, `sort?: string` | **yes** (append) | prop  | Standard index (shared name = compound)  |
| `@db.index.unique`  | `name?: string`              | **yes** (append) | prop      | Unique constraint index                  |
| `@db.index.fulltext`| `name?: string`              | **yes** (append) | prop      | Fulltext search index                    |
| `@db.column`        | `name: string`               | no              | prop      | Override database column name            |
| `@db.default.value` | `value: string`              | no              | prop      | Static default value                     |
| `@db.default.fn`    | `fn: string`                 | no              | prop      | Database function for default            |
| `@db.ignore`        | _(none)_                     | no              | prop      | Exclude field from database              |

### `@emit.*` — Build-time Directives

| Annotation         | NodeType  | Description                                     |
| ------------------ | --------- | ----------------------------------------------- |
| `@emit.jsonSchema` | interface | Pre-compute and embed JSON Schema at build time |

## Custom Annotations

Define in `atscript.config.ts` under the `annotations` key:

```ts
import { defineConfig, AnnotationSpec } from '@atscript/core'

export default defineConfig({
  annotations: {
    // Flat: @tag "value"
    tag: new AnnotationSpec({
      multiple: true,
      mergeStrategy: 'append',
      argument: { name: 'value', type: 'string' },
      description: 'Tag for categorization',
    }),

    // Namespaced: @api.deprecated "Use v2 instead"
    api: {
      deprecated: new AnnotationSpec({
        argument: { name: 'message', type: 'string', optional: true },
        nodeType: ['prop', 'interface'],
        description: 'Mark as deprecated',
      }),
    },
  },
})
```

### `AnnotationSpec` Options

```ts
new AnnotationSpec({
  description?: string,          // IntelliSense hover text
  nodeType?: ('interface' | 'type' | 'prop')[],  // Where it can be applied
  defType?: string[],            // Restrict to value types: 'string', 'number', etc.

  // Arguments
  argument?: TAnnotationArgument | TAnnotationArgument[],
  // Each: { name, type: 'string'|'number'|'boolean', optional?, description?, values? }

  // Multiplicity
  multiple?: boolean,            // Can appear more than once (default: false)
  mergeStrategy?: 'replace' | 'append',  // How values merge on inheritance (default: 'replace')

  // Advanced
  validate?: (mainToken, args, doc) => TMessages | undefined,  // Custom validation
  modify?: (mainToken, args, doc) => void,  // AST modification after parsing
})
```

### How Annotations Map to Runtime Values

| Config                          | Metadata value type          |
| ------------------------------- | ---------------------------- |
| No arguments                    | `true` (boolean flag)        |
| Single argument                 | The argument value directly  |
| Multiple named arguments        | `{ name1: val1, name2: val2 }` |
| `multiple: true`                | Array of the above           |
| `multiple: true` + `append`     | Concatenated array on merge  |

### Merge Strategies

When annotations inherit (type → prop, ad-hoc annotate blocks):

- **replace** (default) — higher-priority annotation replaces lower entirely
- **append** — values from both sides concatenate into a single array

## Annotation Resolution

```ts
import { resolveAnnotation } from '@atscript/core'

// Looks up 'ui.placeholder' in the annotation tree
const spec = resolveAnnotation('ui.placeholder', config.annotations)
// Returns AnnotationSpec or undefined
```

The function splits the dotted name and walks the `TAnnotationsTree` hierarchy.

## Best Practices

- Use namespaced annotations (`@ns.name`) to avoid collisions
- Set `nodeType` to catch misuse early (e.g., `@db.table` only on interfaces)
- Use `mergeStrategy: 'append'` for annotations that accumulate (patterns, tags, styles)
- Use `validate` for complex cross-field checks (e.g., `@db.ignore` conflicts with `@meta.id`)
- Keep `description` concise — it shows in IDE hover tooltips
