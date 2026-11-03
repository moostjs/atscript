import {
  AnnotationSpec,
  annotationExample,
  nonNullishMembers,
  type TAnnotationArgument,
} from '../annotations'
import type { TAnnotationsTree } from '../config'
import { isArray, isPrimitive, isRef, type SemanticNode } from '../parser/nodes'
import type { TMessages } from '../parser/types'
import { statefulRegexFlagsMessage } from '../parser/utils'

const NULLABLE_NOTE =
  'Also allowed on a nullable field (`T | null`, `T | undefined`): `null` passes, ' +
  'any other value must satisfy the constraint.'

/** The optional message argument of a constraint annotation. */
const MESSAGE_ARG: TAnnotationArgument = {
  name: 'message',
  optional: true,
  type: 'string',
  description: 'Optional error message to display if the validation fails.',
}

/** Whether `flags` are flags of a JS regular expression. */
function validFlags(flags: string): boolean {
  try {
    new RegExp('', flags)
    return true
  } catch {
    return false
  }
}

/**
 * Whether `pattern` compiles with `flags` as the runtime compiles it: as written, and with `y`,
 * anchored at the start of the value without `g` / `y` (see the runtime's `statelessRegExp`).
 */
function compiles(pattern: string, flags: string): boolean {
  try {
    new RegExp(pattern, flags)
    if (flags.includes('y')) {
      new RegExp(`^(?:${pattern})`, flags.replace(/[gy]/g, ''))
    }
    return true
  } catch {
    return false
  }
}

/** `@expect.min` / `max` / `exclusiveMin` / `exclusiveMax`: a number bound plus an optional message. */
function numberBoundSpec(
  summary: string,
  example: string[],
  argName: string,
  argDescription: string
): AnnotationSpec {
  return new AnnotationSpec({
    description: annotationExample(`${summary} ${NULLABLE_NOTE}`, ...example),
    defType: ['number'],
    argument: [
      {
        name: argName,
        type: 'number',
        description: argDescription,
      },
      MESSAGE_ARG,
    ],
  })
}

/** Whether `text` (a number argument) is a non-negative integer. */
function isCount(text: string): boolean {
  return /^\d+$/.test(text)
}

/**
 * `@expect.minKeys` / `maxKeys`: a key count (a non-negative integer) plus an optional message.
 * `@expect.maxKeys` also checks it is not below the node's `@expect.minKeys`.
 */
function keyCountSpec(
  bound: 'at least' | 'at most',
  example: string[],
  argDescription: string,
  min?: string
): AnnotationSpec {
  const summary =
    `Validates that an object has ${bound} this many keys: the keys it keeps (with unknown ` +
    'properties ignored, every own key; else the declared and pattern-matched ones).'
  return new AnnotationSpec({
    description: annotationExample(`${summary} ${NULLABLE_NOTE}`, ...example),
    defType: ['object'],
    argument: [
      {
        name: 'count',
        type: 'number',
        description: argDescription,
      },
      MESSAGE_ARG,
    ],
    validate(mainToken, args) {
      const count = args[0]
      if (!count || count.type !== 'number') {
        return []
      }
      if (!isCount(count.text)) {
        return [
          {
            message: `${mainToken.text} expects a non-negative integer`,
            range: count.range,
            severity: 1,
          },
        ]
      }
      const lower = min
        ? mainToken.parentNode?.annotations?.find(a => a.name === min)?.args[0]
        : undefined
      if (lower && isCount(lower.text) && Number(lower.text) > Number(count.text)) {
        return [
          {
            message: `${mainToken.text} is below @${min} (${lower.text})`,
            range: count.range,
            severity: 1,
          },
        ]
      }
      return []
    },
  })
}

