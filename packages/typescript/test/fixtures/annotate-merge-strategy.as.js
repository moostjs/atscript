// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from '@atscript/typescript/utils'

export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error(
      "JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces."
    )
  }
}

export class User2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error(
      "JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces."
    )
  }
}

$('object', User)
  .prop(
    'name',
    $()
      .designType('string')
      .tags('string')
      .annotate('label', 'Original Name')
      .annotate('mulAppend', 'prop-original')
      .annotate('mul', 1, true)
      .annotate('mul', 2, true).$type
  )
  .annotate('mulAppend', 'top-original')

// Ad-hoc annotations for User
$a(User.type.props.get('name')?.metadata, 'label', 'Mutated Name')
$a(User.type.props.get('name')?.metadata, 'mulAppend', 'prop-mutated')
$a(User.type.props.get('name')?.metadata, 'mul', 99)
$a(User.metadata, 'mulAppend', 'top-mutated')

$('object', User2)
  .prop(
    'name',
    $()
      .designType('string')
      .tags('string')
      .annotate('label', 'Aliased Name')
      .annotate('mulAppend', 'prop-aliased')
      .annotate('mul', 77, true).$type
  )
  .annotate('mulAppend', 'top-aliased')

// prettier-ignore-end
