# Custom Primitives

You can extend the built-in primitive types with your own semantic extensions via `atscript.config.ts`. Custom primitives work exactly like built-in ones — they appear in IntelliSense, carry validation constraints, and generate appropriate type tags.

## Quick Example

Add custom extensions under the `primitives` key in your config:

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  primitives: {
    string: {
      extensions: {
        url: {
          type: 'string',
          documentation: 'URL format',
          expect: {
            pattern: ['^https?://.+$', '', 'Invalid URL'],
          },
        },
        slug: {
          type: 'string',
          documentation: 'URL-safe slug',
          expect: {
            pattern: ['^[a-z0-9-]+$', '', 'Invalid slug'],
          },
        },
      },
    },
    number: {
      extensions: {
        percentage: {
          type: 'number',
          documentation: 'Percentage value (0–100)',
          expect: {
            min: 0,
            max: 100,
          },
        },
      },
    },
  },
})
```

Then use them in `.as` files with dot notation:

```atscript
export interface Page {
    url: string.url
    slug: string.slug
    completeness: number.percentage
}
```

The validator will automatically enforce the constraints — no `@expect.*` annotations needed.

## What You Can Define

Each primitive extension supports:

| Field           | Description                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `type`          | The base type (`'string'`, `'number'`, `'boolean'`, `'phantom'`, etc.) — **inherited** from parent if omitted |
| `documentation` | Description shown in IntelliSense — inherited from parent if omitted                                          |
| `expect`        | Implicit validation constraints — merged with parent's `expect`                                               |
| `extensions`    | Nested sub-extensions (e.g., `number.int.positive`)                                                           |
| `isContainer`   | If `true`, the primitive cannot be used directly — one of its extensions must be chosen                       |
| `tags`          | Array of semantic tags (e.g., `['created']`) — inherited from parent, used by DB adapters and runtime tools   |
| `annotations`   | Implicit annotations applied to any field using this primitive (e.g., `{ 'expect.int': true }`)               |

::: warning isContainer
When `isContainer: true`, the primitive itself cannot be used as a type — only its extensions are valid:

```atscript
field: ui             // ✗ Error — ui is a container, must use an extension
field: ui.action      // ✓ Correct — uses the extension
```

:::

::: tip Inheritance
Extensions automatically inherit `type`, `documentation`, `expect`, and `tags` from their parent primitive. You only need to specify fields you want to override or add. This is how built-in extensions like `string.email` work — they inherit `type: 'string'` from `string` and only add their own constraints.
:::

## Phantom Namespaces

You can define entirely new primitive namespaces with `type: 'phantom'` to create families of non-data UI elements. These are omitted from TypeScript types and skipped by validation, but discoverable at runtime — perfect for form renderers.

```javascript
primitives: {
  ui: {
    type: 'phantom',
    isContainer: true,
    documentation: 'Non-data UI elements for form rendering',
    extensions: {
      action:    { documentation: 'An action element (button, link)' },
      divider:   { documentation: 'A visual divider between form sections' },
      paragraph: { documentation: 'A block of informational text' },
    },
  },
}
```

```atscript
export interface CheckoutForm {
    @label "Email"
    email: string.email

    @label "Shipping Address"
    @component "section-header"
    shippingHeader: ui.divider

    @label "Street"
    street: string
}
```

## Full Reference

The primitives system is covered in depth in the plugin development guide:

- **[Custom Primitives — Plugin Development](/plugin-development/primitives-type-tags)** — the complete `TPrimitiveConfig` interface, complex type definitions (arrays, tuples, unions, objects), semantic tags, container primitives, inheritance rules, and phantom type design.

::: tip Re-generate after config changes
Run `npx asc` after adding custom primitives to regenerate output files. This updates IntelliSense with your new type tags. See [Configuration](/packages/typescript/configuration) for details.
:::

## Next Steps

- [Primitives](/packages/typescript/primitives) — built-in primitive types and semantic extensions
- [Custom Annotations](/packages/typescript/custom-annotations) — define custom annotation types
- [Configuration](/packages/typescript/configuration) — full config file reference
