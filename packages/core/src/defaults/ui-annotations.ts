import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'

export const uiAnnotations: TAnnotationsTree = {
  placeholder: new AnnotationSpec({
    description:
      'Defines **placeholder text** for UI input fields.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.placeholder "Enter your name"\n' +
      'name: string\n' +
      '```\n',
    nodeType: ['prop', 'type'],
    argument: {
      name: 'text',
      type: 'string',
      description: 'The placeholder text to display in UI input fields.',
    },
  }),

  component: new AnnotationSpec({
    description:
      'Hints which **UI component** to use when rendering this field.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.component "select"\n' +
      'country: string\n' +
      '```\n',
    nodeType: ['prop', 'type'],
    argument: {
      name: 'name',
      type: 'string',
      description: 'The component name or type to use for rendering.',
    },
  }),

  hidden: new AnnotationSpec({
    description:
      'Hides this field or entity from **UI forms and tables** entirely.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.hidden\n' +
      'internalId: string\n' +
      '```\n',
    nodeType: ['prop', 'type', 'interface'],
  }),

  group: new AnnotationSpec({
    description:
      'Groups fields into **form sections**. Fields sharing the same group name are rendered together.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.group "personal"\n' +
      'firstName: string\n' +
      '\n' +
      '@ui.group "personal"\n' +
      'lastName: string\n' +
      '\n' +
      '@ui.group "contact"\n' +
      'email: string.email\n' +
      '```\n',
    nodeType: ['prop'],
    argument: {
      name: 'name',
      type: 'string',
      description: 'The section/group name to place this field in.',
    },
  }),

  order: new AnnotationSpec({
    description:
      'Sets the **display order** of a field in auto-generated forms. Lower numbers appear first.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.order 1\n' +
      'name: string\n' +
      '\n' +
      '@ui.order 2\n' +
      'email: string.email\n' +
      '```\n',
    nodeType: ['prop'],
    argument: {
      name: 'order',
      type: 'number',
      description: 'Display order number. Lower values appear first.',
    },
  }),

  width: new AnnotationSpec({
    description:
      'Provides a **layout width hint** for the field in auto-generated forms.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.width "half"\n' +
      'firstName: string\n' +
      '```\n',
    nodeType: ['prop', 'type'],
    argument: {
      name: 'width',
      type: 'string',
      description: 'Layout width hint (e.g., "half", "full", "third", "quarter").',
    },
  }),

  icon: new AnnotationSpec({
    description:
      'Provides an **icon hint** for the field or entity.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.icon "mail"\n' +
      'email: string.email\n' +
      '```\n',
    nodeType: ['prop', 'type', 'interface'],
    argument: {
      name: 'name',
      type: 'string',
      description: 'Icon name or identifier.',
    },
  }),

  hint: new AnnotationSpec({
    description:
      'Provides **help text or tooltip** displayed near the field in UI forms.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.hint "Must be a valid business email"\n' +
      'email: string.email\n' +
      '```\n',
    nodeType: ['prop', 'type'],
    argument: {
      name: 'text',
      type: 'string',
      description: 'Help text or tooltip content.',
    },
  }),

  disabled: new AnnotationSpec({
    description:
      'Marks a field as **disabled** (rendered but non-interactive) in UI forms.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.disabled\n' +
      'referralCode: string\n' +
      '```\n',
    nodeType: ['prop', 'type'],
  }),

  type: new AnnotationSpec({
    description:
      'Specifies the **input type** for the field in UI forms. ' +
      'Maps to HTML input types or framework-specific equivalents.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.type "textarea"\n' +
      'bio: string\n' +
      '\n' +
      '@ui.type "password"\n' +
      'secret: string\n' +
      '```\n',
    nodeType: ['prop', 'type'],
    argument: {
      name: 'type',
      type: 'string',
      description:
        'Input type (e.g., "text", "textarea", "password", "number", "date", "color", "range").',
    },
  }),

  attr: new AnnotationSpec({
    description:
      'Passes an arbitrary **HTML/component attribute** to the rendered field. ' +
      'Multiple `@ui.attr` annotations can be used on the same field.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.attr "rows", "5"\n' +
      '@ui.attr "autocomplete", "off"\n' +
      'bio: string\n' +
      '```\n',
    nodeType: ['prop', 'type', 'interface'],
    multiple: true,
    mergeStrategy: 'append',
    argument: [
      {
        name: 'key',
        type: 'string',
        description: 'Attribute name.',
      },
      {
        name: 'value',
        type: 'string',
        description: 'Attribute value.',
      },
    ],
  }),

  class: new AnnotationSpec({
    description:
      'Adds **CSS class names** to the rendered field or entity. ' +
      'Multiple `@ui.class` annotations are appended.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.class "text-bold"\n' +
      '@ui.class "mt-4"\n' +
      'title: string\n' +
      '```\n',
    nodeType: ['prop', 'type', 'interface'],
    multiple: true,
    mergeStrategy: 'append',
    argument: {
      name: 'names',
      type: 'string',
      description: 'One or more CSS class names (space-separated).',
    },
  }),

  style: new AnnotationSpec({
    description:
      'Adds **inline CSS styles** to the rendered field or entity. ' +
      'Multiple `@ui.style` annotations are appended.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@ui.style "color: red"\n' +
      '@ui.style "font-weight: bold"\n' +
      'warning: string\n' +
      '```\n',
    nodeType: ['prop', 'type', 'interface'],
    multiple: true,
    mergeStrategy: 'append',
    argument: {
      name: 'css',
      type: 'string',
      description: 'CSS style declarations (semicolon-separated).',
    },
  }),
}
