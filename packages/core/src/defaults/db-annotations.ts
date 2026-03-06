import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'
import {
  isArray,
  isInterface,
  isPrimitive,
  isRef,
  isStructure,
  type SemanticNode,
  type SemanticRefNode,
  type SemanticStructureNode,
} from '../parser/nodes'
import type { Token } from '../parser/token'
import type { TMessages } from '../parser/types'
import { findFKFieldsPointingTo, hasAnyViewAnnotation, validateQueryScope, validateRefArgument } from './db-utils'

/**
 * Traverse from annotation token → prop → structure → interface
 * to check if the parent interface has @db.table.
 */
function getDbTableOwner(token: Token): SemanticNode | undefined {
  const field = token.parentNode!
  const struct = field.ownerNode
  if (!struct || !isStructure(struct)) { return undefined }
  const iface = struct.ownerNode
  return (iface && isInterface(iface)) ? iface : struct
}

/**
 * Get the parent structure node from an annotation token.
 */
function getParentStruct(token: Token): SemanticStructureNode | undefined {
  const field = token.parentNode!
  const struct = field.ownerNode
  return (struct && isStructure(struct)) ? struct as SemanticStructureNode : undefined
}

/**
 * Get the parent interface name (for error messages and cross-type resolution).
 */
function getParentTypeName(token: Token): string | undefined {
  const struct = getParentStruct(token)
  if (!struct) { return undefined }
  const iface = struct.ownerNode
  return (iface && isInterface(iface)) ? iface.id! : struct.id
}

/**
 * Extract target type name from a navigational field definition.
 * Unwraps arrays (e.g., `Post[]` → `Post`).
 */
function getNavTargetTypeName(field: SemanticNode): string | undefined {
  let def = field.getDefinition()
  if (isArray(def)) { def = def?.getDefinition() }
  if (isRef(def)) { return def.id! }
  return undefined
}

/**
 * Get the alias argument from an annotation on a field.
 */
function getAnnotationAlias(prop: SemanticNode, annotationName: string): string | undefined {
  const annotations = prop.annotations?.filter(a => a.name === annotationName)
  if (!annotations || annotations.length === 0) { return undefined }
  return annotations[0].args.length > 0 ? annotations[0].args[0].text : undefined
}

/**
 * Factory for @db.rel.onDelete / @db.rel.onUpdate — identical validation logic,
 * only the annotation name and description verb differ.
 */
function refActionAnnotation(name: 'onDelete' | 'onUpdate'): AnnotationSpec {
  return new AnnotationSpec({
    description:
      `Referential action when the target ${name === 'onDelete' ? 'row is deleted' : 'key is updated'}. Only valid on @db.rel.FK fields.\n\n` +
      '**Example:**\n' +
      '```atscript\n' +
      '@db.rel.FK\n' +
      `@db.rel.${name} "cascade"\n` +
      'authorId: User.id\n' +
      '```\n',
    nodeType: ['prop'],
    argument: {
      name: 'action',
      type: 'string',
      values: ['cascade', 'restrict', 'noAction', 'setNull', 'setDefault'],
      description: 'Referential action: "cascade", "restrict", "noAction", "setNull", or "setDefault".',
    },
    validate(token, args, doc) {
      const errors = [] as TMessages
      const field = token.parentNode!

      if (field.countAnnotations('db.rel.FK') === 0) {
        errors.push({
          message: `@db.rel.${name} is only valid on @db.rel.FK fields`,
          severity: 1,
          range: token.range,
        })
      }

      if (args[0]) {
        const action = args[0].text

        if (action === 'setNull' && !field.has('optional')) {
          errors.push({
            message: `@db.rel.${name} "setNull" requires the FK field to be optional (?)`,
            severity: 1,
            range: token.range,
          })
        }

        if (action === 'setDefault' &&
          field.countAnnotations('db.default.value') === 0 &&
          field.countAnnotations('db.default.fn') === 0
        ) {
          errors.push({
            message: `@db.rel.${name} "setDefault" but no @db.default.* annotation — field will have no fallback value`,
            severity: 2,
            range: token.range,
          })
        }
      }

      // D5: Multiple onDelete/onUpdate in same composite FK group
      const fkAlias = getAnnotationAlias(field, 'db.rel.FK')
      if (fkAlias) {
        const struct = getParentStruct(token)
        if (struct) {
          const annotationName = `db.rel.${name}`
          let count = 0
          for (const [, prop] of struct.props) {
            if (prop.countAnnotations('db.rel.FK') === 0) { continue }
            if (prop.countAnnotations(annotationName) === 0) { continue }
            const propFkAlias = getAnnotationAlias(prop, 'db.rel.FK')
            if (propFkAlias === fkAlias) { count++ }
          }
          if (count > 1) {
            errors.push({
              message: `Composite FK '${fkAlias}' has @db.rel.${name} on multiple fields — declare it on exactly one`,
              severity: 1,
              range: token.range,
            })
          }
        }
      }

      return errors
    },
  })
}

