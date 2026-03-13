import type { TPrimitiveConfig } from '../parser/nodes'

const IPV4_PATTERN = '^((25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)$'
const IPV6_PATTERN = '^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$'

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
      url: {
        documentation: 'Represents a URL.',
        annotations: {
          'expect.pattern': {
            pattern: '^https?:\\/\\/[^\\s]+$',
            message: 'Invalid URL format.',
          },
        },
      },
      ipv4: {
        documentation: 'Represents an IPv4 address.',
        annotations: {
          'expect.pattern': {
            pattern: IPV4_PATTERN,
            message: 'Invalid IPv4 address.',
          },
        },
      },
      ipv6: {
        documentation: 'Represents an IPv6 address.',
        annotations: {
          'expect.pattern': {
            pattern: IPV6_PATTERN,
            flags: 'i',
            message: 'Invalid IPv6 address.',
          },
        },
      },
      ip: {
        documentation: 'Represents an IP address (IPv4 or IPv6).',
        annotations: {
          'expect.pattern': {
            pattern: `(?:${IPV4_PATTERN.slice(1, -1)})|(?:${IPV6_PATTERN.slice(1, -1)})`,
            flags: 'i',
            message: 'Invalid IP address.',
          },
        },
      },
      char: {
        documentation: 'Represents a single character.',
        annotations: { 'expect.minLength': 1, 'expect.maxLength': 1 },
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
        documentation: 'Represents an integer number.',
        annotations: { 'expect.int': true },
        extensions: {
          ...positiveOrNegative,
          int8: {
            tags: ['int8'],
            documentation: 'Signed 8-bit integer (-128 to 127).',
            annotations: { 'expect.min': -128, 'expect.max': 127 },
          },
          int16: {
            tags: ['int16'],
            documentation: 'Signed 16-bit integer (-32768 to 32767).',
            annotations: { 'expect.min': -32768, 'expect.max': 32767 },
          },
          int32: {
            tags: ['int32'],
            documentation: 'Signed 32-bit integer.',
            annotations: { 'expect.min': -2147483648, 'expect.max': 2147483647 },
          },
          int64: {
            tags: ['int64'],
            documentation: 'Signed 64-bit integer (clamped to JS safe integer range).',
            annotations: { 'expect.min': Number.MIN_SAFE_INTEGER, 'expect.max': Number.MAX_SAFE_INTEGER },
          },
          uint8: {
            tags: ['uint8'],
            documentation: 'Unsigned 8-bit integer (0 to 255).',
            annotations: { 'expect.min': 0, 'expect.max': 255 },
            extensions: {
              byte: {
                tags: ['byte'],
                documentation: 'Byte value (alias for uint8).',
              },
            },
          },
          uint16: {
            tags: ['uint16'],
            documentation: 'Unsigned 16-bit integer (0 to 65535).',
            annotations: { 'expect.min': 0, 'expect.max': 65535 },
            extensions: {
              port: {
                tags: ['port'],
                documentation: 'Network port number (0 to 65535).',
              },
            },
          },
          uint32: {
            tags: ['uint32'],
            documentation: 'Unsigned 32-bit integer (0 to 4294967295).',
            annotations: { 'expect.min': 0, 'expect.max': 4294967295 },
          },
          uint64: {
            tags: ['uint64'],
            documentation: 'Unsigned 64-bit integer (clamped to JS safe integer range).',
            annotations: { 'expect.min': 0, 'expect.max': Number.MAX_SAFE_INTEGER },
          },
        },
      },
      timestamp: {
        documentation: 'Represents a timestamp.',
        annotations: { 'expect.int': true },
        extensions: {
          created: {
            documentation:
              'Timestamp auto-set on creation. Auto-applies @db.default.now.',
            tags: ['created'],
            annotations: { 'db.default.now': true },
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

  decimal: {
    type: 'decimal',
    documentation: 'Decimal number stored as string to preserve precision. Use with @db.column.precision.',
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
