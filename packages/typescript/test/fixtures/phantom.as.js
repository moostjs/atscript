// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from '@atscript/typescript/utils'

export class MyForm {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error(
      "JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces."
    )
  }
}

$('object', MyForm)
  .prop('name', $().designType('string').tags('string').annotate('label', 'Name').$type)
  .prop(
    'info',
    $()
      .designType('phantom')
      .tags('phantom')
      .annotate('label', 'Info paragraph')
      .annotate('component', 'paragraph').$type
  )
  .prop(
    'email',
    $()
      .designType('string')
      .tags('email', 'string')
      .annotate('label', 'Email')
      .annotate(
        'expect.pattern',
        { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', flags: '', message: 'Invalid email format.' },
        true
      ).$type
  )
  .prop(
    'resetPassword',
    $()
      .designType('phantom')
      .tags('phantom')
      .annotate('label', 'Reset password')
      .annotate('component', 'link').$type
  )
  .prop('optional', $().designType('string').tags('string').optional().$type)

// prettier-ignore-end
