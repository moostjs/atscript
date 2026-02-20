# Custom Primitives

You can extend the built-in primitive types with your own semantic extensions via `atscript.config.js`. Custom primitives work exactly like built-in ones — they appear in IntelliSense, carry validation constraints, and generate appropriate type tags.

## Defining Custom Extensions

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

Each extension object supports:

| Field           | Description                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `type`          | The base type (`'string'`, `'number'`, `'boolean'`, `'phantom'`, etc.) — **inherited** from parent if omitted |
| `documentation` | Description shown in IntelliSense — inherited from parent if omitted                                          |
| `expect`        | Implicit validation constraints — merged with parent's `expect`                                               |
| `extensions`    | Nested sub-extensions (e.g., `number.int.positive`)                                                           |
| `isContainer`   | If `true`, the primitive cannot be used directly — one of its extensions must be chosen                       |

::: tip Inheritance
Extensions automatically inherit `type`, `documentation`, `expect`, and `tags` from their parent primitive. You only need to specify fields you want to override or add. This is how built-in extensions like `string.email` work — they inherit `type: 'string'` from `string` and only add their own `expect` constraints.
:::

## Custom Phantom Namespaces

You can define entirely new primitive namespaces with `type: 'phantom'` to create families of non-data UI elements. These are omitted from TypeScript types and skipped by validation, but discoverable at runtime — perfect for form renderers that need different kinds of decorative or interactive elements.

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  primitives: {
    ui: {
      type: 'phantom',
      isContainer: true,
      documentation: 'Non-data UI elements for form rendering',
      extensions: {
        action: {
          documentation: 'An action element (button, link)',
        },
        divider: {
          documentation: 'A visual divider between form sections',
        },
        paragraph: {
          documentation: 'A block of informational text',
        },
      },
    },
  },
})
```

Since extensions inherit `type` from their parent, all `ui.*` subtypes are automatically phantom — no need to repeat `type: 'phantom'` on each one. The `isContainer: true` flag prevents using `ui` directly — the compiler will report an error and require a specific extension like `ui.action` or `ui.divider`.

Then use them in `.as` files:

```atscript
export interface CheckoutForm {
    @label "Email"
    email: string.email

    @label "Shipping Address"
    @component "section-header"
    shippingHeader: ui.divider

    @label "Street"
    street: string

    @label "City"
    city: string

    @label "Please review your order before proceeding."
    termsNote: ui.paragraph

    @label "Apply coupon"
    @component "button"
    @action "apply-coupon"
    applyCoupon: ui.action
}
```

The `ui`, `ui.action`, `ui.divider`, and `ui.paragraph` types all behave like [phantom](/packages/typescript/primitives#phantom-type) — they are excluded from the generated TypeScript class and skipped by validation — but they carry distinct tags (`'action'`, `'divider'`, `'paragraph'`) that your form renderer can use to choose the right component.

## Using Custom Primitives

Once defined, use them in `.as` files with dot notation:

```atscript
export interface Page {
    url: string.url
    slug: string.slug
    completeness: number.percentage
}
```

The validator will automatically enforce the constraints defined in your config — no `@expect.*` annotations needed.

::: tip Re-generate after config changes
Run `npx asc -f dts` after adding custom primitives to regenerate `atscript.d.ts`. This updates IntelliSense with your new type tags. See [Configuration](/packages/typescript/configuration) for details.
:::

## Next Steps

- [Primitives](/packages/typescript/primitives) — built-in primitive types and semantic extensions
- [Custom Annotations](/packages/typescript/custom-annotations) — define custom annotation types
- [Configuration](/packages/typescript/configuration) — full config file reference
