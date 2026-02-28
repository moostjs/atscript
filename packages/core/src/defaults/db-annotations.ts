import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'
import { isPrimitive, isRef } from '../parser/nodes'
import type { TMessages } from '../parser/types'

export const dbAnnotations: TAnnotationsTree = {
  table: new AnnotationSpec({
    description:
      'Marks an interface as a database-persisted entity (table in SQL, collection in MongoDB). ' +
      'If the name argument is omitted, the adapter derives the table name from the interface name.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.table "users"\n' +
      'export interface User { ... }\n' +
      '```\n',
    nodeType: ['interface'],
    argument: {
      optional: true,
      name: 'name',
      type: 'string',
      description: 'Table/collection name. If omitted, derived from interface name.',
    },
  }),

  schema: new AnnotationSpec({
    description:
      'Assigns the entity to a database schema/namespace.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.table "users"\n' +
      '@db.schema "auth"\n' +
      'export interface User { ... }\n' +
      '```\n',
    nodeType: ['interface'],
    argument: {
      name: 'name',
      type: 'string',
      description: 'Schema/namespace name.',
    },
  }),

  index: {
    plain: new AnnotationSpec({
      description:
        'Standard (non-unique) index for query performance. ' +
        'Fields sharing the same index name form a composite index.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.index.plain "idx_timeline", "desc"\n' +
        'createdAt: number.timestamp\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      mergeStrategy: 'append',
      argument: [
        {
          optional: true,
          name: 'name',
          type: 'string',
          description: 'Index name / composite group name.',
        },
        {
          optional: true,
          name: 'sort',
          type: 'string',
          values: ['asc', 'desc'],
          description: 'Sort direction. Defaults to "asc".',
        },
      ],
    }),

    unique: new AnnotationSpec({
      description:
        'Unique index — ensures no two rows/documents have the same value(s). ' +
        'Fields sharing the same index name form a composite unique constraint.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.index.unique "tenant_email"\n' +
        'email: string.email\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      mergeStrategy: 'append',
      argument: {
        optional: true,
        name: 'name',
        type: 'string',
        description: 'Index name / composite group name.',
      },
    }),

    fulltext: new AnnotationSpec({
      description:
        'Full-text search index. ' +
        'Fields sharing the same index name form a composite full-text index.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.index.fulltext "ft_content"\n' +
        'title: string\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      mergeStrategy: 'append',
      argument: {
        optional: true,
        name: 'name',
        type: 'string',
        description: 'Index name / composite group name.',
      },
    }),
  },

  column: new AnnotationSpec({
    description:
      'Overrides the physical column/document-field name in the database.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.column "first_name"\n' +
      'firstName: string\n' +
      '```\n',
    nodeType: ['prop'],
    argument: {
      name: 'name',
      type: 'string',
      description: 'The actual column/field name in the DB.',
    },
  }),

  default: {
    value: new AnnotationSpec({
      description:
        'Sets a static DB-level default value (used in DDL DEFAULT clause). ' +
        'For string fields the value is used as-is; for other types it is parsed as JSON.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.default.value "active"\n' +
        'status: string\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'value',
        type: 'string',
        description:
          'Static default value. Strings used as-is; other types parsed via JSON.parse().',
      },
    }),

    fn: new AnnotationSpec({
      description:
        'Sets a DB-level generated default. The function name is portable — ' +
        'each adapter maps it to the appropriate DB mechanism.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.default.fn "increment"\n' +
        'id: number\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'fn',
        type: 'string',
        values: ['increment', 'uuid', 'now'],
        description: 'Generation function name: "increment", "uuid", or "now".',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        if (!args[0]) {
          return errors
        }
        const fnName = args[0].text
        const validFns = ['increment', 'uuid', 'now']
        if (!validFns.includes(fnName)) {
          errors.push({
            message: `Unknown @db.default.fn "${fnName}" — expected "increment", "uuid", or "now"`,
            severity: 1,
            range: args[0].range,
          })
          return errors
        }

        // Validate type compatibility
        const field = token.parentNode!
        const definition = field.getDefinition()
        if (!definition || !isRef(definition)) {
          return errors
        }
        const unwound = doc.unwindType(definition.id!, definition.chain)
        if (!unwound || !isPrimitive(unwound.def)) {
          return errors
        }
        const baseType = unwound.def.config.type as string

        if (fnName === 'increment' && baseType !== 'number') {
          errors.push({
            message: `@db.default.fn "increment" is not compatible with type "${baseType}" — requires number`,
            severity: 1,
            range: token.range,
          })
        } else if (fnName === 'uuid' && baseType !== 'string') {
          errors.push({
            message: `@db.default.fn "uuid" is not compatible with type "${baseType}" — requires string`,
            severity: 1,
            range: token.range,
          })
        } else if (fnName === 'now' && !['number', 'string'].includes(baseType)) {
          errors.push({
            message: `@db.default.fn "now" is not compatible with type "${baseType}" — requires number or string`,
            severity: 1,
            range: token.range,
          })
        }

        return errors
      },
    }),
  },

  ignore: new AnnotationSpec({
    description:
      'Excludes a field from the database schema. The field exists in the Atscript type ' +
      'but has no column in the DB.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.ignore\n' +
      'displayName: string\n' +
      '```\n',
    nodeType: ['prop'],
    validate(token, args, doc) {
      const errors = [] as TMessages
      const field = token.parentNode!
      if (field.countAnnotations('meta.id') > 0) {
        errors.push({
          message: `@db.ignore cannot coexist with @meta.id — a field cannot be both a primary key and excluded from the database`,
          severity: 1,
          range: token.range,
        })
      }
      return errors
    },
  }),
}