export const dbAnnotations: TAnnotationsTree = {
  patch: {
    strategy: new AnnotationSpec({
      description:
        'Defines the **patching strategy** for updating nested objects.\n\n' +
        '- **"replace"** → The field or object will be **fully replaced**.\n' +
        '- **"merge"** → The field or object will be **merged recursively** (applies only to objects, not arrays).\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.patch.strategy "merge"\n' +
        'settings: {\n' +
        '  notifications: boolean\n' +
        '  preferences: {\n' +
        '    theme: string\n' +
        '  }\n' +
        '}\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: false,
      argument: {
        name: 'strategy',
        type: 'string',
        description: 'The **patch strategy** for this field: `"replace"` (default) or `"merge"`.',
        values: ['replace', 'merge'],
      },
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
          if (!isStructure(def) && !isInterface(def) && !isArray(def)) {
            wrongType = true
          }
        } else if (!isStructure(definition) && !isInterface(definition) && !isArray(definition)) {
          wrongType = true
        }
        if (wrongType) {
          errors.push({
            message: `@db.patch.strategy requires a field of type object or array`,
            severity: 1,
            range: token.range,
          })
        }
        return errors
      },
    }),
  },

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
    validate(token, _args, _doc) {
      const errors = [] as TMessages
      const owner = token.parentNode!
      // VW6: Cannot be both @db.table and @db.view
      if (hasAnyViewAnnotation(owner)) {
        errors.push({
          message: 'An interface cannot be both a @db.table and a @db.view',
          severity: 1,
          range: token.range,
        })
      }
      return errors
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
        '\n' +
        '@db.index.fulltext "ft_content", 5\n' +
        'bio: string\n' +
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
          name: 'weight',
          type: 'number',
          description:
            'Field importance in search results (higher = more relevant). ' +
            'Defaults to `1`. Supported by databases with weighted fulltext (e.g., MongoDB, PostgreSQL).',
        },
      ],
    }),
  },

  column: {
    name: new AnnotationSpec({
      description:
        'Overrides the physical column name in the database. ' +
        'For nested (flattened) fields, the parent prefix is still prepended automatically.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.column.name "first_name"\n' +
        'firstName: string\n' +
        '// → physical column: first_name\n' +
        '\n' +
        '// Nested:\n' +
        'address: {\n' +
        '  @db.column.name "zip_code"\n' +
        '  zip: string\n' +
        '}\n' +
        '// → physical column: address__zip_code\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'name',
        type: 'string',
        description: 'The column/field name (without parent prefix for nested fields).',
      },
    }),

    from: new AnnotationSpec({
      description:
        'Specifies the previous local field name for column rename migration. ' +
        'The sync engine generates ALTER TABLE RENAME COLUMN instead of drop+add.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.column.from "zip"\n' +
        'postalCode: string\n' +
        '// Renames address__zip → address__postalCode\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'oldName',
        type: 'string',
        description: 'The old local field name (parent prefix is reconstructed automatically).',
      },
    }),
  },

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

  json: new AnnotationSpec({
    description:
      'Forces a field to be stored as a single JSON column instead of being flattened ' +
      'into separate columns. Use on nested object fields that should remain as JSON ' +
      'in the database.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.json\n' +
      'metadata: { key: string, value: string }\n' +
      '```\n',
    nodeType: ['prop'],
    validate(token, _args, doc) {
      const errors = [] as TMessages
      const field = token.parentNode!
      const definition = field.getDefinition()

      // J1: warning on primitive types
      if (definition && isRef(definition)) {
        const unwound = doc.unwindType(definition.id!, definition.chain)
        if (unwound && isPrimitive(unwound.def)) {
          errors.push({
            message:
              '@db.json on a primitive field has no effect — primitive fields are already stored as scalar columns',
            severity: 2,
            range: token.range,
          })
        }
      }

      return errors
    },
  }),

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

  sync: {
    method: new AnnotationSpec({
      description:
        'Controls how the sync engine handles structural changes that cannot be applied via ALTER TABLE.' +
        '\n\n' +
        '- `"recreate"` — lossless: create temp table, copy data, drop old, rename.\n' +
        '- `"drop"` — lossy: drop table entirely and create from scratch.\n\n' +
        'Without this annotation, structural changes fail with an error requiring manual intervention.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.sync.method "drop"\n' +
        'interface Logs { ... }\n' +
        '```\n',
      nodeType: ['interface'],
      argument: {
        name: 'method',
        type: 'string',
        description: 'Sync method: "drop" (lossy) or "recreate" (lossless with data copy).',
        values: ['drop', 'recreate'],
      },
    }),
  },

  rel: {
    FK: new AnnotationSpec({
      description:
        'Declares a foreign key constraint on this field. The field must use a chain ' +
        'reference type (e.g., `User.id`) to specify the FK target.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.FK\n' +
        'authorId: User.id\n' +
        '\n' +
        '// With alias (required when multiple FKs point to the same type)\n' +
        '@db.rel.FK "author"\n' +
        'authorId: User.id\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        optional: true,
        name: 'alias',
        type: 'string',
        description: 'Alias for pairing with @db.rel.to. Required when multiple FKs point to the same target type.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!
        const alias = args[0]?.text

        // F1: Must be on a @db.table interface
        const owner = getDbTableOwner(token)
        if (!owner || owner.countAnnotations('db.table') === 0) {
          errors.push({
            message: '@db.rel.FK is only valid on fields of a @db.table interface',
            severity: 1,
            range: token.range,
          })
        }

        // F6: Cannot coexist with @db.rel.to or @db.rel.from
        if (field.countAnnotations('db.rel.to') > 0 || field.countAnnotations('db.rel.from') > 0) {
          errors.push({
            message: 'A field cannot be both a foreign key and a navigational property',
            severity: 1,
            range: token.range,
          })
        }

        // F2: Field type must be a chain reference
        const definition = field.getDefinition()
        if (!definition || !isRef(definition) || !(definition as SemanticRefNode).hasChain) {
          errors.push({
            message: `@db.rel.FK requires a chain reference type (e.g. User.id), got scalar type`,
            severity: 1,
            range: token.range,
          })
          return errors
        }

        const ref = definition as SemanticRefNode
        const refTypeName = ref.id!
        const chainFields = ref.chain.map(c => c.text)

        // X2: FK target field must be @meta.id or @db.index.unique
        // F3: FK must resolve to a scalar type
        const targetUnwound = doc.unwindType(refTypeName)
        if (targetUnwound) {
          const targetDef = targetUnwound.def
          if (isInterface(targetDef) || isStructure(targetDef)) {
            const struct = isInterface(targetDef)
              ? targetDef.getDefinition() as SemanticStructureNode | undefined
              : targetDef
            if (struct && isStructure(struct) && chainFields.length > 0) {
              const targetProp = struct.props.get(chainFields[0])
              if (targetProp) {
                // X2: Check that target field is @meta.id or @db.index.unique
                if (targetProp.countAnnotations('meta.id') === 0 && targetProp.countAnnotations('db.index.unique') === 0) {
                  errors.push({
                    message: `@db.rel.FK target '${refTypeName}.${chainFields.join('.')}' is not a primary key (@meta.id) or unique (@db.index.unique) field`,
                    severity: 1,
                    range: token.range,
                  })
                }

                // F3: Check that FK resolves to a scalar type
                const propDef = targetProp.getDefinition()
                if (propDef && isRef(propDef)) {
                  const propUnwound = targetUnwound.doc.unwindType(propDef.id!, propDef.chain)
                  if (propUnwound && !isPrimitive(propUnwound.def)) {
                    errors.push({
                      message: `Foreign key field must resolve to a scalar type (number, string, etc.), got '${propDef.id}'`,
                      severity: 1,
                      range: token.range,
                    })
                  }
                } else if (propDef && !isPrimitive(propDef)) {
                  errors.push({
                    message: `Foreign key field must resolve to a scalar type (number, string, etc.)`,
                    severity: 1,
                    range: token.range,
                  })
                }
              }
            }
          }
        }

        // F4: Multiple unaliased FKs to same target type
        if (!alias) {
          const struct = getParentStruct(token)
          if (struct) {
            let sameTargetCount = 0
            for (const [, prop] of struct.props) {
              if (prop.countAnnotations('db.rel.FK') === 0) { continue }
              const def = prop.getDefinition()
              if (!def || !isRef(def)) { continue }
              const r = def as SemanticRefNode
              if (!r.hasChain) { continue }
              if (r.id === refTypeName) {
                // Check if this FK also has no alias
                const fkAnnotations = prop.annotations?.filter(a => a.name === 'db.rel.FK')
                const hasAlias = fkAnnotations?.some(a => a.args.length > 0)
                if (!hasAlias) { sameTargetCount++ }
              }
            }
            if (sameTargetCount > 1) {
              errors.push({
                message: `Multiple @db.rel.FK fields resolve to type '${refTypeName}' — add alias to disambiguate`,
                severity: 1,
                range: token.range,
              })
            }
          }
        }

        return errors
      },
    }),

    to: new AnnotationSpec({
      description:
        'Forward navigational property — the FK is on **this** interface. ' +
        'The compiler resolves the matching @db.rel.FK by target type or alias.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.to\n' +
        'author?: User\n' +
        '\n' +
        '// With alias\n' +
        '@db.rel.to "author"\n' +
        'author?: User\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        optional: true,
        name: 'alias',
        type: 'string',
        description: 'Match a local @db.rel.FK by alias.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!
        const alias = args[0]?.text

        // T2: Must be on a @db.table interface
        const owner = getDbTableOwner(token)
        if (!owner || owner.countAnnotations('db.table') === 0) {
          errors.push({
            message: '@db.rel.to is only valid on fields of a @db.table interface',
            severity: 1,
            range: token.range,
          })
        }

        // F6: Cannot coexist with @db.rel.FK
        if (field.countAnnotations('db.rel.FK') > 0) {
          errors.push({
            message: 'A field cannot be both a foreign key and a navigational property',
            severity: 1,
            range: token.range,
          })
        }

        const targetTypeName = getNavTargetTypeName(field)
        if (!targetTypeName) {
          return errors
        }

        // T1: Target type must have @db.table
        const unwound = doc.unwindType(targetTypeName)
        if (unwound) {
          const targetDef = unwound.def
          const targetNode = (isInterface(targetDef)) ? targetDef : undefined
          if (!targetNode || targetNode.countAnnotations('db.table') === 0) {
            errors.push({
              message: `@db.rel.to target '${targetTypeName}' is not a @db.table entity`,
              severity: 1,
              range: token.range,
            })
          }
        }

        // T7: .to type must not be a union type
        const fieldDef = field.getDefinition()
        if (fieldDef && fieldDef.entity === 'group' && (fieldDef as any).op === '|') {
          errors.push({
            message: '@db.rel.to does not support union types — use separate relations',
            severity: 1,
            range: token.range,
          })
        }

        // T3/T4/T5/T6: Find matching FK on this interface
        const struct = getParentStruct(token)
        if (struct) {
          // T6: Duplicate .to with same alias/target
          const fieldName = field.id
          for (const [name, prop] of struct.props) {
            if (name === fieldName) { continue }
            if (prop.countAnnotations('db.rel.to') === 0) { continue }
            const propAlias = getAnnotationAlias(prop, 'db.rel.to')
            if ((alias || undefined) === (propAlias || undefined)) {
              const otherTarget = getNavTargetTypeName(prop)
              if (otherTarget === targetTypeName) {
                errors.push({
                  message: `Duplicate @db.rel.to '${alias || targetTypeName}' — only one forward navigational property per alias`,
                  severity: 1,
                  range: token.range,
                })
                break
              }
            }
          }

          if (alias) {
            // T5: Aliased — must find FK with matching alias
            const matches = findFKFieldsPointingTo(doc, struct, targetTypeName, alias)
            if (matches.length === 0) {
              errors.push({
                message: `No @db.rel.FK '${alias}' found on this interface`,
                severity: 1,
                range: token.range,
              })
            }
          } else {
            // T3/T4: Unaliased — find single FK pointing to target type
            const matches = findFKFieldsPointingTo(doc, struct, targetTypeName)
            if (matches.length === 0) {
              errors.push({
                message: `No @db.rel.FK on this interface points to '${targetTypeName}' — did you mean @db.rel.from?`,
                severity: 1,
                range: token.range,
              })
            } else if (matches.length > 1) {
              errors.push({
                message: `Multiple @db.rel.FK fields point to '${targetTypeName}' — add alias to disambiguate`,
                severity: 1,
                range: token.range,
              })
            }
          }
        }

        return errors
      },
    }),

    from: new AnnotationSpec({
      description:
        'Inverse navigational property — the FK is on the **target** interface, pointing back to this one.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.from\n' +
        'posts: Post[]\n' +
        '\n' +
        '// With alias\n' +
        '@db.rel.from "original"\n' +
        'comments: Comment[]\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        optional: true,
        name: 'alias',
        type: 'string',
        description: 'Match a @db.rel.FK on the target interface by alias.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!
        const alias = args[0]?.text

        // R2: Must be on a @db.table interface
        const owner = getDbTableOwner(token)
        if (!owner || owner.countAnnotations('db.table') === 0) {
          errors.push({
            message: '@db.rel.from is only valid on fields of a @db.table interface',
            severity: 1,
            range: token.range,
          })
        }

        // F6: Cannot coexist with @db.rel.FK
        if (field.countAnnotations('db.rel.FK') > 0) {
          errors.push({
            message: 'A field cannot be both a foreign key and a navigational property',
            severity: 1,
            range: token.range,
          })
        }

        const targetTypeName = getNavTargetTypeName(field)
        if (!targetTypeName) {
          return errors
        }

        // R1: Target type must have @db.table
        const unwound = doc.unwindType(targetTypeName)
        if (!unwound) {
          return errors
        }
        const targetDef = unwound.def
        const targetDoc = unwound.doc
        if (!isInterface(targetDef) || targetDef.countAnnotations('db.table') === 0) {
          errors.push({
            message: `@db.rel.from target '${targetTypeName}' is not a @db.table entity`,
            severity: 1,
            range: token.range,
          })
          return errors
        }

        // R6: Duplicate .from with same alias/target
        const struct = getParentStruct(token)
        if (struct) {
          const fieldName = field.id
          for (const [name, prop] of struct.props) {
            if (name === fieldName) { continue }
            if (prop.countAnnotations('db.rel.from') === 0) { continue }
            const propAlias = getAnnotationAlias(prop, 'db.rel.from')
            if ((alias || undefined) === (propAlias || undefined)) {
              const otherTarget = getNavTargetTypeName(prop)
              if (otherTarget === targetTypeName) {
                errors.push({
                  message: `Duplicate @db.rel.from '${alias || targetTypeName}' — only one inverse navigational property per alias`,
                  severity: 1,
                  range: token.range,
                })
                break
              }
            }
          }
        }

        // R3/R4/R5: Find matching FK on the target type pointing back to this type
        const thisTypeName = getParentTypeName(token)
        if (!thisTypeName) {
          return errors
        }

        const matches = findFKFieldsPointingTo(targetDoc, targetDef, thisTypeName, alias)
        if (alias) {
          // R5: Aliased — must find FK with matching alias on target
          if (matches.length === 0) {
            errors.push({
              message: `No @db.rel.FK '${alias}' found on '${targetTypeName}'`,
              severity: 1,
              range: token.range,
            })
          }
        } else {
          // R3/R4: Unaliased — find single FK on target pointing back
          if (matches.length === 0) {
            errors.push({
              message: `No @db.rel.FK on '${targetTypeName}' points to '${thisTypeName}'`,
              severity: 1,
              range: token.range,
            })
          } else if (matches.length > 1) {
            errors.push({
              message: `'${targetTypeName}' has multiple @db.rel.FK fields pointing to '${thisTypeName}' — add alias`,
              severity: 1,
              range: token.range,
            })
          }
        }

        // R7: Singular (non-array) from but FK on target not unique
        const fieldDef = field.getDefinition()
        if (!isArray(fieldDef) && matches.length === 1) {
          const fkProp = matches[0].prop
          if (fkProp.countAnnotations('db.index.unique') === 0) {
            errors.push({
              message: `@db.rel.from '${field.id}' has singular type '${targetTypeName}' (1:1) but the FK on '${targetTypeName}' is not @db.index.unique — did you mean '${targetTypeName}[]' (1:N)?`,
              severity: 2,
              range: token.range,
            })
          }
        }

        return errors
      },
    }),

    onDelete: refActionAnnotation('onDelete'),
    onUpdate: refActionAnnotation('onUpdate'),

    via: new AnnotationSpec({
      description:
        'Declares a many-to-many navigational property through an explicit junction table. ' +
        '`@db.rel.via` is self-sufficient — no `@db.rel.from` pairing is needed.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.via PostTag\n' +
        'tags: Tag[]\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'junction',
        type: 'ref',
        description: 'The junction table type (must have @db.table and @db.rel.FK fields pointing to both sides).',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!

        // V6: Cannot coexist with .to or .from
        if (field.countAnnotations('db.rel.to') > 0 || field.countAnnotations('db.rel.from') > 0) {
          errors.push({
            message: '@db.rel.via is self-sufficient — cannot be combined with @db.rel.to or @db.rel.from',
            severity: 1,
            range: token.range,
          })
        }

        // V1: Must be on an array field
        const definition = field.getDefinition()
        if (!isArray(definition)) {
          errors.push({
            message: '@db.rel.via requires an array type (e.g. Tag[])',
            severity: 1,
            range: token.range,
          })
        }

        if (!args[0]) { return errors }

        const junctionName = args[0].text

        // V2: Junction type must have @db.table (via validateRefArgument)
        errors.push(...validateRefArgument(args[0], doc, { requireDbTable: true }))
        if (errors.length > 0) { return errors }

        // Resolve junction type for FK checks
        const junctionUnwound = doc.unwindType(junctionName)
        if (!junctionUnwound) { return errors }
        const junctionDef = junctionUnwound.def
        if (!isInterface(junctionDef)) { return errors }

        // Get this type name and target type name
        const thisTypeName = getParentTypeName(token)
        const targetTypeName = getNavTargetTypeName(field)
        if (!thisTypeName || !targetTypeName) { return errors }

        // V3: Junction must have FK pointing to this type
        const fksToThis = findFKFieldsPointingTo(junctionUnwound.doc, junctionDef, thisTypeName)
        if (fksToThis.length === 0) {
          errors.push({
            message: `Junction '${junctionName}' has no @db.rel.FK pointing to '${thisTypeName}'`,
            severity: 1,
            range: args[0].range,
          })
        } else if (fksToThis.length > 1) {
          // V5: Multiple FKs to same type
          errors.push({
            message: `Junction '${junctionName}' has multiple @db.rel.FK pointing to '${thisTypeName}' — not supported`,
            severity: 1,
            range: args[0].range,
          })
        }

        // V4: Junction must have FK pointing to target type
        // (skip if this === target, e.g. self-referencing M:N — the same FKs serve both)
        if (targetTypeName !== thisTypeName) {
          const fksToTarget = findFKFieldsPointingTo(junctionUnwound.doc, junctionDef, targetTypeName)
          if (fksToTarget.length === 0) {
            errors.push({
              message: `Junction '${junctionName}' has no @db.rel.FK pointing to '${targetTypeName}'`,
              severity: 1,
              range: args[0].range,
            })
          } else if (fksToTarget.length > 1) {
            // V5: Multiple FKs to same type
            errors.push({
              message: `Junction '${junctionName}' has multiple @db.rel.FK pointing to '${targetTypeName}' — not supported`,
              severity: 1,
              range: args[0].range,
            })
          }
        }

        return errors
      },
    }),

    filter: new AnnotationSpec({
      description:
        'Applies a filter to a navigational property, restricting which related records are loaded.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.from\n' +
        '@db.rel.filter `Post.published = true`\n' +
        'publishedPosts: Post[]\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'condition',
        type: 'query',
        description: 'Filter expression restricting which related records are loaded.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!

        const hasTo = field.countAnnotations('db.rel.to') > 0
        const hasFrom = field.countAnnotations('db.rel.from') > 0
        const hasVia = field.countAnnotations('db.rel.via') > 0

        // FL1: Must be on a navigational field
        if (!hasTo && !hasFrom && !hasVia) {
          errors.push({
            message: '@db.rel.filter is only valid on navigational fields (@db.rel.to, @db.rel.from, or @db.rel.via)',
            severity: 1,
            range: token.range,
          })
          return errors
        }

        if (!args[0]?.queryNode) { return errors }

        // Determine scope based on nav type
        const targetTypeName = getNavTargetTypeName(field)
        if (!targetTypeName) { return errors }

        const allowedTypes: string[] = [targetTypeName]
        if (hasVia) {
          // For .via, also allow junction type
          const viaAnnotations = field.annotations?.filter(a => a.name === 'db.rel.via')
          if (viaAnnotations?.[0]?.args[0]) {
            allowedTypes.push(viaAnnotations[0].args[0].text)
          }
        }

        // FL2/FL3: Validate query scope
        errors.push(...validateQueryScope(args[0], allowedTypes, targetTypeName, doc))

        return errors
      },
    }),
  },

  view: {
    name: new AnnotationSpec({
      description:
        'Overrides the view name in the database. If omitted, the adapter derives it from the interface name.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.view.name "active_premium_users"\n' +
        '@db.view.for User\n' +
        'export interface ActivePremiumUser { ... }\n' +
        '```\n',
      nodeType: ['interface'],
      argument: {
        name: 'name',
        type: 'string',
        description: 'The view name in the database.',
      },
      validate(token, _args, _doc) {
        const errors = [] as TMessages
        const owner = token.parentNode!
        // VW6: Cannot be both @db.table and @db.view
        if (owner.countAnnotations('db.table') > 0) {
          errors.push({
            message: 'An interface cannot be both a @db.table and a @db.view',
            severity: 1,
            range: token.range,
          })
        }
        return errors
      },
    }),

    for: new AnnotationSpec({
      description:
        'Specifies the entry/primary table for a computed view. Required for views that map fields via chain refs.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.view.for Order\n' +
        '@db.view.filter `Order.status = \'active\'`\n' +
        'export interface ActiveOrderDetails { ... }\n' +
        '```\n',
      nodeType: ['interface'],
      argument: {
        name: 'entry',
        type: 'ref',
        description: 'The primary/entry table type (must have @db.table).',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const owner = token.parentNode!
        // VW6: Cannot be both @db.table and @db.view
        if (owner.countAnnotations('db.table') > 0) {
          errors.push({
            message: 'An interface cannot be both a @db.table and a @db.view',
            severity: 1,
            range: token.range,
          })
        }
        // Entry type must be @db.table
        if (args[0]) {
          errors.push(...validateRefArgument(args[0], doc, { requireDbTable: true }))
        }
        return errors
      },
    }),

    joins: new AnnotationSpec({
      description:
        'Declares an explicit join for a view. Use when no `@db.rel.*` path exists between the entry table and the target.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.view.for Order\n' +
        '@db.view.joins Warehouse, `Warehouse.regionId = Order.regionId`\n' +
        'export interface OrderWarehouse { ... }\n' +
        '```\n',
      nodeType: ['interface'],
      multiple: true,
      mergeStrategy: 'append',
      argument: [
        {
          name: 'target',
          type: 'ref',
          description: 'The table type to join (must have @db.table).',
        },
        {
          name: 'condition',
          type: 'query',
          description: 'Join condition expression.',
        },
      ],
      validate(token, args, doc) {
        const errors = [] as TMessages
        const owner = token.parentNode!

        // VW1: Must be on a @db.view interface
        if (!hasAnyViewAnnotation(owner) && !args[0]) {
          errors.push({
            message: '@db.view.joins is only valid on @db.view interfaces',
            severity: 1,
            range: token.range,
          })
          return errors
        }

        // Validate join target is @db.table
        if (args[0]) {
          errors.push(...validateRefArgument(args[0], doc, { requireDbTable: true }))
        }

        // VJ3: Must have @db.view.for
        const forAnnotations = owner.annotations?.filter(a => a.name === 'db.view.for')
        const entryTypeName = forAnnotations?.[0]?.args[0]?.text
        if (!entryTypeName) {
          errors.push({
            message: '@db.view.joins requires @db.view.for to identify the entry table',
            severity: 1,
            range: token.range,
          })
          return errors
        }

        // VJ1/VJ2: Validate query scope — only join target and entry table allowed
        if (args[1]?.queryNode && args[0]) {
          const joinTargetName = args[0].text
          errors.push(...validateQueryScope(args[1], [joinTargetName, entryTypeName], entryTypeName, doc))
        }

        return errors
      },
    }),

    filter: new AnnotationSpec({
      description:
        'WHERE clause for a view, filtering which rows are included.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.view.for User\n' +
        '@db.view.filter `User.status = \'active\' and User.age >= 18`\n' +
        'export interface ActiveUser { ... }\n' +
        '```\n',
      nodeType: ['interface'],
      argument: {
        name: 'condition',
        type: 'query',
        description: 'Filter expression for the view WHERE clause.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const owner = token.parentNode!

        // VW2: Must be on a @db.view interface
        if (!hasAnyViewAnnotation(owner) && !args[0]) {
          errors.push({
            message: '@db.view.filter is only valid on @db.view interfaces',
            severity: 1,
            range: token.range,
          })
          return errors
        }

        if (!args[0]?.queryNode) { return errors }

        // VF3: Must have @db.view.for
        const forAnnotations = owner.annotations?.filter(a => a.name === 'db.view.for')
        const entryTypeName = forAnnotations?.[0]?.args[0]?.text
        if (!entryTypeName) {
          errors.push({
            message: '@db.view.filter requires @db.view.for to identify the entry table',
            severity: 1,
            range: token.range,
          })
          return errors
        }

        // Collect all joined tables for scope
        const allowedTypes = [entryTypeName]
        const joinsAnnotations = owner.annotations?.filter(a => a.name === 'db.view.joins')
        if (joinsAnnotations) {
          for (const join of joinsAnnotations) {
            if (join.args[0]) {
              allowedTypes.push(join.args[0].text)
            }
          }
        }

        // VF1/VF2: Validate query scope
        errors.push(...validateQueryScope(args[0], allowedTypes, entryTypeName, doc))

        return errors
      },
    }),

    materialized: new AnnotationSpec({
      description:
        'Marks a view as materialized (precomputed, stored on disk). ' +
        'Supported by PostgreSQL, CockroachDB, Oracle, SQL Server (indexed views), Snowflake. ' +
        'Not applicable to MySQL, SQLite, MongoDB.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.view.materialized\n' +
        '@db.view.for User\n' +
        '@db.view.filter `User.status = \'active\'`\n' +
        'export interface ActiveUsers { ... }\n' +
        '```\n',
      nodeType: ['interface'],
      validate(token, _args, _doc) {
        const errors = [] as TMessages
        const owner = token.parentNode!

        // VW3: Must be on a @db.view interface
        if (!hasAnyViewAnnotation(owner)) {
          errors.push({
            message: '@db.view.materialized is only valid on @db.view interfaces',
            severity: 1,
            range: token.range,
          })
        }

        return errors
      },
    }),
  },
}
