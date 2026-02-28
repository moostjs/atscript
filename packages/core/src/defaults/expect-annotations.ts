import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'
import { isPrimitive, isRef } from '../parser/nodes'
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
    key: new AnnotationSpec({
      description:
        'Marks a **key field** inside an array. This annotation is used to identify unique fields within an array that can be used as **lookup keys**.\n\n' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        'export interface User {\n' +
        '  id: string\n' +
        '  profiles: {\n' +
        '    @expect.array.key\n' +
        '    profileId: string\n' +
        '    name: string\n' +
        '  }[]\n' +
        '}\n' +
        '```\n',
      nodeType: ['prop', 'type'],
      multiple: false,
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
