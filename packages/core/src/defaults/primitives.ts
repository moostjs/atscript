import type { TPrimitiveConfig } from '../parser/nodes'

const positive: Partial<TPrimitiveConfig> = {
  documentation: 'Number that greater than or equal to zero.',
  expect: {
    min: 0,
  },
}

const negative: Partial<TPrimitiveConfig> = {
  documentation: 'Number that less than or equal to zero.',
  expect: {
    max: 0,
  },
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
        expect: {
          pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          message: 'Invalid email format.',
        },
      },
      phone: {
        documentation: 'Represents an phone number.',
        expect: {
          pattern: /^\+?[0-9\s-]{10,15}$/,
          message: 'Invalid phone number format.',
        },
      },
      date: {
        documentation: 'Represents a date string.',
        expect: {
          pattern: [
            /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
            /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
            /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
            /^\d{1,2} [A-Za-z]+ \d{4}$/, // D Month YYYY
          ],
          message: 'Invalid date format.',
        },
      },
      isoDate: {
        documentation: 'Represents a date string in ISO format.',
        expect: {
          pattern: [
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, // UTC ISO 8601
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?([+-]\d{2}:\d{2})$/, // ISO 8601 with timezone
          ],
          message: 'Invalid ISO date format.',
        },
      },
      uuid: {
        documentation: 'Represents a UUID.',
        expect: {
          pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          message: 'Invalid UUID format.',
        },
      },
      required: {
        documentation: 'Non-empty string that contains at least one non-whitespace character.',
        expect: {
          required: true,
        },
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
        expect: { int: true },
      },
      timestamp: {
        documentation: 'Represents a timestamp.',
        expect: { int: true },
      },
    },
  },

  boolean: {
    type: 'boolean',
    documentation: 'Represents true/false values.',
    extensions: {
      required: {
        documentation: 'Boolean that must be true. Useful for checkboxes like "accept terms".',
        expect: {
          required: true,
        },
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
