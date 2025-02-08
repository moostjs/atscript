import { AnnotationSpec } from '../annotations'
import { TAnnotationsTree } from '../config'

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
      'Marks a field as a unique identifier across multiple domains (DB, API, UI, logs).' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.id "userId"' +
      'id: string' +
      '```',
    argument: {
      optional: true,
      name: 'name',
      type: 'string',
      description: 'Custom identifier name (defaults to property name if omitted).',
    },
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

  placeholder: new AnnotationSpec({
    description:
      'Defines a **default placeholder value** for UI input fields.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.placeholder "Enter your name"' +
      'name: string' +
      '```',
    nodeType: ['prop'],
    argument: {
      name: 'text',
      type: 'string',
      description: 'The placeholder text to display in UI forms.',
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
    nodeType: ['prop'],
    multiple: false,
  }),

  readonly: new AnnotationSpec({
    description:
      'Marks a field as **read-only**, preventing modifications after creation.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.readonly' +
      'createdAt: date' +
      '```',
    nodeType: ['prop'],
    multiple: false,
  }),
}
