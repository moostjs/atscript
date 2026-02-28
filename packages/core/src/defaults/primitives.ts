import type { TPrimitiveConfig } from '../parser/nodes'

const positive: Partial<TPrimitiveConfig> = {
  documentation: 'Number that greater than or equal to zero.',
  annotations: { 'expect.min': 0 },
}

const negative: Partial<TPrimitiveConfig> = {
  documentation: 'Number that less than or equal to zero.',
  annotations: { 'expect.max': 0 },
}

const positiveOrNegative = {
  positive,
  negative,
}

export const primitives: Record<string, TPrimitiveConfig> = {
  never: {
    documentation: 'Represents impossible type.',
  },

  string: {
    type: 'string',
    documentation: 'Represents textual data.',
    extensions: {
      email: {
        documentation: 'Represents an email address.',
        annotations: {
          'expect.pattern': {
            pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            message: 'Invalid email format.',
          },
        },
      },
      phone: {
        documentation: 'Represents an phone number.',
        annotations: {
          'expect.pattern': {
            pattern: '^\\+?[0-9\\s-]{10,15}$',
            message: 'Invalid phone number format.',
          },
        },
      },
      date: {
        documentation: 'Represents a date string.',
        annotations: {
          'expect.pattern': [
            { pattern: '^\\d{4}-\\d{2}-\\d{2}$', message: 'Invalid date format.' }, // YYYY-MM-DD
            { pattern: '^\\d{2}/\\d{2}/\\d{4}$', message: 'Invalid date format.' }, // MM/DD/YYYY
            { pattern: '^\\d{2}-\\d{2}-\\d{4}$', message: 'Invalid date format.' }, // DD-MM-YYYY
            { pattern: '^\\d{1,2} [A-Za-z]+ \\d{4}$', message: 'Invalid date format.' }, // D Month YYYY
          ],
        },
      },
      isoDate: {
        documentation: 'Represents a date string in ISO format.',
        annotations: {
          'expect.pattern': [
            {
              pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$',
              message: 'Invalid ISO date format.',
            }, // UTC ISO 8601
            {
              pattern:
                '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?([+-]\\d{2}:\\d{2})$',
              message: 'Invalid ISO date format.',
            }, // ISO 8601 with timezone
          ],
        },
      },
      uuid: {
        documentation: 'Represents a UUID.',
        annotations: {
          'expect.pattern': {
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            flags: 'i',
            message: 'Invalid UUID format.',
          },
        },
      },
      required: {
        documentation: 'Non-empty string that contains at least one non-whitespace character.',
        annotations: { 'meta.required': true },
      },
    },
  },

  number: {
    type: 'number',
    documentation: 'Represents numeric data.',
    extensions: {
      ...positiveOrNegative,
      single: {
        extensions: positiveOrNegative,
        documentation: 'Represents a single-precision floating-point number.',
      },
      double: {
        extensions: positiveOrNegative,
        documentation: 'Represents a double-precision floating-point number.',
      },
      int: {
        extensions: positiveOrNegative,
        documentation: 'Represents an integer number.',
        annotations: { 'expect.int': true },
      },
      timestamp: {
        documentation: 'Represents a timestamp.',
        annotations: { 'expect.int': true },
        extensions: {
          created: {
            documentation:
              'Timestamp auto-set on creation. Auto-applies @db.default.fn "now".',
            tags: ['created'],
            annotations: { 'db.default.fn': 'now' },
          },
          updated: {
            documentation:
              'Timestamp auto-updated on every write. DB adapters read the "updated" tag.',
            tags: ['updated'],
          },
        },
      },
    },
  },

  boolean: {
    type: 'boolean',
    documentation: 'Represents true/false values.',
    extensions: {
      required: {
        documentation: 'Boolean that must be true. Useful for checkboxes like "accept terms".',
        annotations: { 'meta.required': true },
      },
      true: {
        documentation: 'Represents a true value.',
      },
      false: {
        documentation: 'Represents a false value.',
      },
    },
  },

  null: {
    type: 'null',
    documentation: 'Represents NULL value.',
  },

  void: {
    type: 'void',
    documentation: 'Represents no value.',
  },

  undefined: {
    type: 'void',
    documentation: 'Represents no value.',
  },

  phantom: {
    type: 'phantom',
    documentation:
      'Phantom type. Does not affect the data type, validation, or schema. Discoverable via runtime type traversal.',
  },
}
