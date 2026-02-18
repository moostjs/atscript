import { AnnotationSpec } from '../annotations'
import { TAnnotationsTree } from '../config'

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

  filled: new AnnotationSpec({
    description:
      'Validates that a string is not empty and contains at least one non-whitespace character.' +
      '\n\n**Example:**' +
      '```atscript' +
      '@expect.filled' +
      'name: string' +
      '```',
    defType: ['string'],
    argument: [
      {
        name: 'message',
        optional: true,
        type: 'string',
        description: 'Optional error message to display if the validation fails.',
      },
    ],
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
        } catch (e) {
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
}
