# Annotations

Annotations are metadata declarations that provide additional information about types, interfaces, and properties.

## Purpose

Annotations serve multiple purposes:
- **UI metadata** - Labels, placeholders, descriptions for form generation
- **Validation constraints** - Min/max values, patterns, length restrictions
- **Database metadata** - Collection names, indexes, field strategies
- **Documentation** - Descriptions and multi-line documentation
- **Custom metadata** - Any domain-specific information

## Where to Apply

Annotations can be applied anywhere:

```atscript
@meta.description 'User entity'    // Interface annotation
export interface User {
    @meta.id                       // Property annotation
    id: string
}

@expect.minLength 3                // Type annotation
export type Username = string
```

## Annotation Inheritance

### Type to Property
When a property uses a type with annotations, annotations merge with property having priority:

```atscript
@expect.minLength 3
@expect.maxLength 20
export type Username = string

export interface User {
    @expect.maxLength 15    // Overrides type's maxLength
    username: Username       // Inherits minLength: 3, gets maxLength: 15
}
```

### Property References
When a property references another property, annotations merge in order:
1. Final type annotations
2. Referenced property annotations
3. Current property annotations (highest priority)

## Annotation Syntax

```atscript
@meta.label 'User Name'           // With argument
@meta.sensitive                   // Flag (no argument)
@expect.pattern "^[A-Z]", "i"     // Multiple arguments
@meta.documentation 'Line 1'      // Can be repeated
@meta.documentation 'Line 2'
```

Arguments can be optional. Annotations without arguments are flag annotations.

## Core Annotations

Atscript provides common-purpose annotations:

### Meta Annotations (@meta.*)
- `@meta.label 'text'` - Human-readable label
- `@meta.id` or `@meta.id 'name'` - Marks identifier field
- `@meta.description 'text'` - Field description
- `@meta.documentation 'text'` - Multi-line docs (repeatable)
- `@meta.placeholder 'text'` - UI placeholder text
- `@meta.sensitive` - Marks sensitive data
- `@meta.readonly` - Read-only field
- `@meta.isKey` - Key field in arrays for lookups

### Validation Annotations (@expect.*)
- `@expect.minLength 5` - Minimum string/array length
- `@expect.maxLength 100` - Maximum string/array length
- `@expect.min 0` - Minimum number value
- `@expect.max 100` - Maximum number value
- `@expect.int` - Must be integer
- `@expect.pattern "regex", "flags", "message"` - Pattern validation (repeatable)

## Custom Annotations

### Unknown Annotations
Support any user-specified annotations by setting in config:

```javascript
// atscript.config.js
export default {
  unknownAnnotation: 'allow'  // or 'warn', 'error' (default)
}
```

### Defining Custom Annotations
Add custom annotations with IntelliSense support:

```javascript
// atscript.config.js
import { defineConfig, AnnotationSpec } from '@atscript/core'

export default defineConfig({
  annotations: {
    ui: {
      hidden: new AnnotationSpec({
        description: 'Hide field in UI',
        nodeType: ['prop']
      }),
      column: new AnnotationSpec({
        description: 'Table column width',
        argument: {
          name: 'width',
          type: 'number'
        }
      })
    }
  }
})
```

Use in `.as` files:
```atscript
export interface User {
    @ui.hidden
    internalId: string

    @ui.column 200
    name: string
}
```

Plugins can also provide custom annotations through their configuration.

## Next Steps

- [Configuration](/guide/configuration) - Configure Atscript
- [Build Setup](/guide/build-setup) - Integrate with build tools