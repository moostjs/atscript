import { AnnotationSpec, annotationExample } from '../annotations'
import type { TAnnotationsTree } from '../config'

export const metaAnnotations: TAnnotationsTree = {
  label: new AnnotationSpec({
    description: annotationExample(
      'Defines a **human-readable label** for a property or entity. Useful for UI, logs, and documentation.',
      '@meta.label "User Name"',
      'name: string'
    ),
    argument: {
      name: 'text',
      type: 'string',
      description: 'The label to be used for this field or entity.',
    },
  }),

  id: new AnnotationSpec({
    description: annotationExample(
      'Marks a field as a unique identifier across multiple domains (DB, API, UI, logs). ' +
        'Multiple fields can be annotated with `@meta.id` to form a composite primary key.',
      '@meta.id',
      'id: string'
    ),
    nodeType: ['prop'],
    passedWhenReferred: false, // an FK referencing a PK must not become an id itself
  }),

  description: new AnnotationSpec({
    description: annotationExample(
      'Provides a **detailed description** of a field or entity, often used in documentation.',
      '@meta.description "Stores the user email address"',
      'email: string'
    ),
    argument: {
      name: 'text',
      type: 'string',
      description: 'Detailed description for this field or entity.',
    },
  }),

  documentation: new AnnotationSpec({
    description: annotationExample(
      'Provides **multi-line documentation** for a field or entity.',

      '@meta.documentation "# bio"',
      '@meta.documentation "## documentation of bio"',
      '@meta.documentation "your documentation"',
      'bio: string'
    ),
    multiple: true,
    argument: {
      name: 'text',
      type: 'string',
      description:
        'A line of documentation text. Multiple annotations can be used to form a full Markdown document.',
    },
  }),

  sensitive: new AnnotationSpec({
    description: annotationExample(
      'Marks a field as **sensitive** (e.g., passwords, API keys), ensuring it is hidden in logs and UI.',
      '@meta.sensitive',
      'password: string'
    ),
    nodeType: ['prop', 'type'],
    multiple: false,
  }),

  readonly: new AnnotationSpec({
    description: annotationExample(
      'Marks a field as **read-only**.',
      '@meta.readonly',
      'createdAt: string.date'
    ),
    nodeType: ['prop', 'type'],
    multiple: false,
    passedWhenReferred: false,
  }),

  required: new AnnotationSpec({
    description: annotationExample(
      'Marks a field as required for form validation. ' +
        'For strings: must contain at least one non-whitespace character. ' +
        'For booleans: must be true. ' +
        'On an optional field (`name?: string`) the field may be omitted, but `null` is rejected. ' +
        'On a nullable field (`string | null`) `null` is accepted and a string must not be empty.',

      '@meta.required',
      'name: string',
      '',
      '@meta.required "You must accept the terms"',
      'agreed: boolean'
    ),
    defType: ['string', 'boolean'],
    argument: [
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
    passedWhenReferred: false,
  }),

  default: new AnnotationSpec({
    description: annotationExample(
      'Defines a **default value** for a property or type. ' +
        'For string fields the value is used as-is; for other types it is parsed as JSON.',

      '@meta.default "unknown"',
      'name: string',
      '',
      '@meta.default "0"',
      'count: number',
      '',
      '@meta.default \'{"street":"","city":""}\'',
      'address: Address'
    ),
    nodeType: ['prop', 'type'],
    argument: {
      name: 'value',
      type: 'string',
      description: 'The default value. Strings are used as-is; other types are parsed as JSON.',
    },
    passedWhenReferred: false,
  }),

  example: new AnnotationSpec({
    description: annotationExample(
      'Defines an **example value** for a property or type, useful for documentation and data generation. ' +
        'For string fields the value is used as-is; for other types it is parsed as JSON.',

      '@meta.example "John Doe"',
      'name: string',
      '',
      '@meta.example "42"',
      'age: number',
      '',
      '@meta.example \'["admin","user"]\'',
      'roles: string[]'
    ),
    nodeType: ['prop', 'type'],
    argument: {
      name: 'value',
      type: 'string',
      description: 'The example value. Strings are used as-is; other types are parsed as JSON.',
    },
  }),
}