export const expectAnnotations: TAnnotationsTree = {
  minLength: new AnnotationSpec({
    description: annotationExample(
      `Validates that a string or array has a minimum length. ${NULLABLE_NOTE}`,
      '@expect.minLength 5',
      'name: string'
    ),
    defType: ['array', 'string'],
    argument: [
      {
        name: 'length',
        type: 'number',
        description: 'The minimum length of the string or array.',
      },
      MESSAGE_ARG,
    ],
  }),

  maxLength: new AnnotationSpec({
    description: annotationExample(
      `Validates that a string or array has a maximum length. ${NULLABLE_NOTE}`,
      '@expect.maxLength 5',
      'name: string'
    ),
    defType: ['array', 'string'],
    argument: [
      {
        name: 'length',
        type: 'number',
        description: 'The maximum length of the string or array.',
      },
      MESSAGE_ARG,
    ],
  }),

  min: numberBoundSpec(
    'Validates that a number is greater than or equal to a minimum value.',
    ['@expect.min 18', 'age: number'],
    'minValue',
    'The minimum value.'
  ),

  max: numberBoundSpec(
    'Validates that a number is less than or equal to a maximum value.',
    ['@expect.max 10', 'count: number'],
    'maxValue',
    'The maximum value.'
  ),

  exclusiveMin: numberBoundSpec(
    'Validates that a number is strictly greater than a value (the value itself is rejected).',
    ['@expect.exclusiveMin 0', 'price: number'],
    'exclusiveMinValue',
    'The exclusive lower bound (the value must be greater than this).'
  ),

  exclusiveMax: numberBoundSpec(
    'Validates that a number is strictly less than a value (the value itself is rejected).',
    ['@expect.exclusiveMax 1', 'ratio: number'],
    'exclusiveMaxValue',
    'The exclusive upper bound (the value must be less than this).'
  ),

  int: new AnnotationSpec({
    description: annotationExample(
      `Validates that a number is an integer (no decimal places). ${NULLABLE_NOTE}`,
      '@expect.int',
      'age: number'
    ),
    defType: ['number'],
    argument: [MESSAGE_ARG],
  }),

  minKeys: keyCountSpec(
    'at least',
    ['@expect.minKeys 1', 'labels: { [*]: string }'],
    'The minimum number of keys.'
  ),

  maxKeys: keyCountSpec(
    'at most',
    ['@expect.maxKeys 20', 'labels: { [*]: string }'],
    'The maximum number of keys.',
    'expect.minKeys'
  ),

  message: new AnnotationSpec({
    description: annotationExample(
      'Custom error message for a type mismatch: wrong type (a non-finite number, a malformed ' +
        "decimal), not the literal (or not one of a literal union's values), no union branch, " +
        'unknown discriminator, wrong tuple length. Constraint failures keep their own messages ' +
        '(`@expect.minLength` …, `@meta.required`).',
      "@expect.message 'Choose a valid status'",
      "status: 'active' | 'blocked'"
    ),
    nodeType: ['prop', 'type'],
    argument: {
      name: 'message',
      type: 'string',
      description: 'The error message.',
    },
  }),

  pattern: new AnnotationSpec({
    description: annotationExample(
      `Validates that a string matches a specific pattern. ${NULLABLE_NOTE}`,
      '@expect.pattern "[a-z]+", "u"',
      'name: string'
    ),
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
          // (no flags: lets a message follow)
          '',
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
      MESSAGE_ARG,
    ],
    validate(mainToken, args) {
      if (args[0]) {
        // Compiled with its flags, like the runtime (`u` changes what is valid: `a{`, `\\-`);
        // flags that are not valid are reported by the argument check (their values).
        const flags = args[1] && validFlags(args[1].text) ? args[1].text : ''
        if (!compiles(args[0].text, flags)) {
          return [
            {
              message: flags
                ? `Invalid regular expression with flags "${flags}"`
                : 'Invalid regular expression',
              range: args[0].range,
              severity: 1,
            },
          ]
        }
        const flagsMessage = args[1] && statefulRegexFlagsMessage(args[1].text, 'value')
        return flagsMessage ? [{ message: flagsMessage, range: args[1].range, severity: 2 }] : []
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
        'Also allowed on a nullable array (`T[] | null`); `null` passes.\n\n' +
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
        let def: SemanticNode | undefined = definition
        let defDoc = doc
        if (isRef(definition)) {
          const unwound = doc.unwindRef(definition)
          def = unwound?.def
          defDoc = unwound?.doc || doc
        }
        // A nullable array (`T[] | null`) is accepted like `T[]`.
        const members = nonNullishMembers(def, defDoc)
        const isArrayField = members
          ? members.length > 0 && members.every(m => isArray(m))
          : isArray(def)
        if (!isArrayField) {
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
          const def = doc.unwindRef(definition)?.def
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
