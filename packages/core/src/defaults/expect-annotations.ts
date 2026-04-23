import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'
import { isArray, isPrimitive, isRef } from '../parser/nodes'
import type { TMessages } from '../parser/types'

export const expectAnnotations: TAnnotationsTree = {
  minLength: new AnnotationSpec({
    description:
      'Validates that a string or array has a minimum length.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@expect.minLength 5' +
      'name: string' +
      '```',
    defType: ['array', 'string'],
    argument: [
      {
        name: 'length',
        type: 'number',
        description: 'The minimum length of the string or array.',
      },
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
  }),

  maxLength: new AnnotationSpec({
    description:
      'Validates that a string or array has a maximum length.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@expect.maxLength 5' +
      'name: string' +
      '```',
    defType: ['array', 'string'],
    argument: [
      {
        name: 'length',
        type: 'number',
        description: 'The maximum length of the string or array.',
      },
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
  }),

  min: new AnnotationSpec({
    description:
      'Validates that a number is greater than or equal to a minimum value.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@expect.min 18' +
      'age: number' +
      '```',
    defType: ['number'],
    argument: [
      {
        name: 'minValue',
        type: 'number',
        description: 'The minimum value.',
      },
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
  }),

  max: new AnnotationSpec({
    description:
      'Validates that a number is less than or equal to a maximum value.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@expect.max 10' +
      'count: number' +
      '```',
    defType: ['number'],
    argument: [
      {
        name: 'maxValue',
        type: 'number',
        description: 'The maximum value.',
      },
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
  }),

  int: new AnnotationSpec({
    description:
      'Validates that a number is an integer (no decimal places).' +
      '\n\n**Example:**' +
      '```atscript' +
      '@expect.int' +
      'age: number' +
      '```',
    defType: ['number'],
  }),

  pattern: new AnnotationSpec({
    description:
      'Validates that a string matches a specific pattern.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@expect.pattern "[a-z]+", "u"' +
      'name: string' +
      '```',
    defType: ['string'],
    multiple: true,
    mergeStrategy: 'append',
    argument: [
      {
        name: 'pattern',
        type: 'string',
        description: 'The regular expression pattern to match.',
      },
      {
        name: 'flags',
        optional: true,
        type: 'string',
        values: [
          'g',
          'gi',
          'gim',
          'gims',
          'gimsu',
          'gimsuy',
          'gimsy',
          'gimu',
          'gimuy',
          'gimy',
          'gis',
          'gisu',
          'gisuy',
          'gisy',
          'giu',
          'giuy',
          'giy',
          'gm',
          'gms',
          'gmsu',
          'gmsuy',
          'gmsy',
          'gmu',
          'gmuy',
          'gmy',
          'gs',
          'gsu',
          'gsuy',
          'gsy',
          'gu',
          'guy',
          'gy',
          'i',
          'im',
          'ims',
          'imsu',
          'imsuy',
          'imsy',
          'imu',
          'imuy',
          'imy',
          'is',
          'isu',
          'isuy',
          'isy',
          'iu',
          'iuy',
          'iy',
          'm',
          'ms',
          'msu',
          'msuy',
          'msy',
          'mu',
          'muy',
          'my',
          's',
          'su',
          'suy',
          'sy',
          'u',
          'uy',
          'y',
        ],
        description: 'Optional flags for the regular expression.',
      },
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
    validate(mainToken, args) {
      if (args[0]) {
        try {
          new RegExp(args[0].text)
          return []
        } catch (error) {
          return [
            {
              message: 'Invalid regular expression',
              range: args[0].range,
              severity: 1,
            },
          ]
        }
      }
      return []
    },
  }),

  array: {
    uniqueItems: new AnnotationSpec({
      description:
        'Enforces **unique items** in an array field.\n\n' +
        'Works with both **primitive arrays** and **object arrays**:\n\n' +
        '- **Primitive arrays** (`string[]`, `number[]`) — duplicates are detected by deep equality.\n' +
        '- **Object arrays** — if the element type defines `@expect.array.key` properties, ' +
        'uniqueness is checked by those keys only; otherwise by deep equality of the whole object.\n\n' +
        'Unlike `@expect.array.key` (which only *identifies* key fields for lookup/patch operations), ' +
        '`@expect.array.uniqueItems` actively *enforces* uniqueness during validation.\n\n' +
        '**Examples:**\n' +
        '```atscript\n' +
        '// Primitive array — no duplicates allowed\n' +
        '@expect.array.uniqueItems\n' +
        'tags: string[]\n' +
        '\n' +
        '// Object array with keys — unique by key fields\n' +
        '@expect.array.uniqueItems\n' +
        'items: {\n' +
        '    @expect.array.key\n' +
        '    id: string\n' +
        '    value: number\n' +
        '}[]\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: false,
      argument: [
        {
          name: 'message',
          optional: true,
          type: 'string',
          description: 'Optional custom error message when duplicate items are found.',
        },
      ],
      validate(token, args, doc) {
        const field = token.parentNode!
        const errors = [] as TMessages
        const definition = field.getDefinition()
        if (!definition) {
          return errors
        }
        let wrongType = false
        if (isRef(definition)) {
          const def = doc.unwindType(definition.id!, definition.chain)?.def
          if (!isArray(def)) {
            wrongType = true
          }
        } else if (!isArray(definition)) {
          wrongType = true
        }
        if (wrongType) {
          errors.push({
            message: `@expect.array.uniqueItems requires an array field`,
            severity: 1,
            range: token.range,
          })
        }
        return errors
      },
    }),

    key: new AnnotationSpec({
      description:
        'Marks a **key field** inside an array of objects. Key fields *identify* elements ' +
        'for lookup and patch operations (`$upsert`, `$update`, `$remove`).\n\n' +
        '`@expect.array.key` does **not** enforce uniqueness by itself — ' +
        'it only declares which fields form the element identity. ' +
        'To enforce that no two elements share the same key, also add `@expect.array.uniqueItems` ' +
        'on the array field.\n\n' +
        'Multiple key fields form a **composite key** (all must match for elements to be considered equal).\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@expect.array.uniqueItems    // enforce uniqueness by key\n' +
        'profiles: {\n' +
        '    @expect.array.key\n' +
        '    profileId: string\n' +
        '    name: string\n' +
        '}[]\n' +
        '```\n',
      nodeType: ['prop', 'type'],
      multiple: false,
      argument: [
        {
          name: 'message',
          optional: true,
          type: 'string',
          description:
            'Optional custom error message (used by @expect.array.uniqueItems when checking key-based uniqueness).',
        },
      ],
      validate(token, args, doc) {
        const field = token.parentNode!
        const errors = [] as TMessages
        const isOptional = !!field.token('optional')
        if (isOptional) {
          errors.push({
            message: `@expect.array.key can't be optional`,
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
            message: `@expect.array.key must be of type string or number`,
            severity: 1,
            range: token.range,
          })
        }
        return errors
      },
    }),
  },
}
