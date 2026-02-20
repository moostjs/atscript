import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'
import { isPrimitive, isRef } from '../parser/nodes'
import type { TMessages } from '../parser/types'

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
      'Marks a field as **read-only**.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@meta.readonly' +
      'createdAt: string.date' +
      '```',
    nodeType: ['prop'],
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

  isKey: new AnnotationSpec({
    description:
      'Marks a **key field** inside an array. This annotation is used to identify unique fields within an array that can be used as **lookup keys**.\n\n' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      'export interface User {\n' +
      '  id: string\n' +
      '  profiles: {\n' +
      '    @meta.isKey\n' +
      '    profileId: string\n' +
      '    name: string\n' +
      '  }[]\n' +
      '}\n' +
      '```\n',
    nodeType: ['prop'],
    multiple: false,
    validate(token, args, doc) {
      const field = token.parentNode!
      const errors = [] as TMessages
      const isOptional = !!field.token('optional')
      if (isOptional) {
        errors.push({
          message: `@meta.isKey can't be optional`,
          severity: 1,
          range: field.token('identifier')!.range,
        })
      }
      const definition = field.getDefinition()
      if (!definition) {
        return errors
      }
      let wrongType = false
      if (isRef(definition)) {
        const def = doc.unwindType(definition.id!, definition.chain)?.def
        if (isPrimitive(def) && !['string', 'number'].includes(def.config.type as string)) {
          wrongType = true
        }
      } else {
        wrongType = true
      }
      if (wrongType) {
        errors.push({
          message: `@meta.isKey must be of type string or number`,
          severity: 1,
          range: token.range,
        })
      }
      return errors
    },
  }),
}
