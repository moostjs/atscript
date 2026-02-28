import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'

export const metaAnnotations: TAnnotationsTree = {
  label: new AnnotationSpec({
    description:
      'Defines a **human-readable label** for a property or entity. Useful for UI, logs, and documentation.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.label "User Name"' +
      'name: string' +
      '```',
    argument: {
      name: 'text',
      type: 'string',
      description: 'The label to be used for this field or entity.',
    },
  }),

  id: new AnnotationSpec({
    description:
      'Marks a field as a unique identifier across multiple domains (DB, API, UI, logs). ' +
      'Multiple fields can be annotated with `@meta.id` to form a composite primary key.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.id' +
      'id: string' +
      '```',
    nodeType: ['prop'],
  }),

  description: new AnnotationSpec({
    description:
      'Provides a **detailed description** of a field or entity, often used in documentation.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.description "Stores the user email address"' +
      'email: string' +
      '```',
    argument: {
      name: 'text',
      type: 'string',
      description: 'Detailed description for this field or entity.',
    },
  }),

  documentation: new AnnotationSpec({
    description:
      'Provides **multi-line documentation** for a field or entity.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.documentation "# bio"' +
      '@meta.documentation "## documentation of bio"' +
      '@meta.documentation "your documentation"' +
      'bio: string' +
      '```',
    multiple: true,
    argument: {
      name: 'text',
      type: 'string',
      description:
        'A line of documentation text. Multiple annotations can be used to form a full Markdown document.',
    },
  }),

  sensitive: new AnnotationSpec({
    description:
      'Marks a field as **sensitive** (e.g., passwords, API keys), ensuring it is hidden in logs and UI.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.sensitive' +
      'password: string' +
      '```',
    nodeType: ['prop', 'type'],
    multiple: false,
  }),

  readonly: new AnnotationSpec({
    description:
      'Marks a field as **read-only**.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.readonly' +
      'createdAt: string.date' +
      '```',
    nodeType: ['prop', 'type'],
    multiple: false,
  }),

  required: new AnnotationSpec({
    description:
      'Marks a field as required for form validation. ' +
      'For strings: must contain at least one non-whitespace character. ' +
      'For booleans: must be true.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.required' +
      'name: string' +
      '\n' +
      '@meta.required "You must accept the terms"' +
      'agreed: boolean' +
      '```',
    defType: ['string', 'boolean'],
    argument: [
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
  }),

  default: new AnnotationSpec({
    description:
      'Defines a **default value** for a property or type. ' +
      'For string fields the value is used as-is; for other types it is parsed as JSON.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.default "unknown"' +
      'name: string' +
      '\n' +
      '@meta.default "0"' +
      'count: number' +
      '\n' +
      '@meta.default \'{"street":"","city":""}\'' +
      'address: Address' +
      '```',
    nodeType: ['prop', 'type'],
    argument: {
      name: 'value',
      type: 'string',
      description: 'The default value. Strings are used as-is; other types are parsed as JSON.',
    },
  }),

  example: new AnnotationSpec({
    description:
      'Defines an **example value** for a property or type, useful for documentation and data generation. ' +
      'For string fields the value is used as-is; for other types it is parsed as JSON.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.example "John Doe"' +
      'name: string' +
      '\n' +
      '@meta.example "42"' +
      'age: number' +
      '\n' +
      '@meta.example \'["admin","user"]\'' +
      'roles: string[]' +
      '```',
    nodeType: ['prop', 'type'],
    argument: {
      name: 'value',
      type: 'string',
      description: 'The example value. Strings are used as-is; other types are parsed as JSON.',
    },
  }),

}
